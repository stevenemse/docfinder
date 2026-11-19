-- ==============================================================================
-- MIGRATION — Un seul paiement en attente par demande de restitution
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : rejouable sans effet de bord.
--
-- Contexte : la demande ae70a7e4-18e5-4384-bdbc-17bf35b54650 a encaissé DEUX
-- paiements de 2 000 FCFA (SANDBOX_8KD3MSHQIOW45XUL et
-- SANDBOX_2EPEMXCXCPCSG8P8) pour un forfait unique : deux checkouts GeniusPay
-- avaient été initiés en parallèle, chacun créant sa ligne 'pending'.
--
-- 1) Nettoyage : les 'pending' qui ne peuvent plus être payés sont expirés.
--    C'est le cas des 2 lignes orphelines de la demande 60c8e161 (rejetée,
--    4 000 F jamais encaissés) qui provoquaient des retentatives webhook.
--    Sur une demande encore payable, seule la ligne la plus récente est gardée.
-- 2) Verrou : index unique partiel => au plus une ligne 'pending' par
--    recovery_request_id. Un second insert concurrent échoue en 23505.
--    Les lignes 'paid'/'failed'/'expired' historiques ne sont pas contraintes.
-- ==============================================================================

-- 1) Expiration des 'pending' non payables
UPDATE public.payments p
   SET status = 'expired',
       updated_at = now()
 WHERE p.status = 'pending'
   AND (
     COALESCE(
       (SELECT r.status::text FROM public.recovery_requests r WHERE r.id = p.recovery_request_id),
       'missing'
     ) <> 'info_needed'
     OR EXISTS (
       SELECT 1
         FROM public.payments p2
        WHERE p2.recovery_request_id = p.recovery_request_id
          AND p2.status = 'pending'
          AND (p2.created_at, p2.id) > (p.created_at, p.id)
     )
   );

-- 2) Verrou anti-double paiement
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending_per_request
  ON public.payments (recovery_request_id)
  WHERE status = 'pending';

-- Vérification attendue après exécution :
--   SELECT recovery_request_id, count(*)
--     FROM public.payments WHERE status = 'pending'
--    GROUP BY 1 HAVING count(*) > 1;   -- 0 ligne
