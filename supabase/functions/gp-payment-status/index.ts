// =============================================================================
// Edge Function : gp-payment-status — Vérification d'une transaction GeniusPay
// =============================================================================
// Appelée par le frontend au retour du checkout (?payment=success&ref=MTX-...).
// Le webhook GeniusPay reste la source de vérité ; cette fonction permet une
// confirmation immédiate à l'utilisateur quand l'agrégateur a déjà validé.
//
//   1. Authentifie l'appelant (JWT Supabase).
//   2. Interroge GET /api/v1/merchant/payments/{reference} (clés marchandes
//      côté serveur uniquement).
//   3. Si 'completed' : met à jour idempotemment la ligne payments (statut
//      'paid') et débloque la restitution (même logique que gp-webhook).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GP_API_BASE = 'https://geniuspay.ci/api/v1/merchant';
const EXPECTED_FEE_XAF = 2000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return json(405, { error: 'Méthode non autorisée' });
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { paid: false, error: 'Authentification requise' });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return json(401, { paid: false, error: 'Session invalide' });
  }

  const reference = new URL(req.url).searchParams.get('ref') || '';
  if (!/^MTX-[A-Z0-9]+$/i.test(reference)) {
    return json(422, { paid: false, error: 'Référence invalide' });
  }

  const apiKey = Deno.env.get('GENIUSPAY_API_KEY');
  const apiSecret = Deno.env.get('GENIUSPAY_API_SECRET');
  if (!apiKey || !apiSecret) {
    return json(500, { paid: false, error: 'Configuration marchande manquante' });
  }

  // 1. Statut réel côté GeniusPay
  const gpRes = await fetch(`${GP_API_BASE}/payments/${encodeURIComponent(reference)}`, {
    headers: { 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
  });
  const gpBody = await gpRes.json().catch(() => null);
  if (!gpRes.ok || !gpBody?.data) {
    return json(200, { paid: false, status: 'unknown' });
  }
  const tx = gpBody.data;
  const requestId = typeof tx.metadata?.recovery_request_id === 'string'
    ? tx.metadata.recovery_request_id
    : '';

  if (tx.status !== 'completed' || !requestId) {
    return json(200, { paid: false, status: tx.status || 'pending' });
  }

  // 2. Ligne payments existante (créée par gp-create-payment)
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('transaction_ref', reference)
    .single();

  if (payment && payment.status !== 'paid') {
    const now = new Date().toISOString();
    await supabase
      .from('payments')
      .update({ status: 'paid', paid_at: now, updated_at: now })
      .eq('transaction_ref', reference);
  }

  // 3. Déblocage (idempotent — même contrat que gp-webhook)
  const { data: request } = await supabase
    .from('recovery_requests')
    .select('id, status, requester_id')
    .eq('id', requestId)
    .single();
  if (request && request.status === 'info_needed') {
    const now = new Date().toISOString();
    const { data: paidRow } = await supabase
      .from('payments')
      .select('id')
      .eq('recovery_request_id', requestId)
      .eq('user_id', request.requester_id)
      .eq('status', 'paid')
      .limit(1)
      .maybeSingle();
    if (paidRow) {
      await supabase
        .from('recovery_requests')
        .update({ status: 'completed', unlocked_at: now, updated_at: now })
        .eq('id', requestId);
      await supabase.from('audit_logs').insert({
        action: 'recovery_unlocked',
        entity_type: 'recovery_request',
        entity_id: requestId,
        metadata_safe: { provider: 'geniuspay', reference, via: 'payment-status' },
      });
    }
  }

  return json(200, {
    paid: true,
    reference,
    payment: payment || null,
  });
});
