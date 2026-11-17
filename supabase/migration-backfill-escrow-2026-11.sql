-- ==============================================================================
-- BACKFILL — Séquestre (payouts) des paiements antérieurs au trigger
-- Exécuté en production le 17/11/2026 (2 lignes / 4 000 FCFA, finder « Marie
-- Citoyenne Live »). Conservé pour reproductibilité : rejouable sans risque.
--
-- Contexte : trg_escrow_on_payment / create_escrow_on_payment() n'ont été
-- installés qu'après les 3 paiements 'paid' de septembre 2026. Le trigger a été
-- vérifié actif (tgenabled='O') et testé (transaction annulée → 1 payout créé),
-- mais rien n'avait été rejoué sur l'historique : d'où un séquestre à 0 F.
--
-- Règle métier : un paiement encaissé mais non encore remis au trouveur
-- (= pas de document_handovers) reste 'held'. On ne libère rien ici : la
-- libération se fait à la remise en point relais.
-- ==============================================================================

INSERT INTO public.payouts (recovery_request_id, finder_id, payment_id, amount, currency, status, held_at)
SELECT p.recovery_request_id,
       r.finder_id,
       p.id,
       p.amount,
       'XAF',
       'held',
       COALESCE(p.paid_at, p.created_at)
  FROM public.payments p
  JOIN public.recovery_requests r ON r.id = p.recovery_request_id
 WHERE p.status = 'paid'
   AND NOT EXISTS (
     SELECT 1 FROM public.payouts po WHERE po.recovery_request_id = p.recovery_request_id
   )
 ORDER BY p.paid_at NULLS LAST
ON CONFLICT (recovery_request_id) DO NOTHING;

-- Vérification attendue après exécution :
--   SELECT status, count(*), sum(amount) FROM public.payouts GROUP BY 1;
