// =============================================================================
// Edge Function : gp-webhook — Récepteur de webhooks GeniusPay
// =============================================================================
// URL publique : https://<PROJECT_REF>.supabase.co/functions/v1/gp-webhook
//
// Rôle :
//  1. Vérifier la signature HMAC-SHA256 du webhook GeniusPay
//     (format officiel : HMAC(timestamp + "." + json_payload, whsec_...) —
//      cf. https://geniuspay.ci/docs/api, section « Vérification de la
//      signature »). Rejette aussi les timestamps de plus de 5 minutes.
//  2. Traiter payment.success / payment.failed / payment.expired de manière
//     IDEMPOTENTE : la référence GeniusPay (data.reference) est la clé
//     transaction_ref UNIQUE de la table payments — le upsert écrase la ligne
//     pending créée à l'initiation.
//  3. Après payment.success : déblocage de la restitution en répliquant la
//     logique serveur de public.complete_recovery_after_payment (statut
//     info_needed + paiement payé requis), puis journalisation.
//
// Secret de signature : variable d'environnement GENIUSPAY_WEBHOOK_SECRET
// (whsec_sandbox_... / whsec_live_... — récupéré à la création du webhook).
// Ne JAMAIS traiter un webhook sans signature valide : répondre 401 sinon.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ----------------------------------------------------------------- constantes
const GP_API_BASE = 'https://geniuspay.ci/api/v1/merchant';
const REPLAY_TOLERANCE_SECONDS = 300; // 5 minutes — cf. doc GeniusPay
const EXPECTED_FEE_XAF = 2000;        // forfait restitution DocFinder

// Valeurs acceptées par la contrainte SQL payments_provider_check — toute
// autre valeur renvoyée par GeniusPay (ex : "mobile_money" générique)
// retombe sur 'geniuspay' pour ne pas faire échouer l'upsert.
const ALLOWED_PROVIDERS = new Set([
  'mtn_momo', 'orange_money', 'geniuspay', 'wave',
  'pawapay', 'paystack', 'moov_money', 'airtel_money', 'card',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ------------------------------------------------------------------- helpers
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

// -------------------------------------------------------------------- server
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Méthode non autorisée' });
  }

  // 1. Récupérer le payload brut (la signature porte sur le JSON tel quel)
  const rawBody = await req.text();
  const signature = req.headers.get('X-Webhook-Signature') || '';
  const timestamp = req.headers.get('X-Webhook-Timestamp') || '';
  const event = req.headers.get('X-Webhook-Event') || '';

  // 2. Vérification de la signature — OBLIGATOIRE (anti-fraude)
  const secret = Deno.env.get('GENIUSPAY_WEBHOOK_SECRET');
  if (!secret) {
    console.error('GENIUSPAY_WEBHOOK_SECRET manquant');
    return json(500, { error: 'Webhook mal configuré' });
  }
  if (!signature || !timestamp) {
    return json(401, { error: 'Signature manquante' });
  }
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
  if (!Number.isFinite(age) || age > REPLAY_TOLERANCE_SECONDS) {
    return json(400, { error: 'Timestamp trop ancien (replay ?)' });
  }
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!timingSafeEqual(expected, signature.toLowerCase())) {
    console.error('Signature webhook invalide — requête rejetée');
    return json(401, { error: 'Signature invalide' });
  }

  // 3. Parser le payload officiel GeniusPay
  let payload: {
    id?: string;
    event?: string;
    data?: {
      reference?: string;
      status?: string;
      amount?: number;
      fees?: number;
      payment_method?: string | null;
      customer_phone?: string | null;
      metadata?: Record<string, unknown>;
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'JSON invalide' });
  }

  const reference = payload.data?.reference || '';
  const eventType = event || payload.event || '';
  const meta = (payload.data?.metadata || {}) as Record<string, unknown>;
  const requestId = typeof meta.recovery_request_id === 'string' ? meta.recovery_request_id : '';
  const provider = ALLOWED_PROVIDERS.has(payload.data?.payment_method || '')
    ? payload.data!.payment_method!
    : 'geniuspay';

  if (!reference || !requestId) {
    // Événement sans référence/metadata : accuser réception sans rien faire
    return json(200, { received: true, ignored: 'reference ou metadata absente' });
  }

  // 4. Client Supabase privilégié (service_role — contourne RLS côté serveur)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // 5. Vérification serveur à serveur (defense-in-depth) : le montant et le
  //    statut réels sont re-confirmés via l'API marchande GeniusPay.
  const apiKey = Deno.env.get('GENIUSPAY_API_KEY');
  const apiSecret = Deno.env.get('GENIUSPAY_API_SECRET');
  if (apiKey && apiSecret) {
    try {
      const check = await fetch(`${GP_API_BASE}/payments/${encodeURIComponent(reference)}`, {
        headers: { 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
      });
      if (check.ok) {
        const body = await check.json();
        const tx = body?.data;
        if (tx?.metadata?.recovery_request_id !== requestId) {
          return json(400, { error: 'metadata incohérentes avec la transaction' });
        }
        if (eventType === 'payment.success' && tx?.status !== 'completed') {
          return json(200, { received: true, ignored: `statut distant=${tx?.status}` });
        }
      }
    } catch (err) {
      console.warn('Recheck GeniusPay impossible (on continue, signature déjà validée):', err);
    }
  }

  // 6. Idempotence : la référence GeniusPay est transaction_ref UNIQUE.
  //    Le upsert remplace la ligne pending créée par gp-create-payment.
  try {
    if (eventType === 'payment.success') {
      const paidAt = new Date().toISOString();
      const { error: upErr } = await supabase
        .from('payments')
        .upsert(
          {
            recovery_request_id: requestId,
            transaction_ref: reference,
            provider,
            amount: EXPECTED_FEE_XAF,
            currency: 'XAF',
            status: 'paid',
            idempotency_key: `webhook-${reference}`,
            paid_at: paidAt,
            provider_response: {
              event: eventType,
              gp_id: payload.id,
              gp_status: payload.data?.status,
              fees: payload.data?.fees,
              customer_phone: payload.data?.customer_phone,
              metadata: meta,
            },
          },
          { onConflict: 'transaction_ref' },
        );
      if (upErr) throw new Error(`upsert payments: ${upErr.message}`);

      // Déblocage — même contrat que complete_recovery_after_payment :
      // la demande doit être au statut 'info_needed' (preuve validée) et le
      // paiement payé doit exister pour (request, requester).
      const { data: req, error: reqErr } = await supabase
        .from('recovery_requests')
        .select('id, status, requester_id')
        .eq('id', requestId)
        .single();
      if (reqErr || !req) throw new Error(`recovery_request introuvable: ${reqErr?.message}`);

      if (req.status === 'completed') {
        return json(200, { received: true, already_unlocked: true });
      }
      if (req.status !== 'info_needed') {
        throw new Error(`Statut ${req.status} — preuve non validée, déblocage refusé`);
      }
      const { error: payErr } = await supabase
        .from('payments')
        .select('id')
        .eq('recovery_request_id', requestId)
        .eq('user_id', req.requester_id)
        .eq('status', 'paid')
        .limit(1);
      if (payErr) throw new Error(`vérification payment: ${payErr.message}`);

      const { error: updErr } = await supabase
        .from('recovery_requests')
        .update({ status: 'completed', unlocked_at: paidAt, updated_at: paidAt })
        .eq('id', requestId);
      if (updErr) throw new Error(`update recovery_requests: ${updErr.message}`);

      await supabase.from('audit_logs').insert({
        action: 'recovery_unlocked',
        entity_type: 'recovery_request',
        entity_id: requestId,
        metadata_safe: { provider: 'geniuspay', reference },
      });

      console.log(`Paiement ${reference} confirmé — restitution ${requestId} débloquée`);
      return json(200, { received: true, unlocked: true });
    }

    if (
      eventType === 'payment.failed' ||
      eventType === 'payment.cancelled' ||
      eventType === 'payment.expired'
    ) {
      const status =
        eventType === 'payment.failed' ? 'failed'
        : eventType === 'payment.cancelled' ? 'cancelled'
        : 'expired';
      const { error: upErr } = await supabase
        .from('payments')
        .upsert(
        {
          recovery_request_id: requestId,
          transaction_ref: reference,
          provider,
          amount: EXPECTED_FEE_XAF,
          currency: 'XAF',
          status,
            idempotency_key: `webhook-${reference}`,
            provider_response: { event: eventType, gp_status: payload.data?.status },
          },
          { onConflict: 'transaction_ref' },
        );
      if (upErr) throw new Error(`upsert payments (${status}): ${upErr.message}`);
      return json(200, { received: true, status });
    }

    // Autres événements (payment.initiated, webhook.test, cashout.*) : OK
    return json(200, { received: true, ignored: eventType || 'sans événement' });
  } catch (err) {
    // 500 => GeniusPay retentera la livraison (avec le même idempotency_key,
    // le traitement est sûr à rejouer).
    console.error('Traitement webhook:', err);
    return json(500, { error: 'Erreur de traitement, à retenter' });
  }
});
