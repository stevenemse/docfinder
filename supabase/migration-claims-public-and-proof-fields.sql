-- ==============================================================================
-- MIGRATION — Demandes publiques, preuve enrichie, config des preuves secrètes
-- À exécuter UNE FOIS dans le Supabase SQL Editor. Idempotent.
--
-- 1) found_documents.has_pending_request : vrai dès qu'une demande de
--    restitution NON REJETÉE existe via un match de ce document.
--    Lisible par tous → badge public « objet d'une recherche ».
-- 2) recovery_requests.proof_image_path : photo justificative optionnelle du
--    demandeur (bucket vault privé, dossier <profile_id>/proofs/).
-- 3) document_types.secret_proof_fields (JSONB) : configuration par type de
--    document des champs de preuve secrète (CNI : nom du père, nom de la mère,
--    date de délivrance, date de naissance, adresse…). Modifiable par l'admin
--    sans redéploiement.
-- ==============================================================================

-- ── 1) Badge public « document recherché » ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'found_documents'
      AND column_name = 'has_pending_request'
  ) THEN
    ALTER TABLE public.found_documents
      ADD COLUMN has_pending_request BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Mise à jour initiale du drapeau (maintien continu assuré par le trigger)
UPDATE public.found_documents fd
SET has_pending_request = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.recovery_requests r
  JOIN public.matches m ON m.id = r.match_id
  WHERE m.found_document_id = fd.id
    AND r.verification_status <> 'rejected'
);

-- Trigger : met à jour le drapeau à chaque changement sur recovery_requests
CREATE OR REPLACE FUNCTION public.sync_found_doc_pending_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_found_doc_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT m.found_document_id INTO v_found_doc_id
    FROM public.matches m WHERE m.id = OLD.match_id;
  ELSE
    SELECT m.found_document_id INTO v_found_doc_id
    FROM public.matches m WHERE m.id = NEW.match_id;
  END IF;

  IF v_found_doc_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.found_documents
  SET has_pending_request = EXISTS (
    SELECT 1 FROM public.recovery_requests r
    JOIN public.matches m ON m.id = r.match_id
    WHERE m.found_document_id = v_found_doc_id
      AND r.verification_status <> 'rejected'
  )
  WHERE id = v_found_doc_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pending_request ON public.recovery_requests;
CREATE TRIGGER trg_sync_pending_request
AFTER INSERT OR UPDATE OR DELETE ON public.recovery_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_found_doc_pending_request();

-- ── 2) Photo de preuve du demandeur ─────────────────────────────────────────
ALTER TABLE public.recovery_requests
  ADD COLUMN IF NOT EXISTS proof_image_path TEXT;

-- ── 3) Champs de preuve secrète configurables par type de document ─────────
ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS secret_proof_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Configuration initiale par défaut (l'admin peut l'éditer ensuite).
-- Format : [{ "key": "...", "label": "...", "type": "text|date", "required": true }]
UPDATE public.document_types SET secret_proof_fields = '[
  {"key":"father_name","label":"Nom complet du père","type":"text","required":true},
  {"key":"mother_name","label":"Nom complet de la mère","type":"text","required":true},
  {"key":"issue_date","label":"Date de délivrance","type":"date","required":true},
  {"key":"birth_date","label":"Date de naissance","type":"date","required":true},
  {"key":"address","label":"Adresse (au moment de la délivrance)","type":"text","required":false}
]'::jsonb
WHERE slug = 'cni' AND secret_proof_fields = '[]'::jsonb;

UPDATE public.document_types SET secret_proof_fields = '[
  {"key":"passport_number","label":"Numéro du passeport","type":"text","required":true},
  {"key":"issue_date","label":"Date de délivrance","type":"date","required":true},
  {"key":"expiry_date","label":"Date d''expiration","type":"date","required":true},
  {"key":"issue_place","label":"Lieu de délivrance","type":"text","required":true},
  {"key":"mother_name","label":"Nom complet de la mère","type":"text","required":false}
]'::jsonb
WHERE slug = 'passport' AND secret_proof_fields = '[]'::jsonb;

UPDATE public.document_types SET secret_proof_fields = '[
  {"key":"license_number","label":"Numéro du permis","type":"text","required":true},
  {"key":"categories","label":"Catégories (A, B, C, D)","type":"text","required":true},
  {"key":"issue_date","label":"Date de délivrance","type":"date","required":true},
  {"key":"birth_date","label":"Date de naissance","type":"date","required":true}
]'::jsonb
WHERE slug = 'drivers_license' AND secret_proof_fields = '[]'::jsonb;

UPDATE public.document_types SET secret_proof_fields = '[
  {"key":"student_number","label":"Matricule","type":"text","required":true},
  {"key":"institution","label":"Établissement","type":"text","required":true},
  {"key":"academic_year","label":"Année académique","type":"text","required":true}
]'::jsonb
WHERE slug = 'student_card' AND secret_proof_fields = '[]'::jsonb;

UPDATE public.document_types SET secret_proof_fields = '[
  {"key":"staff_number","label":"Numéro matricule / agent","type":"text","required":true},
  {"key":"organization","label":"Organisme / Ordre professionnel","type":"text","required":true},
  {"key":"issue_date","label":"Date de délivrance","type":"date","required":true}
]'::jsonb
WHERE slug = 'pro_card' AND secret_proof_fields = '[]'::jsonb;

UPDATE public.document_types SET secret_proof_fields = '[
  {"key":"doc_reference","label":"Référence du document","type":"text","required":true},
  {"key":"issue_date","label":"Date de délivrance","type":"date","required":false},
  {"key":"issuing_authority","label":"Autorité émettrice","type":"text","required":false}
]'::jsonb
WHERE slug = 'other' AND secret_proof_fields = '[]'::jsonb;

-- ── 4) RPC de vérification (SECURITY DEFINER, lecture seule) ────────────────
CREATE OR REPLACE FUNCTION public.found_doc_has_request(p_found_doc_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recovery_requests r
    JOIN public.matches m ON m.id = r.match_id
    WHERE m.found_document_id = p_found_doc_id
      AND r.verification_status <> 'rejected'
  );
$$;

GRANT EXECUTE ON FUNCTION public.found_doc_has_request(UUID) TO anon, authenticated;
