-- ==============================================================================
-- MIGRATION — Revendication « C'est mon document » sans déclaration préalable
-- À exécuter UNE FOIS dans le Supabase SQL Editor. Idempotent.
--
-- Nouvelle RPC `claim_with_lost_declaration` : quand un citoyen clique sur
-- « C'est mon document » alors qu'aucune déclaration de perte n'existe encore,
-- la fonction :
--   1. crée la déclaration de perte à la volée (noms, numéro hashé, photo de
--      référence privée, où/quand, question + réponse secrète),
--   2. lance le matching serveur de cette déclaration (find_matches_for_lost),
--   3. si une correspondance apparaît avec LE document visé, soumet la
--      revendication (claim_match_by_doc) et renvoie son statut,
--   4. sinon, renvoie quand même la déclaration créée : la surveillance
--      continue, le citoyen sera alerté à la prochaine trouvaille.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.claim_with_lost_declaration(
  p_found_doc_id UUID,
  p_full_name TEXT,
  p_doc_number TEXT,
  p_lost_region TEXT,
  p_lost_city TEXT,
  p_approx_zone TEXT DEFAULT NULL,
  p_lost_date DATE DEFAULT NULL,
  p_secret_question TEXT DEFAULT NULL,
  p_secret_answer TEXT DEFAULT NULL,
  p_reference_image_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_doc_type_id UUID;
  v_lost_doc_id UUID;
  v_existing_lost UUID;
  v_match_count INT := 0;
  v_claim JSONB := NULL;
  v_number_hash TEXT;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  -- Le document trouvé visé doit exister et être publié
  SELECT document_type_id INTO v_doc_type_id
  FROM public.found_documents
  WHERE id = p_found_doc_id AND status = 'published';
  IF v_doc_type_id IS NULL THEN
    RAISE EXCEPTION 'Document trouvé introuvable';
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) < 3 THEN
    RAISE EXCEPTION 'Nom complet requis (3 caractères minimum)';
  END IF;
  IF p_doc_number IS NULL OR length(trim(p_doc_number)) < 4 THEN
    RAISE EXCEPTION 'Numéro du document requis (4 caractères minimum)';
  END IF;
  IF p_lost_region IS NULL OR length(trim(p_lost_region)) = 0 THEN
    RAISE EXCEPTION 'Région de perte requise';
  END IF;
  IF p_lost_city IS NULL OR length(trim(p_lost_city)) = 0 THEN
    RAISE EXCEPTION 'Ville de perte requise';
  END IF;

  -- Unicité du hash dans la déclaration (jamais de numéro en clair en base)
  v_number_hash := public.hash_secret(trim(p_doc_number));

  -- Déclaration existante du même citoyen pour le même numéro ? On la réutilise
  -- (évite les doublons en cas de double clic ou de re-soumission).
  SELECT id INTO v_existing_lost
  FROM public.lost_documents
  WHERE seeker_id = v_profile_id
    AND document_type_id = v_doc_type_id
    AND doc_number_hash = v_number_hash
  LIMIT 1;

  IF v_existing_lost IS NOT NULL THEN
    v_lost_doc_id := v_existing_lost;
  ELSE
    INSERT INTO public.lost_documents
      (seeker_id, document_type_id, full_name_search, doc_number_hash,
       doc_number_partial, lost_region, lost_city, approx_loss_zone,
       lost_date_approx, secret_proof_question, secret_proof_answer_hash,
       reference_image_path, status)
    VALUES
      (v_profile_id, v_doc_type_id, trim(p_full_name), v_number_hash,
       '****' || right(regexp_replace(trim(p_doc_number), '\s+', '', 'g'), 4),
       trim(p_lost_region), trim(p_lost_city), nullif(trim(coalesce(p_approx_zone, '')), ''),
       coalesce(p_lost_date, current_date),
       coalesce(p_secret_question, 'Preuve de propriété'),
       CASE WHEN p_secret_answer IS NOT NULL AND length(trim(p_secret_answer)) > 0
            THEN public.hash_secret(p_secret_answer) END,
       p_reference_image_path,
       'published')
    RETURNING id INTO v_lost_doc_id;
  END IF;

  -- Matching serveur : scanne les documents trouvés publiés pour cette déclaration
  v_match_count := public.find_matches_for_lost(v_lost_doc_id);

  -- Soumission de la revendication si une correspondance couvre LE document visé
  IF v_match_count > 0 THEN
    BEGIN
      v_claim := to_jsonb(public.claim_match_by_doc(
        p_found_doc_id,
        coalesce(p_secret_answer, trim(p_doc_number))
      ));
    EXCEPTION WHEN OTHERS THEN
      -- Pas de match direct sur CE document (score insuffisant…) : on ignore,
      -- la déclaration reste active et la surveillance continue.
      v_claim := NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'lost_doc_id', v_lost_doc_id,
    'created', (v_existing_lost IS NULL),
    'match_count', v_match_count,
    'claim', v_claim
  );
END;
$$;

-- Exécution réservée aux utilisateurs authentifiés
REVOKE EXECUTE ON FUNCTION public.claim_with_lost_declaration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_with_lost_declaration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;
