-- ==============================================================================
-- MIGRATION PONCTUELLE — Fix RPC claim_match_by_doc (production)
--
-- Symptôme : toute réclamation d'un document trouvé échouait en live avec
--   ERROR: 42804: column "status" is of type claim_status but expression
--          is of type text
-- Cause : le CASE ... END de PL/pgSQL produit du texte non typé, refusé par
--   la colonne enum status (claim_status).
-- Fix : calcul du statut dans une variable typée avec ::claim_status.
--
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : CREATE OR REPLACE, sans danger si déjà appliqué.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.claim_match_by_doc(
  p_found_doc_id UUID,
  p_proof_answer TEXT
)
RETURNS TABLE (
  id UUID,
  match_id UUID,
  status claim_status,
  verification_status TEXT,
  verification_proof_submitted TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_answer_hash TEXT;
  v_match_id UUID;
  v_finder_id UUID;
  v_proof_hash TEXT;
  v_verif TEXT;
  v_req_id UUID;
  v_status claim_status;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  -- Meilleure correspondance existante pour ce document trouvé
  SELECT ld.secret_proof_answer_hash, m.id
    INTO v_answer_hash, v_match_id
  FROM public.matches m
  JOIN public.lost_documents ld ON ld.id = m.lost_document_id
  WHERE m.found_document_id = p_found_doc_id
  ORDER BY m.score_internal DESC, m.created_at ASC
  LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Aucune déclaration de perte correspondante. Déclarez d''abord la perte de ce document.';
  END IF;

  SELECT fd.finder_id INTO v_finder_id
  FROM public.found_documents fd
  WHERE fd.id = p_found_doc_id;

  v_proof_hash := public.hash_secret(p_proof_answer);
  v_verif := CASE
    WHEN v_answer_hash IS NOT NULL AND v_answer_hash = v_proof_hash THEN 'approved'
    ELSE 'pending'
  END;

  -- Dédoublonnage : une seule demande par (correspondance, demandeur)
  SELECT r.id INTO v_req_id
  FROM public.recovery_requests r
  WHERE r.match_id = v_match_id AND r.requester_id = v_profile_id
  LIMIT 1;

  -- v_verif est TEXT : le CASE doit être explicitement converti en claim_status
  -- (sinon « column status is of type claim_status but expression is of type text »).
  v_status := CASE WHEN v_verif = 'approved' THEN 'info_needed'::claim_status
                   ELSE 'submitted'::claim_status END;

  IF v_req_id IS NOT NULL THEN
    UPDATE public.recovery_requests
       SET verification_proof_submitted = v_proof_hash,
           verification_status = v_verif,
           status = v_status,
           updated_at = now()
     WHERE id = v_req_id;
  ELSE
    INSERT INTO public.recovery_requests
      (match_id, requester_id, finder_id, status,
       verification_proof_submitted, verification_status, updated_at)
    VALUES
      (v_match_id, v_profile_id, v_finder_id, v_status,
       v_proof_hash, v_verif, now())
    RETURNING recovery_requests.id INTO v_req_id;
  END IF;

  RETURN QUERY
  SELECT r.id, r.match_id, r.status, r.verification_status,
         r.verification_proof_submitted, r.created_at, r.updated_at
  FROM public.recovery_requests r
  WHERE r.id = v_req_id;
END;
$$;
