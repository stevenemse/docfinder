-- ==============================================================================
-- MIGRATION — Dashboard admin : statistiques, analytics, liste des citoyens
--
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : sans danger si déjà appliqué.
--
-- 1) table page_views : analytics légers (une ligne par visite d'accueil)
-- 2) RPC admin_dashboard_stats : compteurs + séries 14 jours + top régions
--    (SECURITY DEFINER — réservée aux modérateurs/admins)
-- 3) RPC admin_list_profiles : liste des comptes citoyens
-- 4) RPC admin_set_user_status : suspend / réactive un compte
-- 5) Policies admin : audit_logs + page_views en lecture modérateur
-- ==============================================================================

-- 1. Table analytics (visites) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path TEXT NOT NULL DEFAULT '/',
  user_agent TEXT,
  device TEXT,             -- 'mobile' | 'desktop' (détecté côté client)
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Insertion ouverte (anonyme) : un enregistrement de visite ne contient
-- aucune donnée personnelle (pas d'IP, pas d'identifiant utilisateur).
DROP POLICY IF EXISTS "Anyone can record page view" ON public.page_views;
CREATE POLICY "Anyone can record page view" ON public.page_views
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Lecture réservée aux modérateurs
DROP POLICY IF EXISTS "Moderators view page views" ON public.page_views;
CREATE POLICY "Moderators view page views" ON public.page_views
FOR SELECT TO authenticated
USING (public.is_moderator());

-- 2. Statistiques agrégées du dashboard ---------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
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
    'users', (SELECT COUNT(*) FROM public.profiles),
    'citizens', (SELECT COUNT(*) FROM public.profiles WHERE role = 'citizen'),
    'moderators', (SELECT COUNT(*) FROM public.profiles WHERE role IN ('moderator', 'admin')),
    'suspended', (SELECT COUNT(*) FROM public.profiles WHERE status <> 'active'),
    'protectedDocs', (SELECT COUNT(*) FROM public.found_documents),
    'lostDeclarations', (SELECT COUNT(*) FROM public.lost_documents),
    'publishedFound', (SELECT COUNT(*) FROM public.found_documents WHERE status = 'published'),
    'restoredDocs', (SELECT COUNT(*) FROM public.found_documents WHERE status = 'restored'),
    'matches', (SELECT COUNT(*) FROM public.matches),
    'strongMatches', (SELECT COUNT(*) FROM public.matches WHERE match_qualitative = 'forte'),
    'claims', (SELECT COUNT(*) FROM public.recovery_requests),
    'pendingClaims', (SELECT COUNT(*) FROM public.recovery_requests WHERE verification_status = 'pending'),
    'approvedClaims', (SELECT COUNT(*) FROM public.recovery_requests WHERE verification_status = 'approved'),
    'paidTotal', (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE status = 'paid'),
    'visitsTotal', (SELECT COUNT(*) FROM public.page_views),
    'visits7d', (SELECT COUNT(*) FROM public.page_views WHERE visited_at > now() - interval '7 days'),
    'visitsToday', (SELECT COUNT(*) FROM public.page_views WHERE visited_at::date = now()::date),
    'mobileShare', (
      SELECT COALESCE(
        ROUND(100.0 * SUM(CASE WHEN device = 'mobile' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)), 0)
      FROM public.page_views
    ),
    -- Série 14 jours : visites + documents publiés par jour
    'dailySeries', (
      SELECT json_agg(json_build_object(
        'day', d.day,
        'visits', COALESCE(v.c, 0),
        'docs', COALESCE(f.c, 0)
      ) ORDER BY d.day)
      FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT visited_at::date AS day, COUNT(*) AS c FROM public.page_views GROUP BY 1
      ) v ON v.day = d.day::date
      LEFT JOIN (
        SELECT created_at::date AS day, COUNT(*) AS c FROM public.found_documents GROUP BY 1
      ) f ON f.day = d.day::date
    ),
    -- Top 5 régions des documents trouvés
    'topRegions', (
      SELECT COALESCE(json_agg(json_build_object('region', region, 'count', c) ORDER BY c DESC), '[]'::json)
      FROM (
        SELECT region, COUNT(*) AS c FROM public.found_documents GROUP BY region ORDER BY c DESC LIMIT 5
      ) t
    ),
    -- Répartition par type de document
    'docTypeBreakdown', (
      SELECT COALESCE(json_agg(json_build_object('type', t.name, 'count', t.c) ORDER BY t.c DESC), '[]'::json)
      FROM (
        SELECT dt.name AS name, COUNT(*) AS c
        FROM public.found_documents fd
        JOIN public.document_types dt ON dt.id = fd.document_type_id
        GROUP BY dt.name
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 3. Liste des comptes (modérateur) -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS TABLE (
  id UUID,
  role user_role,
  display_name TEXT,
  phone TEXT,
  email TEXT,
  is_verified BOOLEAN,
  status TEXT,
  lost_count BIGINT,
  found_count BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.role, p.display_name, p.phone, p.email, p.is_verified, p.status,
    (SELECT COUNT(*) FROM public.lost_documents l WHERE l.seeker_id = p.id),
    (SELECT COUNT(*) FROM public.found_documents f WHERE f.finder_id = p.id),
    p.created_at
  FROM public.profiles p
  ORDER BY p.created_at DESC;
$$;

-- 4. Suspension / réactivation d'un compte (modérateur) ------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_profile_id UUID, p_status TEXT)
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
  IF p_profile_id = public.current_profile_id() THEN
    RAISE EXCEPTION 'Impossible de modifier son propre statut';
  END IF;

  UPDATE public.profiles SET status = p_status, updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata_safe)
  VALUES (public.current_profile_id(), 'ADMIN_SET_USER_STATUS', 'profiles', p_profile_id,
          jsonb_build_object('new_status', p_status));
END;
$$;

-- 5. Policies : audit_logs lisibles par les modérateurs ------------------------
DROP POLICY IF EXISTS "Moderators View Audit Logs" ON public.audit_logs;
CREATE POLICY "Moderators View Audit Logs" ON public.audit_logs
FOR SELECT USING (public.is_moderator());
