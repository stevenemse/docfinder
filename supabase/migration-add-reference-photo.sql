-- ==============================================================================
-- MIGRATION PONCTUELLE — Photo de référence privée (déclarations de perte)
--
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : sans danger si déjà appliqué.
--
-- 1) Nouvelle colonne : chemin vers la photo de référence de la pièce
--    (bucket privé "vault", dossier "<profile_id>/reference/")
-- 2) Politique Storage : les modérateurs DPO peuvent consulter les preuves
--    privées (photos de référence + originaux caviardés) en lecture seule.
-- ==============================================================================

ALTER TABLE public.lost_documents
  ADD COLUMN IF NOT EXISTS reference_image_path TEXT;

-- Lecture des preuves privées par les modérateurs uniquement
DROP POLICY IF EXISTS "Moderators read vault evidence" ON storage.objects;
CREATE POLICY "Moderators read vault evidence" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'vault'
  AND public.is_moderator()
);
