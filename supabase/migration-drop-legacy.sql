-- ==============================================================================
-- MIGRATION PONCTUELLE — Suppression du schéma hérité (À EXÉCUTER AVANT schema.sql)
--
-- Contexte : la base avait été créée avec l'ANCIEN schema.sql (colonnes
-- phone_encrypted, enums à 5 rôles). Le nouveau schéma utilise
-- CREATE TABLE IF NOT EXISTS : il n'écrase PAS ces tables existantes, d'où
-- l'erreur « column f.phone does not exist ».
--
-- ⚠️ À n'exécuter QUE SI les tables sont vides ou de test. C'est le cas ici
-- (vérifié : 0 ligne dans toutes les tables). Ordre : d'abord ce fichier,
-- ensuite supabase/schema.sql.
-- ==============================================================================

-- 1. Fonctions RPC de sécurité (dépendances des politiques RLS à recreer)
DROP FUNCTION IF EXISTS public.claim_match_by_doc(UUID, TEXT);
DROP FUNCTION IF EXISTS public.find_matches_for_lost(UUID);
DROP FUNCTION IF EXISTS public.find_lost_candidates(UUID);
DROP FUNCTION IF EXISTS public.get_unlocked_contacts();
DROP FUNCTION IF EXISTS public.complete_recovery_after_payment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.hash_secret(TEXT);
DROP FUNCTION IF EXISTS public.current_profile_id();
DROP FUNCTION IF EXISTS public.current_profile_role();
DROP FUNCTION IF EXISTS public.is_moderator();
DROP FUNCTION IF EXISTS public.set_updated_at();

-- 2. Tables (ordre dépendances : enfants avant parents)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.recovery_requests CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.lost_documents CASCADE;
DROP TABLE IF EXISTS public.found_documents CASCADE;
DROP TABLE IF EXISTS public.document_types CASCADE;
DROP TABLE IF EXISTS public.site_settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 3. Enums hérités (les nouveaux portent les mêmes noms — DROP nécessaire
--    pour que les CREATE TYPE du schema.sql s'exécutent)
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.doc_status;
DROP TYPE IF EXISTS public.match_status;
DROP TYPE IF EXISTS public.claim_status;
DROP TYPE IF EXISTS public.payment_status;

-- ==============================================================================
-- Fin : exécuter maintenant supabase/schema.sql (il recrée tout, y compris
-- les buckets Storage et le seed des types de documents).
-- ==============================================================================
