-- ==============================================================================
-- MIGRATION — ensure_profile : profil automatique au retour OAuth (Google)
-- À exécuter UNE FOIS dans Supabase → SQL Editor. Idempotent.
--
-- Problème résolu : un utilisateur qui se connecte avec Google alors qu'un
-- profil existe DÉJÀ avec son email (compte créé avant via numéro/email)
-- déclenchait « duplicate key value violates unique constraint
-- profiles_email_key » → connexion silencieusement refusée.
--
-- La RPC (SECURITY DEFINER, exécutée avec les droits postgres) :
--   1. Renvoie le profil déjà lié au compte auth courant
--   2. ADOPTe le profil existant portant le même email (liaison de comptes :
--      l'email est vérifié par Google, on relie profil ↔ compte auth)
--   3. Crée sinon un profil citoyen depuis les métadonnées Google
--   4. Gère la course parallèle (double montage React, double onglet)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_email_confirmed boolean;
  v_meta jsonb;
  v_display_name text;
  v_profile public.profiles;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ensure_profile : session authentifiee requise';
  END IF;

  SELECT u.email, u.email_confirmed_at IS NOT NULL, u.raw_user_meta_data
    INTO v_email, v_email_confirmed, v_meta
  FROM auth.users u
  WHERE u.id = v_user_id;

  -- 1) Profil déjà lié à ce compte auth → rien à faire
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_user_id;
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  -- 2) Un profil porte déjà cet email (compte créé avant via numéro/email)
  --    → adoption : on lie le profil au compte auth courant.
  --    ⚠ Sécurité : uniquement si l'email du compte auth est VÉRIFIÉ
  --    (Google le garantit ; empêche la capture de profil via un compte
  --    créé avec l'email de quelqu'un d'autre sans vérification).
  IF v_email IS NOT NULL AND v_email_confirmed THEN
    SELECT * INTO v_profile FROM public.profiles WHERE email = v_email;
    IF FOUND THEN
      UPDATE public.profiles
      SET user_id = v_user_id, updated_at = now()
      WHERE id = v_profile.id
      RETURNING * INTO v_profile;
      RETURN v_profile;
    END IF;
  END IF;

  -- 3) Aucun profil → création citoyen depuis les métadonnées Google
  v_display_name := COALESCE(
    NULLIF(v_meta->>'full_name', ''),
    NULLIF(v_meta->>'name', ''),
    NULLIF(split_part(COALESCE(v_email, ''), '@', 1), ''),
    'Utilisateur'
  );

  INSERT INTO public.profiles
    (user_id, role, display_name, phone, email, is_verified, status)
  VALUES
    (v_user_id, 'citizen', v_display_name, NULL, v_email, true, 'active')
  ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_profile;

  RETURN v_profile;

EXCEPTION
  WHEN unique_violation THEN
    -- Course parallèle (double appel simultané) : on relit le gagnant
    -- par user_id uniquement (jamais par email : éviter de rendre le
    -- profil d'un AUTRE compte si le conflit vient d'un email pris).
    SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_user_id;
    RETURN v_profile;
END;
$$;

-- Sécurité : réservée aux utilisateurs authentifiés (anonymes exclus)
REVOKE ALL ON FUNCTION public.ensure_profile() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;
