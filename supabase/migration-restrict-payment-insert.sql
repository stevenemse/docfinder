-- ==============================================================================
-- MIGRATION — Restriction de l'INSERT utilisateur sur public.payments
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : rejouable sans effet de bord.
--
-- FAILLE CORRIGÉE
-- La policy « User Inserts Own Payments » n'imposait que
--   user_id = public.current_profile_id()
-- Un compte authentifié pouvait donc insérer lui-même une ligne
--   status = 'paid'  (montant et provider libres)
-- puis appeler public.complete_recovery_after_payment(), qui constate
-- l'existence d'un paiement 'paid' et débloque la restitution : accès aux
-- coordonnées du trouveur SANS AUCUN PAIEMENT (audit du 19/11/2026).
--
-- NOUVELLE RÈGLE
-- Le seul chemin légitime ouvert à un client est la ligne 'pending' du forfait
-- de restitution : 2 000 XAF, provider 'geniuspay', pour une demande qui lui
-- appartient. Le passage à 'paid' reste réservé au webhook et à la fonction de
-- statut de paiement, qui écrivent en service_role (policy dédiée).
-- gp-create-payment n'est pas affecté : depuis le correctif anti-double
-- paiement, il réserve et met à jour la ligne en service_role.
-- ==============================================================================

DROP POLICY IF EXISTS "User Inserts Own Payments" ON public.payments;

CREATE POLICY "User Inserts Own Payments" ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = public.current_profile_id()
    AND status = 'pending'
    AND amount = 2000
    AND currency = 'XAF'
    AND provider = 'geniuspay'
    AND EXISTS (
      SELECT 1
        FROM public.recovery_requests r
       WHERE r.id = recovery_request_id
         AND r.requester_id = public.current_profile_id()
    )
  );

-- Vérification attendue après exécution (rôle authenticated, transaction
-- annulée) : l'INSERT d'une ligne 'paid' doit lever
--   « new row violates row-level security policy for table "payments" »
-- alors qu'une ligne 'pending' 2 000 XAF geniuspay pour sa propre demande passe.
