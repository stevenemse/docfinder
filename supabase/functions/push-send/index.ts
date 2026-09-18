// ==============================================================================
// Edge Function : push-send — Envoi des notifications push Web Push
// ==============================================================================
// Déclenchée par le hook de match (pg_net) ou par le frontend (test). Elle :
//   1. Vérifie l'appelant (service_role autorisé ; utilisateur authentifié
//      limité à un envoi de test vers ses propres abonnements).
//   2. Récupère les abonnements push des profils ciblés (push_enabled = true).
//   3. Envoie la notification via web-push (VAPID).
// Chaque envoi est journalisé (audit_logs, sans donnée personnelle).
// ==============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.114.0';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:docfinder@gmail.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'VAPID keys invalides', detail: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── Authentification de l'appelant ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Authentification requise' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Vérifie le JWT de l'appelant (anon ou user). service_role passe toujours.
  let callerProfileId: string | null = null;
  let isServiceRole = false;
  try {
    const payloadPart = token.split('.')[1];
    const claims = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
    isServiceRole = claims.role === 'service_role';
    if (!isServiceRole && claims.sub) {
      const { data: prof } = await supabase
        .from('profiles').select('id').eq('user_id', claims.sub).limit(1).single();
      callerProfileId = prof?.id ?? null;
    }
  } catch {
    return new Response(JSON.stringify({ error: 'JWT invalide' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const { profile_ids, payload } = body as {
    profile_ids?: string[];
    payload?: PushPayload;
  };

  if (!payload?.title || !payload?.body) {
    return new Response(JSON.stringify({ error: 'payload.title et payload.body requis' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Un utilisateur non-service_role ne peut notifier QUE lui-même (test).
  let targets = profile_ids ?? [];
  if (!isServiceRole) {
    if (!callerProfileId) {
      return new Response(JSON.stringify({ error: 'Profil introuvable' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    targets = [callerProfileId];
  }
  if (targets.length === 0) {
    return new Response(JSON.stringify({ error: 'profile_ids requis' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── Abonnements ciblés (push_enabled = true côté profil) ────────────────────
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription, profile_id, profiles!inner(push_enabled)')
    .in('profile_id', targets)
    .eq('profiles.push_enabled', true);

  if (error) {
    return new Response(JSON.stringify({ error: 'Lecture abonnements échouée', detail: error.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, gone: 0, message: 'Aucun abonnement actif' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── Envoi ────────────────────────────────────────────────────────────────────
  let sent = 0;
  let gone = 0;
  const deadIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (s: { id: string; endpoint: string; subscription: unknown }) => {
      try {
        await webpush.sendNotification(
          s.subscription as Parameters<typeof webpush.sendNotification>[0],
          JSON.stringify(payload),
          { TTL: 3600, urgency: 'normal' }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 : abonnement expiré → nettoyage
        if (status === 404 || status === 410) {
          gone++;
          deadIds.push(s.id);
        }
      }
    })
  );

  if (deadIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', deadIds);
  }

  return new Response(JSON.stringify({ sent, gone, total: subs.length }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
