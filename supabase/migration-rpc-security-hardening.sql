-- ============================================================================
-- Durcissement des RPC — audit sécurité DocFinder (à appliquer en production)
-- ============================================================================
-- Contexte : plusieurs fonctions SECURITY DEFINER (donc exécutées avec les
-- droits de leur propriétaire, RLS contournée) étaient exposées par défaut à
-- `anon` et `authenticated` via PostgREST (/rest/v1/rpc/...).
--
--   CRITIQUE  admin_list_profiles()            : aucun contrôle de rôle → tout
--             appelant obtenait la liste complète des profils (téléphone, email).
--   ÉLEVÉ     get_partner_available_balance()  : solde de n'importe quel partenaire.
--   MOYEN     find_lost_candidates() /
--             find_matches_for_lost()          : matching déclenché sur un dossier
--             qui n'appartient pas à l'appelant.
--   MOYEN     expire_stale_handovers()         : balayage/purge déclenchable par
--             n'importe qui (déni de service léger, écritures en masse).
--   FAIBLE    award_partner_earning(), notify_*(), set_updated_at() : fonctions
--             de trigger inutilement exécutables par les clients.
--
-- Principe retenu : ne pas réécrire les corps métier (risque de régression).
-- On ajoute soit une garde dans la fonction courte, soit un wrapper vérifié,
-- puis on révoque l'exécution directe de la fonction interne.
-- ============================================================================

BEGIN;

-- 1. CRITIQUE — admin_list_profiles : garde modérateur ------------------------
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;

  RETURN QUERY
    SELECT p.id, p.role, p.display_name, p.phone, p.email, p.is_verified, p.status,
      (SELECT COUNT(*) FROM public.lost_documents l WHERE l.seeker_id = p.id),
      (SELECT COUNT(*) FROM public.found_documents f WHERE f.finder_id = p.id),
      p.created_at
    FROM public.profiles p
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated, service_role;

-- 2. ÉLEVÉ — solde partenaire : propriétaire ou modérateur --------------------
CREATE OR REPLACE FUNCTION public.get_partner_balance_checked(p_partner_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF NOT public.is_moderator()
     AND NOT EXISTS (
       SELECT 1 FROM public.partners pt
       WHERE pt.id = p_partner_id AND pt.linked_profile_id = v_profile
     ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN public.get_partner_available_balance(p_partner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_available_balance(UUID) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.get_partner_balance_checked(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_partner_balance_checked(UUID) TO authenticated, service_role;

-- 3. MOYEN — matching : réservé au propriétaire du dossier (ou modérateur) ----
CREATE OR REPLACE FUNCTION public.scan_matches_for_found(p_found_doc UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF NOT public.is_moderator()
     AND NOT EXISTS (
       SELECT 1 FROM public.found_documents f
       WHERE f.id = p_found_doc AND f.finder_id = v_profile
     ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN public.find_lost_candidates(p_found_doc);
END;
$$;

CREATE OR REPLACE FUNCTION public.scan_matches_for_lost(p_lost_doc UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF NOT public.is_moderator()
     AND NOT EXISTS (
       SELECT 1 FROM public.lost_documents l
       WHERE l.id = p_lost_doc AND l.seeker_id = v_profile
     ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN public.find_matches_for_lost(p_lost_doc);
END;
$$;

REVOKE ALL ON FUNCTION public.find_lost_candidates(UUID) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.find_matches_for_lost(UUID) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.scan_matches_for_found(UUID) FROM anon, public;
REVOKE ALL ON FUNCTION public.scan_matches_for_lost(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.scan_matches_for_found(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scan_matches_for_lost(UUID) TO authenticated, service_role;

-- 4. MOYEN — balayage d'expiration : modérateur (ou cron en service_role) ------
CREATE OR REPLACE FUNCTION public.admin_expire_stale_handovers()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Accès réservé aux modérateurs';
  END IF;
  RETURN public.expire_stale_handovers();
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_handovers() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.admin_expire_stale_handovers() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_expire_stale_handovers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_handovers() TO service_role;

-- 5. FAIBLE — fonctions de trigger : aucun accès client -----------------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.award_partner_earning()',
    'public.notify_payment_paid()',
    'public.notify_pickup_verified()',
    'public.notify_partner_status_change()',
    'public.notify_match_push()',
    'public.set_updated_at()',
    'public.sync_found_doc_pending_request()',
    'public.create_escrow_on_payment()'
  ]
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, public', fn);
    EXCEPTION WHEN undefined_function THEN
      -- Fonction absente sur cette base : on continue.
      NULL;
    END;
  END LOOP;
END;
$$;

-- 6. Filet de sécurité — codes de retrait : jamais accessibles en anonyme ------
REVOKE ALL ON FUNCTION public.lookup_pickup(TEXT) FROM anon, public;
REVOKE ALL ON FUNCTION public.confirm_deposit(TEXT) FROM anon, public;
REVOKE ALL ON FUNCTION public.verify_pickup(TEXT, TEXT, TEXT) FROM anon, public;
REVOKE ALL ON FUNCTION public.register_partner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lookup_pickup(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_deposit(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_pickup(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_partner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- Vérifications post-application (à exécuter à la main) :
--
--   -- doit lever « Accès réservé aux modérateurs » pour un citoyen :
--   SELECT * FROM public.admin_list_profiles();
--
--   -- ne doit plus être accessible aux rôles clients :
--   SELECT proname, proacl FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('find_lost_candidates','find_matches_for_lost',
--                     'get_partner_available_balance','expire_stale_handovers');
--
--   -- doit échouer (403) en anonyme :
--   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/admin_list_profiles" \
--        -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{}'
-- ============================================================================
