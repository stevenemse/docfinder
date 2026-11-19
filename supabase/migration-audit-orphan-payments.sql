-- ==============================================================================
-- MAINTENANCE — Trace d'audit des paiements orphelins du 21/09/2026
-- À exécuter dans le Supabase SQL Editor. Idempotent (garde NOT EXISTS).
--
-- Contexte : la demande 60c8e161-3a39-4628-a82f-bdb127678f90 a été rejetée par
-- un modérateur. Deux checkouts GeniusPay sandbox avaient été ouverts le
-- 21/09/2026 (16:35 et 16:36) sans jamais être payés :
--   SANDBOX_HQV7UI4YKYLTMVWL  (4e814795-f254-4901-b8bf-5bf017bf20e8)
--   SANDBOX_DEN0J6DNYRFFJAXX  (6eee1057-dab9-420f-b03e-0df3e31e9f7c)
-- Ils ne peuvent plus aboutir (aucun encaissement, demande close) et un webhook
-- tardif ne ferait que relancer des traitements inutiles.
--
-- Traitement retenu : statut 'expired' — l'enum payment_status ne propose pas
-- 'abandoned' ; 'expired' décrit exactement un checkout jamais payé et arrivé à
-- échéance. Le passage 'pending' -> 'expired' a été effectué par
-- migration-single-pending-payment.sql ; cette migration ajoute la trace
-- d'audit qui manquait, sans retoucher aux montants ni aux références.
-- ==============================================================================

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_safe)
SELECT NULL,
       'ORPHAN_PAYMENT_EXPIRED',
       'payments',
       p.id,
       jsonb_build_object(
         'status_before', 'pending',
         'status_after', 'expired',
         'transaction_ref', p.transaction_ref,
         'amount', p.amount,
         'currency', p.currency,
         'paid_at', p.paid_at,
         'recovery_request_id', p.recovery_request_id,
         'recovery_request_status', r.status,
         'reason',
           'Demande rejetée : checkout sandbox jamais payé, réconciliation impossible, '
           || 'ligne neutralisée pour éviter tout traitement webhook ultérieur',
         'source', 'maintenance'
       )
  FROM public.payments p
  JOIN public.recovery_requests r ON r.id = p.recovery_request_id
 WHERE p.recovery_request_id = '60c8e161-3a39-4628-a82f-bdb127678f90'
   AND p.status = 'expired'
   AND p.transaction_ref IN ('SANDBOX_HQV7UI4YKYLTMVWL', 'SANDBOX_DEN0J6DNYRFFJAXX')
   AND NOT EXISTS (
     SELECT 1
       FROM public.audit_logs a
      WHERE a.action = 'ORPHAN_PAYMENT_EXPIRED'
        AND a.entity_type = 'payments'
        AND a.entity_id = p.id
   );

-- Vérification attendue après exécution : 2 lignes d'audit, aucune ligne
-- 'pending' pour cette demande.
