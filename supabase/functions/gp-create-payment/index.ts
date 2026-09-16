// =============================================================================
// Edge Function : gp-create-payment — Initiation d'un paiement GeniusPay
// =============================================================================
// Appelée par le frontend (fetch authentifié). Elle :
//   1. Vérifie la session Supabase de l'appelant (JWT Authorization header).
//   2. Valide que la demande de restitution lui appartient et est au statut
//      'info_needed' (preuve de propriété validée par un modérateur).
//   3. Crée la transaction GeniusPay via l'API marchande
//      POST https://geniuspay.ci/api/v1/merchant/payments — mode CHECKOUT
//      (sans payment_method : le client choisit MTN MoMo / Orange Money /
//       Wave / carte sur la page hébergée GeniusPay). Les secrets restent
//      TOUJOURS côté serveur.
//   4. Enregistre la ligne payments au statut 'pending' (la référence
//      GeniusPay sert de transaction_ref UNIQUE — le webhook la transformera
//      en 'paid' de façon idempotente).
//   5. Retourne { checkout_url, reference } au frontend qui redirige.
//
// Variables d'environnement requises :
//   GENIUSPAY_API_KEY     pk_sandbox_... / pk_live_...
//   GENIUSPAY_API_SECRET  sk_sandbox_... / sk_live_...
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GP_API_BASE = 'https://geniuspay.ci/api/v1/merchant';
const FEE_XAF = 2000; // forfait restitution DocFinder

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  if (req.method !== 'POST') {
    return json(405, { error: 'Méthode non autorisée' });
  }

  // 1. Authentification de l'appelant via le JWT Supabase
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Authentification requise' });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authErr || !user) {
    return json(401, { error: 'Session invalide' });
  }

  // Profil de l'appelant
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, display_name, phone')
    .eq('user_id', user.id)
    .single();
  if (profErr || !profile) {
    return json(403, { error: 'Profil introuvable' });
  }

  // 2. Paramètres : recovery_request_id + téléphone à débiter
  let body: { recovery_request_id?: string; phone?: string; return_origin?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'JSON invalide' });
  }
  const requestId = body.recovery_request_id || '';
  const rawPhone = (body.phone || profile.phone || '').replace(/[^0-9+]/g, '');
  if (!requestId) {
    return json(422, { error: 'recovery_request_id requis' });
  }
  if (!rawPhone || rawPhone.replace('+', '').length < 9) {
    return json(422, { error: 'Numéro de téléphone invalide' });
  }
  const phone = rawPhone.startsWith('+') ? rawPhone : `+237${rawPhone.replace(/^0+/, '')}`;

  // 3. La demande doit appartenir à l'appelant et être prête pour le paiement
  const { data: request, error: reqErr } = await supabase
    .from('recovery_requests')
    .select('id, status, requester_id')
    .eq('id', requestId)
    .single();
  if (reqErr || !request) {
    return json(404, { error: 'Demande de restitution introuvable' });
  }
  if (request.requester_id !== profile.id) {
    return json(403, { error: 'Cette demande ne vous appartient pas' });
  }
  if (request.status !== 'info_needed') {
    return json(409, {
      error:
        request.status === 'completed'
          ? 'Restitution déjà débloquée'
          : "Preuve de propriété non encore validée — paiement impossible",
    });
  }

  const apiKey = Deno.env.get('GENIUSPAY_API_KEY');
  const apiSecret = Deno.env.get('GENIUSPAY_API_SECRET');
  if (!apiKey || !apiSecret) {
    console.error('Clés GeniusPay non configurées');
    return json(500, { error: 'Paiement indisponible (configuration marchande manquante)' });
  }

  // 4. Création de la transaction GeniusPay (mode checkout hébergé)
  // Origin de retour : fournie par le frontend (window.location.origin), avec
  // garde-fous (protocole http/https uniquement — jamais une URL arbitraire).
  // Après paiement, GeniusPay redirige vers ?payment=success : l'app reconnaît
  // le retour et réconcilie les paiements pending (gp-payment-status).
  let reference: string;
  let checkoutUrl: string;
  try {
    const rawOrigin = (body.return_origin || req.headers.get('Origin') || '').trim();
    let origin = 'https://docfinder-cm.vercel.app';
    try {
      const u = new URL(rawOrigin);
      if (u.protocol === 'http:' || u.protocol === 'https:') origin = u.origin;
    } catch {
      /* origin par défaut */
    }
    const gpRes = await fetch(`${GP_API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        amount: FEE_XAF,
        currency: 'XOF', // XOF/XAF sont arrimés 1:1 — l'API n'accepte que XOF/EUR/USD
        description: 'DocFinder — Frais de restitution sécurisée',
        customer: {
          name: profile.display_name,
          phone,
        },
        success_url: `${origin}/?payment=success`,
        error_url: `${origin}/?payment=error`,
        metadata: {
          recovery_request_id: requestId,
          user_id: profile.id,
          service: 'docfinder_recovery',
        },
      }),
    });
    const gpText = await gpRes.text();
    let gpBody: {
      success?: boolean;
      data?: { checkout_url?: string; reference?: string; payment_url?: string };
      error?: { message?: string } | string;
    } | null = null;
    try {
      gpBody = JSON.parse(gpText);
    } catch {
      // Réponse non-JSON (page HTML, challenge anti-bot…) — on renvoie un extrait
      const snippet = gpText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
      console.error('GeniusPay init: réponse non-JSON', gpRes.status, snippet);
      return json(502, {
        error: `GeniusPay a répondu HTTP ${gpRes.status} sans JSON${snippet ? ` — ${snippet}` : ''}`,
      });
    }
    if (!gpRes.ok || !gpBody?.data?.checkout_url || !gpBody?.data?.reference) {
      console.error('GeniusPay init error:', gpRes.status, gpText.slice(0, 300));
      const errMsg = typeof gpBody?.error === 'string'
        ? gpBody.error
        : gpBody?.error?.message;
      return json(502, {
        error: errMsg
          ? `GeniusPay (HTTP ${gpRes.status}) : ${errMsg}`
          : `Initialisation refusée par GeniusPay (HTTP ${gpRes.status})`,
      });
    }
    reference = gpBody.data.reference;
    checkoutUrl = gpBody.data.checkout_url || gpBody.data.payment_url!;
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('Appel GeniusPay:', msg);
    return json(502, { error: `GeniusPay injoignable (${msg.slice(0, 120)})` });
  }

  // 5. Ligne payments 'pending' (le webhook GeniusPay la passera en 'paid')
  const { error: payErr } = await supabase.from('payments').insert({
    recovery_request_id: requestId,
    user_id: profile.id,
    amount: FEE_XAF,
    currency: 'XAF',
    provider: 'geniuspay',
    transaction_ref: reference,
    idempotency_key: `init-${reference}`,
    status: 'pending',
    provider_response: { checkout_url: checkoutUrl, environment: 'docfinder-v1' },
  });
  if (payErr) {
    // Doublon de référence improbable ; l'important est de ne pas bloquer le client
    console.error('Insert payment pending:', payErr.message);
  }

  return json(200, { checkout_url: checkoutUrl, reference });
});
