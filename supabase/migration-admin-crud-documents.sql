-- ==============================================================================
-- MIGRATION — CRUD admin : gestion des documents (documents trouvés & pertes)
--
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : sans danger si déjà appliqué.
--
-- 1) RPC admin_list_all_documents : liste COMPLÈTE (tous statuts) des documents
--    trouvés et des déclarations de perte — la console n'est plus limitée aux
--    seuls documents "published" (RLS publique).
-- 2) RPC admin_update_document : édition ciblée par le modérateur
--    (titre caviardé, région, ville, statut). Motif facultatif, journalisé.
-- 3) RPC admin_delete_document : suppression DÉFINITIVE d'un document —
--    MOTIF OBLIGATOIRE (refusé s'il est vide).
--    Les matches / recovery_requests / payments liés partent en CASCADE.
--    Les images du Storage (masked + vault) sont effacées au mieux.
--    Chaque action est journalisée dans audit_logs (acteur + motif horodatés).
-- 4) RPC admin_set_user_status (version 2) : suspension/blocage/réactivation
--    d'un compte — MOTIF OBLIGATOIRE, journalisé. Remplace la version sans
--    motif de migration-admin-dashboard.sql.
-- ==============================================================================

-- 1. Liste complète des documents (trouvés + pertes) --------------------------
CREATE OR REPLACE FUNCTION public.admin_list_all_documents()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;

  SELECT json_build_object(
    'found', COALESCE((
      SELECT json_agg(json_build_object(
        'id', f.id,
        'kind', 'found',
        'title', f.title_masked,
        'status', f.status::text,
        'region', f.region,
        'city', f.city,
        'doc_number_partial', f.doc_number_partial,
        'masked_image_url', f.masked_image_url,
        'original_image_path', f.original_image_path,
        'created_at', f.created_at
      ) ORDER BY f.created_at DESC)
      FROM public.found_documents f
    ), '[]'::json),
    'lost', COALESCE((
      SELECT json_agg(json_build_object(
        'id', l.id,
        'kind', 'lost',
        'title', l.full_name_search,
        'status', l.status::text,
        'region', l.lost_region,
        'city', l.lost_city,
        'doc_number_partial', l.doc_number_partial,
        'reference_image_path', l.reference_image_path,
        'created_at', l.created_at
      ) ORDER BY l.created_at DESC)
      FROM public.lost_documents l
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- 2. Édition d'un document (modérateur) ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_document(
  p_kind TEXT,               -- 'found' | 'lost'
  p_doc_id UUID,
  p_title TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL -- motif facultatif (journalisé)
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;
  IF p_kind NOT IN ('found', 'lost') THEN
    RAISE EXCEPTION 'Type de document invalide';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN (
    'pending_verification', 'published', 'matched', 'claimed',
    'restored', 'rejected', 'archived'
  ) THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;

  IF p_kind = 'found' THEN
    UPDATE public.found_documents SET
      title_masked = COALESCE(p_title, title_masked),
      region       = COALESCE(p_region, region),
      city         = COALESCE(p_city, city),
      status       = COALESCE(p_status::doc_status, status),
      updated_at   = now()
    WHERE id = p_doc_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Document introuvable'; END IF;
  ELSE
    UPDATE public.lost_documents SET
      full_name_search = COALESCE(p_title, full_name_search),
      lost_region      = COALESCE(p_region, lost_region),
      lost_city        = COALESCE(p_city, lost_city),
      status           = COALESCE(p_status::doc_status, status),
      updated_at       = now()
    WHERE id = p_doc_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Document introuvable'; END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_safe)
  VALUES (
    public.current_profile_id(), 'ADMIN_UPDATE_DOCUMENT', p_kind || '_documents', p_doc_id,
    jsonb_build_object(
      'title', p_title, 'region', p_region, 'city', p_city, 'status', p_status,
      'reason', p_reason
    )
  );

  RETURN TRUE;
END;
$$;

-- 3. Suppression définitive d'un document (modérateur) -------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_document(
  p_kind TEXT,
  p_doc_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_masked_url  TEXT;
  v_vault_path  TEXT;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;
  IF p_kind NOT IN ('found', 'lost') THEN
    RAISE EXCEPTION 'Type de document invalide';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Un motif de suppression est obligatoire';
  END IF;

  IF p_kind = 'found' THEN
    SELECT masked_image_url, original_image_path
      INTO v_masked_url, v_vault_path
    FROM public.found_documents WHERE id = p_doc_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Document introuvable'; END IF;

    DELETE FROM public.found_documents WHERE id = p_doc_id;
  ELSE
    SELECT reference_image_path
      INTO v_vault_path
    FROM public.lost_documents WHERE id = p_doc_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Document introuvable'; END IF;

    DELETE FROM public.lost_documents WHERE id = p_doc_id;
  END IF;

  -- Nettoyage du Storage (au mieux — une erreur ici ne doit pas bloquer la
  -- suppression SQL, déjà validée). Bucket public "masked" : URL complète ;
  -- bucket privé "vault" : chemin direct.
  BEGIN
    IF v_masked_url IS NOT NULL AND v_masked_url LIKE '%/masked/%' THEN
      PERFORM public.remove_object_from_masked(
        substring(v_masked_url from 'masked/(.+)$')
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    IF v_vault_path IS NOT NULL THEN
      PERFORM public.remove_object_from_vault(v_vault_path);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_safe)
  VALUES (
    public.current_profile_id(), 'ADMIN_DELETE_DOCUMENT', p_kind || '_documents', p_doc_id,
    jsonb_build_object(
      'masked_url', v_masked_url, 'vault_path', v_vault_path,
      'reason', btrim(p_reason)
    )
  );

  RETURN TRUE;
END;
$$;

-- 4. Helper Storage : suppression dans le bucket public "masked" ----------------
CREATE OR REPLACE FUNCTION public.remove_object_from_masked(p_path TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;
  DELETE FROM storage.objects
  WHERE bucket_id = 'masked' AND name = p_path;
END;
$$;

-- 5. Helper Storage : suppression dans le bucket privé "vault" ------------------
CREATE OR REPLACE FUNCTION public.remove_object_from_vault(p_path TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;
  DELETE FROM storage.objects
  WHERE bucket_id = 'vault' AND name = p_path;
END;
$$;

-- 6. Suspension / blocage / réactivation d'un compte — version 2 ----------------
-- Remplace la version de migration-admin-dashboard.sql : le MOTIF est
-- OBLIGATOIRE (journalisé dans audit_logs avec l'action et l'acteur).
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_profile_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;
  IF p_status NOT IN ('active', 'suspended', 'blocked') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Un motif est obligatoire pour cette action';
  END IF;
  IF p_profile_id = public.current_profile_id() THEN
    RAISE EXCEPTION 'Impossible de modifier son propre statut';
  END IF;

  UPDATE public.profiles SET status = p_status, updated_at = now()
  WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte introuvable'; END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_safe)
  VALUES (
    public.current_profile_id(), 'ADMIN_SET_USER_STATUS', 'profiles', p_profile_id,
    jsonb_build_object('new_status', p_status, 'reason', btrim(p_reason))
  );
END;
$$;
