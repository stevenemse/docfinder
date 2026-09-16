-- ==============================================================================
-- MIGRATION — Intégration GeniusPay (paiements réels)
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : sans danger si déjà appliqué.
--
-- 1) Élargit la contrainte provider de la table payments : GeniusPay est un
--    agrégateur (MTN MoMo, Orange Money, Wave, carte…). On autorise
--    'geniuspay' + les méthodes retournées par l'agrégateur.
-- 2) Autorise le rôle service_role (Edge Function webhook) à insérer et
--    mettre à jour les paiements — c'est LA faille qui bloquerait sinon
--    toute confirmation webhook (aucune policy service_role n'existait).
-- ==============================================================================

-- 1) Élargissement de la contrainte provider (si l'ancienne est encore posée)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_provider_check'
  ) THEN
    ALTER TABLE public.payments
      DROP CONSTRAINT payments_provider_check;
  END IF;
END $$;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_provider_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_provider_check
  CHECK (provider IN (
    'mtn_momo', 'orange_money',        -- historique (mode démo / saisie manuelle)
    'geniuspay',                       -- agrégateur officiel (checkout)
    'wave', 'pawapay', 'paystack',
    'moov_money', 'airtel_money', 'card'
  ));

-- 2) RLS : le rôle service_role (Edge Functions webhook) gère les paiements.
--    Les policies « utilisateur » existantes restent inchangées.
DROP POLICY IF EXISTS "Service Role Manages Payments" ON public.payments;
CREATE POLICY "Service Role Manages Payments" ON public.payments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3) Audit : même ouverture pour la journalisation depuis le webhook
DROP POLICY IF EXISTS "Service Role Inserts Audit Logs" ON public.audit_logs;
CREATE POLICY "Service Role Inserts Audit Logs" ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 4) Aide-mémoire configuration (aucun secret en base) :
--    Supabase Dashboard → Edge Functions → Secrets :
--      GENIUSPAY_API_KEY        = pk_sandbox_... / pk_live_...
--      GENIUSPAY_API_SECRET     = sk_sandbox_... / sk_live_...
--      GENIUSPAY_WEBHOOK_SECRET = whsec_... (retourné à la création du webhook)
--    Dashboard GeniusPay → Développeurs → Webhooks :
--      URL : https://<PROJECT_REF>.supabase.co/functions/v1/gp-webhook
--      Événements : payment.success, payment.failed, payment.cancelled,
--                   payment.expired
