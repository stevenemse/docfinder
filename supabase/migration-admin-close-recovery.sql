-- ==============================================================================
-- MIGRATION — Clôture administrative d'une demande de restitution sans suite
-- À exécuter UNE FOIS. Idempotent (CREATE OR REPLACE).
--
-- Contexte : une demande validée par un modérateur passe en 'info_needed' et
-- attend le paiement du chercheur. Si celui-ci ne paie jamais, la demande reste
-- ouverte indéfiniment : elle pollue les tableaux de bord et bloque la fiche du
-- document (« objet d'une recherche »). Cette RPC permet à un modérateur de la
-- clôturer avec un motif tracé dans audit_logs.
--
-- Sécurité : SECURITY DEFINER + garde is_moderator(), motif obligatoire,
-- statut 'rejected' (jamais 'completed' : on ne simule pas une restitution).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_close_recovery_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status public.claim_status;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Motif obligatoire (10 caractères minimum)';
  END IF;

  SELECT status INTO v_status
    FROM public.recovery_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Demande déjà clôturée';
  END IF;

  UPDATE public.recovery_requests
     SET status = 'rejected',
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_safe)
  VALUES (
    public.current_profile_id(),
    'ADMIN_CLOSE_RECOVERY_REQUEST',
    'recovery_requests',
    p_request_id,
    jsonb_build_object('reason', btrim(p_reason), 'previous_status', v_status::text)
  );
END;
$$;

-- La clé anon ne doit jamais pouvoir l'appeler : la garde interne reste la
-- seconde barrière (cf. audit RPC du 17/11/2026).
REVOKE ALL ON FUNCTION public.admin_close_recovery_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_close_recovery_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_close_recovery_request(UUID, TEXT) TO authenticated;
