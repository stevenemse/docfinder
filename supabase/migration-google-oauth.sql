-- ==============================================================================
-- MIGRATION — Connexion Google (OAuth)
-- À exécuter UNE FOIS dans le Supabase SQL Editor. Idempotent.
--
-- Le caviardage… pardon, la connexion Google ne fournit PAS de numéro de
-- téléphone : le champ `phone` de profiles devient donc optionnel. Il sera
-- complété par l'utilisateur dans son profil (Mon Profil → Informations).
--
-- 1) profiles.phone : NOT NULL → NULL possible (contrainte UNIQUE conservée)
-- 2) Nouvelle politique RLS : l'utilisateur authentifié peut créer SON profil
--    (nécessaire pour l'auto-création au premier login Google)
-- ==============================================================================

-- 1) phone devient nullable (l'UNIQUE reste : deux NULL ne sont jamais en conflit en Postgres)
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;

-- 2) L'utilisateur peut créer son propre profil (génère automatiquement le nom de politique)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname LIKE '%insert_own%'
  ) THEN
    CREATE POLICY "profiles_insert_own" ON public.profiles
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.phone IS
  'Optionnel : identifiant principal des comptes téléphone (+237 6xx…). NULL pour les comptes Google jusqu''à complétion dans Mon Profil.';
