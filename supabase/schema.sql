-- ==============================================================================
-- DOCFINDER CAMEROON - DDL PostgreSQL & RLS Policies (Supabase)
-- Aligné sur src/types/index.ts v2 — Compte Citoyen Unifié & Téléphone-First
--
-- Idempotent : ce script peut être ré-exécuté sans erreur (enums gardées par
-- blocs DO, politiques recréées via DROP POLICY IF EXISTS, seed ON CONFLICT).
-- ==============================================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==============================================================================
-- Enumérations (alignées sur src/types/index.ts)
-- ==============================================================================

-- TS: UserRole = 'citizen' | 'moderator' | 'admin'
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('citizen', 'moderator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TS: DocStatus
DO $$ BEGIN
  CREATE TYPE doc_status AS ENUM (
    'pending_verification', 'published', 'matched', 'claimed',
    'restored', 'rejected', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TS: MatchStatus
DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('suggested', 'reviewing', 'confirmed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TS: ClaimStatus
DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM ('submitted', 'info_needed', 'verified', 'rejected', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TS: PaymentStatus
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================================================================
-- Tables
-- NB : les fonctions SQL (current_profile_id, is_moderator, hash_secret...)
-- sont définies APRÈS les tables — PostgreSQL valide les corps des fonctions
-- LANGUAGE sql à la création, elles ne peuvent donc pas référencer des tables
-- qui n'existent pas encore.
-- ==============================================================================

-- 1. Table: profiles (alignée sur TS Profile : phone en clair, email optionnel)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'citizen',
    display_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,          -- Identifiant principal (+237 6xx xx xx xx)
    email TEXT UNIQUE,                   -- Optionnel — récupération de compte
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Table: document_types
CREATE TABLE IF NOT EXISTS public.document_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    icon_name TEXT,                      -- Mapping icône côté client (lucide-react)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Table: found_documents
CREATE TABLE IF NOT EXISTS public.found_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    finder_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_type_id UUID NOT NULL REFERENCES public.document_types(id),
    title_masked TEXT NOT NULL,          -- ex: "Carte Nationale d'Identité - C***K"
    full_name_normalized TEXT NOT NULL,  -- Pour matching trigram interne (Non public)
    doc_number_hash TEXT NOT NULL,       -- SHA-256 du numéro complet (Non public)
    doc_number_partial TEXT NOT NULL,    -- ex: "1029****45"
    region TEXT NOT NULL,
    city TEXT NOT NULL,
    approx_location TEXT NOT NULL,
    found_date DATE NOT NULL,
    masked_image_url TEXT,               -- Image anonymisée (data URL ou Storage)
    original_image_path TEXT NOT NULL,   -- Storage privé
    additional_notes_private TEXT,
    status doc_status NOT NULL DEFAULT 'pending_verification',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Table: lost_documents
CREATE TABLE IF NOT EXISTS public.lost_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seeker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_type_id UUID NOT NULL REFERENCES public.document_types(id),
    full_name_search TEXT NOT NULL,
    doc_number_hash TEXT,
    doc_number_partial TEXT,
    lost_region TEXT NOT NULL,
    lost_city TEXT NOT NULL,
    approx_loss_zone TEXT,
    lost_date_approx DATE,
    secret_proof_question TEXT,
    secret_proof_answer_hash TEXT,
    status doc_status NOT NULL DEFAULT 'published',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Table: matches
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lost_document_id UUID NOT NULL REFERENCES public.lost_documents(id) ON DELETE CASCADE,
    found_document_id UUID NOT NULL REFERENCES public.found_documents(id) ON DELETE CASCADE,
    score_internal INT NOT NULL CHECK (score_internal BETWEEN 0 AND 100),
    match_qualitative TEXT NOT NULL CHECK (match_qualitative IN ('possible', 'probable', 'forte')),
    status match_status NOT NULL DEFAULT 'suggested',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lost_document_id, found_document_id)
);

-- 6. Table: recovery_requests
CREATE TABLE IF NOT EXISTS public.recovery_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES public.profiles(id),
    finder_id UUID NOT NULL REFERENCES public.profiles(id),
    status claim_status NOT NULL DEFAULT 'submitted',
    verification_proof_submitted TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Table: payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID NOT NULL REFERENCES public.recovery_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    amount INT NOT NULL CHECK (amount > 0), -- En XAF (FCFA)
    currency TEXT NOT NULL DEFAULT 'XAF',
    provider TEXT NOT NULL CHECK (provider IN ('mtn_momo', 'orange_money')), -- TS: PaymentProviderType
    transaction_ref TEXT UNIQUE NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    status payment_status NOT NULL DEFAULT 'pending',
    provider_response JSONB,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Table: reports
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('found_doc', 'user', 'recovery_request')),
    target_id UUID NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 9. Table: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    metadata_safe JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Table: site_settings
CREATE TABLE IF NOT EXISTS public.site_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value_safe JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- Fonctions utilitaires (SECURITY DEFINER : contournent la RLS de `profiles`
-- pour éviter la récursion des politiques entre elles)
-- ==============================================================================

-- ID du profil lié à l'utilisateur authentifié courant (NULL si visiteur)
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Rôle du profil courant
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- L'utilisateur courant est-il modérateur ou admin ?
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role IN ('moderator', 'admin')
  );
$$;

-- ==============================================================================
-- Triggers updated_at (maintiennent updated_at automatiquement)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_found_documents_updated_at ON public.found_documents;
CREATE TRIGGER trg_found_documents_updated_at BEFORE UPDATE ON public.found_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lost_documents_updated_at ON public.lost_documents;
CREATE TRIGGER trg_lost_documents_updated_at BEFORE UPDATE ON public.lost_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_matches_updated_at ON public.matches;
CREATE TRIGGER trg_matches_updated_at BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_recovery_requests_updated_at ON public.recovery_requests;
CREATE TRIGGER trg_recovery_requests_updated_at BEFORE UPDATE ON public.recovery_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- Index de performance (recherche catalogue & scanning de matching)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_found_documents_status_created
  ON public.found_documents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_found_documents_type_region
  ON public.found_documents (document_type_id, region);
CREATE INDEX IF NOT EXISTS idx_lost_documents_type_region
  ON public.lost_documents (document_type_id, lost_region);
CREATE INDEX IF NOT EXISTS idx_matches_found_document
  ON public.matches (found_document_id);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_match
  ON public.recovery_requests (match_id);

-- ==============================================================================
-- SÉCURITÉ : fonctions de hachage & RPC serveur (SECURITY DEFINER)
-- Le client anon/authenticated ne parle à ces fonctions que via des
-- interfaces étroites ; aucune donnée sensible brute ne transite ni n'est
-- stockée en clair.
-- ==============================================================================

-- Normalisation d'accents. NB : sha256() est NATIF depuis PostgreSQL 11 —
-- aucune extension de hachage (pgcrypto) n'est nécessaire, ce qui évite les
-- erreurs "function digest(text, unknown) does not exist" sur Supabase
-- (où pgcrypto vit dans le schéma "extensions").
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Hachage SHA-256 déterministe d'une donnée sensible.
-- Miroir EXACT de normalizeSecret() côté client (src/lib/crypto.ts) :
-- trim → minuscules → accents retirés → espaces/tirets/points/underscores retirés.
CREATE OR REPLACE FUNCTION public.hash_secret(p_raw TEXT)
RETURNS TEXT
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    sha256(
      convert_to(
        lower(
          regexp_replace(
            unaccent(trim(coalesce(p_raw, ''))),
            '[\s\-_.]',
            '',
            'g'
          )
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

-- ---------------------------------------------------------------------------
-- Réclamation d'un document trouvé : la preuve de propriété est hachée SERVEUR
-- puis comparée à la réponse secrète (hachée) du chercheur. Validation
-- instantanée si correcte ; sinon passage en revue modérateur. Le texte brut
-- de la preuve n'est JAMAIS stocké — uniquement son SHA-256.
-- ---------------------------------------------------------------------------
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

  IF v_req_id IS NOT NULL THEN
    UPDATE public.recovery_requests
       SET verification_proof_submitted = v_proof_hash,
           verification_status = v_verif,
           status = CASE WHEN v_verif = 'approved' THEN 'info_needed' ELSE 'submitted' END,
           updated_at = now()
     WHERE id = v_req_id;
  ELSE
    INSERT INTO public.recovery_requests
      (match_id, requester_id, finder_id, status,
       verification_proof_submitted, verification_status, updated_at)
    VALUES
      (v_match_id, v_profile_id, v_finder_id,
       CASE WHEN v_verif = 'approved' THEN 'info_needed' ELSE 'submitted' END,
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

-- ---------------------------------------------------------------------------
-- Matching SERVEUR : une déclaration de perte scanne tous les documents
-- trouvés publiés (inaccessibles en lecture directe aux autres clients) et
-- insère/actualise les correspondances.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_matches_for_lost(p_lost_doc UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lost public.lost_documents%ROWTYPE;
  v_found RECORD;
  v_score INT;
  v_qual TEXT;
  v_count INT := 0;
BEGIN
  SELECT * INTO v_lost FROM public.lost_documents WHERE id = p_lost_doc;
  IF NOT FOUND THEN RETURN 0; END IF;

  FOR v_found IN
    SELECT * FROM public.found_documents
    WHERE status = 'published' AND document_type_id = v_lost.document_type_id
  LOOP
    v_score := 30;
    IF lower(v_lost.lost_region) = lower(v_found.region) THEN v_score := v_score + 20; END IF;
    IF lower(v_lost.lost_city) = lower(v_found.city) THEN v_score := v_score + 20; END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(string_to_array(lower(v_lost.full_name_search), ' ')) AS tok
      WHERE length(btrim(tok)) > 2
        AND v_found.full_name_normalized LIKE '%' || btrim(tok) || '%'
    ) THEN
      v_score := v_score + 25;
    END IF;

    IF v_score >= 50 THEN
      v_qual := CASE WHEN v_score >= 80 THEN 'forte'
                     WHEN v_score >= 65 THEN 'probable'
                     ELSE 'possible' END;
      INSERT INTO public.matches
        (lost_document_id, found_document_id, score_internal, match_qualitative, status, updated_at)
      VALUES
        (v_lost.id, v_found.id, v_score, v_qual, 'suggested', now())
      ON CONFLICT (lost_document_id, found_document_id)
      DO UPDATE SET score_internal = EXCLUDED.score_internal,
                    match_qualitative = EXCLUDED.match_qualitative,
                    updated_at = now();
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Miroir : un document trouvé scanne toutes les déclarations de perte.
CREATE OR REPLACE FUNCTION public.find_lost_candidates(p_found_doc UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_found public.found_documents%ROWTYPE;
  v_lost RECORD;
  v_score INT;
  v_qual TEXT;
  v_count INT := 0;
BEGIN
  SELECT * INTO v_found FROM public.found_documents WHERE id = p_found_doc;
  IF NOT FOUND THEN RETURN 0; END IF;

  FOR v_lost IN
    SELECT * FROM public.lost_documents
    WHERE status = 'published' AND document_type_id = v_found.document_type_id
  LOOP
    v_score := 30;
    IF lower(v_lost.lost_region) = lower(v_found.region) THEN v_score := v_score + 20; END IF;
    IF lower(v_lost.lost_city) = lower(v_found.city) THEN v_score := v_score + 20; END IF;
    IF EXISTS (
      SELECT 1
      FROM unnest(string_to_array(lower(v_lost.full_name_search), ' ')) AS tok
      WHERE length(btrim(tok)) > 2
        AND v_found.full_name_normalized LIKE '%' || btrim(tok) || '%'
    ) THEN
      v_score := v_score + 25;
    END IF;

    IF v_score >= 50 THEN
      v_qual := CASE WHEN v_score >= 80 THEN 'forte'
                     WHEN v_score >= 65 THEN 'probable'
                     ELSE 'possible' END;
      INSERT INTO public.matches
        (lost_document_id, found_document_id, score_internal, match_qualitative, status, updated_at)
      VALUES
        (v_lost.id, v_found.id, v_score, v_qual, 'suggested', now())
      ON CONFLICT (lost_document_id, found_document_id)
      DO UPDATE SET score_internal = EXCLUDED.score_internal,
                    match_qualitative = EXCLUDED.match_qualitative,
                    updated_at = now();
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Contacts trouveur débloqués : le téléphone du trouveur n'est JAMAIS exposé
-- par la RLS directe — il ne transite que par cette RPC, et uniquement pour
-- les demandes du demandeur arrivées au stade "completed" (payées).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unlocked_contacts()
RETURNS TABLE (request_id UUID, display_name TEXT, phone TEXT, pickup_point TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, f.display_name, f.phone,
         'À convenir avec le trouveur — zone : ' || fd.approx_location
  FROM public.recovery_requests r
  JOIN public.matches m ON m.id = r.match_id
  JOIN public.found_documents fd ON fd.id = m.found_document_id
  JOIN public.profiles f ON f.id = r.finder_id
  WHERE r.requester_id = public.current_profile_id()
    AND r.status = 'completed';
$$;

-- ---------------------------------------------------------------------------
-- Déblocage après paiement : marque la demande "completed" (idempotent) et
-- renvoie le contact trouveur. Défense en profondeur : exige une preuve
-- validée ET une ligne de paiement confirmée.
-- NB phase actuelle : la ligne payment est créée par le client (paiement
-- simulé). Lors de l'intégration MoMo réelle, l'INSERT passera uniquement
-- par le webhook service_role et la politique d'INSERT de `payments`
-- sera supprimée.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_recovery_after_payment(
  p_request_id UUID,
  p_provider TEXT
)
RETURNS TABLE (finder_contact JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_status TEXT;
  v_contact JSONB;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT status INTO v_status
  FROM public.recovery_requests
  WHERE id = p_request_id AND requester_id = v_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de restitution introuvable';
  END IF;

  IF v_status = 'completed' THEN
    -- Idempotent : déjà débloquée, on renvoie simplement le contact.
    NULL;
  ELSIF v_status <> 'info_needed' THEN
    RAISE EXCEPTION 'Preuve de propriété non validée — déblocage impossible';
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE recovery_request_id = p_request_id
        AND user_id = v_profile_id
        AND status = 'paid'
    ) THEN
      RAISE EXCEPTION 'Paiement confirmé requis avant le déblocage';
    END IF;

    UPDATE public.recovery_requests
       SET status = 'completed', unlocked_at = now(), updated_at = now()
     WHERE id = p_request_id;

    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata_safe)
    VALUES ('recovery_unlocked', 'recovery_request', p_request_id,
            jsonb_build_object('provider', p_provider));
  END IF;

  SELECT jsonb_build_object(
    'display_name', f.display_name,
    'phone', f.phone,
    'pickup_point', 'À convenir avec le trouveur — zone : ' || fd.approx_location
  ) INTO v_contact
  FROM public.recovery_requests r
  JOIN public.matches m ON m.id = r.match_id
  JOIN public.found_documents fd ON fd.id = m.found_document_id
  JOIN public.profiles f ON f.id = r.finder_id
  WHERE r.id = p_request_id;

  IF v_contact IS NULL THEN
    RAISE EXCEPTION 'Contact trouveur introuvable';
  END IF;

  RETURN QUERY SELECT v_contact;
END;
$$;

-- Exécution réservée aux utilisateurs authentifiés (jamais aux visiteurs anon)
REVOKE EXECUTE ON FUNCTION public.claim_match_by_doc(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_match_by_doc(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.find_matches_for_lost(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.find_matches_for_lost(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.find_lost_candidates(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.find_lost_candidates(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_unlocked_contacts() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_unlocked_contacts() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_recovery_after_payment(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complete_recovery_after_payment(UUID, TEXT) TO authenticated;

-- ==============================================================================
-- STORAGE : bucket public "masked" (images caviardées affichables) et bucket
-- privé "vault" (images originales, lecture jamais exposée au client)
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('masked', 'masked', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vault', 'vault', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read masked images" ON storage.objects;
CREATE POLICY "Public read masked images" ON storage.objects
FOR SELECT USING (bucket_id = 'masked');

DROP POLICY IF EXISTS "Authenticated upload masked" ON storage.objects;
CREATE POLICY "Authenticated upload masked" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'masked');

-- Chaque utilisateur ne gère que les fichiers originaux placés dans son
-- dossier "<profile_id>/..." du bucket privé vault.
DROP POLICY IF EXISTS "Users manage own vault files" ON storage.objects;
CREATE POLICY "Users manage own vault files" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'vault'
  AND (storage.foldername(name))[1] = public.current_profile_id()::text
)
WITH CHECK (
  bucket_id = 'vault'
  AND (storage.foldername(name))[1] = public.current_profile_id()::text
);

-- ==============================================================================
-- ROW LEVEL SECURITY
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.found_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------ profiles --

DROP POLICY IF EXISTS "Users View Own Profile" ON public.profiles;
CREATE POLICY "Users View Own Profile" ON public.profiles
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Moderators View All Profiles" ON public.profiles;
CREATE POLICY "Moderators View All Profiles" ON public.profiles
FOR SELECT USING (public.is_moderator());

-- Nécessaire à l'inscription (authService.register insère le profil après signUp)
DROP POLICY IF EXISTS "Users Insert Own Profile" ON public.profiles;
CREATE POLICY "Users Insert Own Profile" ON public.profiles
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Un utilisateur met à jour son profil mais ne peut pas s'auto-promouvoir de rôle
DROP POLICY IF EXISTS "Users Update Own Profile" ON public.profiles;
CREATE POLICY "Users Update Own Profile" ON public.profiles
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND role = public.current_profile_role());

DROP POLICY IF EXISTS "Admins Manage Profiles" ON public.profiles;
CREATE POLICY "Admins Manage Profiles" ON public.profiles
FOR ALL USING (public.current_profile_role() = 'admin');

-- ------------------------------------------------------------ document_types --

DROP POLICY IF EXISTS "Public Read Active Document Types" ON public.document_types;
CREATE POLICY "Public Read Active Document Types" ON public.document_types
FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Moderators Manage Document Types" ON public.document_types;
CREATE POLICY "Moderators Manage Document Types" ON public.document_types
FOR ALL USING (public.is_moderator());

-- ------------------------------------------------------------ found_documents --

DROP POLICY IF EXISTS "Public Read Published Found Docs" ON public.found_documents;
CREATE POLICY "Public Read Published Found Docs" ON public.found_documents
FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Finder Manage Own Found Docs" ON public.found_documents;
CREATE POLICY "Finder Manage Own Found Docs" ON public.found_documents
FOR ALL USING (finder_id = public.current_profile_id());

DROP POLICY IF EXISTS "Moderators Manage Found Docs" ON public.found_documents;
CREATE POLICY "Moderators Manage Found Docs" ON public.found_documents
FOR ALL USING (public.is_moderator());

-- ------------------------------------------------------------- lost_documents --

DROP POLICY IF EXISTS "Seeker Manage Own Lost Docs" ON public.lost_documents;
CREATE POLICY "Seeker Manage Own Lost Docs" ON public.lost_documents
FOR ALL USING (seeker_id = public.current_profile_id());

DROP POLICY IF EXISTS "Moderators Manage Lost Docs" ON public.lost_documents;
CREATE POLICY "Moderators Manage Lost Docs" ON public.lost_documents
FOR ALL USING (public.is_moderator());

-- NB : pas de lecture publique des déclarations de perte (données personnelles).
-- Le matching cross-utilisateur s'exécute EXCLUSIVEMENT côté serveur via les
-- RPC SECURITY DEFINER find_matches_for_lost / find_lost_candidates (voir
-- section SÉCURITÉ). Aucun client ne peut lire les pertes d'autrui.

-- -------------------------------------------------------------------- matches --

DROP POLICY IF EXISTS "Users View Own Matches" ON public.matches;
CREATE POLICY "Users View Own Matches" ON public.matches
FOR SELECT USING (
    lost_document_id IN (SELECT id FROM public.lost_documents WHERE seeker_id = public.current_profile_id())
    OR found_document_id IN (SELECT id FROM public.found_documents WHERE finder_id = public.current_profile_id())
    OR public.is_moderator()
);

-- Le chercheur et le trouveur concernés peuvent créer/actualiser un match
DROP POLICY IF EXISTS "Match Participants Insert Matches" ON public.matches;
CREATE POLICY "Match Participants Insert Matches" ON public.matches
FOR INSERT WITH CHECK (
    lost_document_id IN (SELECT id FROM public.lost_documents WHERE seeker_id = public.current_profile_id())
    OR found_document_id IN (SELECT id FROM public.found_documents WHERE finder_id = public.current_profile_id())
);

DROP POLICY IF EXISTS "Match Participants Update Matches" ON public.matches;
CREATE POLICY "Match Participants Update Matches" ON public.matches
FOR UPDATE USING (
    lost_document_id IN (SELECT id FROM public.lost_documents WHERE seeker_id = public.current_profile_id())
    OR found_document_id IN (SELECT id FROM public.found_documents WHERE finder_id = public.current_profile_id())
);

DROP POLICY IF EXISTS "Moderators Manage Matches" ON public.matches;
CREATE POLICY "Moderators Manage Matches" ON public.matches
FOR ALL USING (public.is_moderator());

-- ---------------------------------------------------------- recovery_requests --

DROP POLICY IF EXISTS "Users View Own Recovery Requests" ON public.recovery_requests;
CREATE POLICY "Users View Own Recovery Requests" ON public.recovery_requests
FOR SELECT USING (
    requester_id = public.current_profile_id()
    OR finder_id = public.current_profile_id()
    OR public.is_moderator()
);

DROP POLICY IF EXISTS "Requester Inserts Own Recovery Requests" ON public.recovery_requests;
CREATE POLICY "Requester Inserts Own Recovery Requests" ON public.recovery_requests
FOR INSERT WITH CHECK (requester_id = public.current_profile_id());

-- Le chercheur finalise sa demande après paiement (status/unlocked_at)
DROP POLICY IF EXISTS "Requester Updates Own Recovery Requests" ON public.recovery_requests;
CREATE POLICY "Requester Updates Own Recovery Requests" ON public.recovery_requests
FOR UPDATE USING (requester_id = public.current_profile_id());

-- Le modérateur valide ou rejette les preuves de propriété
DROP POLICY IF EXISTS "Moderators Update Recovery Requests" ON public.recovery_requests;
CREATE POLICY "Moderators Update Recovery Requests" ON public.recovery_requests
FOR UPDATE USING (public.is_moderator());

DROP POLICY IF EXISTS "Moderators Delete Recovery Requests" ON public.recovery_requests;
CREATE POLICY "Moderators Delete Recovery Requests" ON public.recovery_requests
FOR DELETE USING (public.is_moderator());

-- ------------------------------------------------------------------- payments --

DROP POLICY IF EXISTS "User View Own Payments" ON public.payments;
CREATE POLICY "User View Own Payments" ON public.payments
FOR SELECT USING (
    user_id = public.current_profile_id()
    OR public.is_moderator()
);

DROP POLICY IF EXISTS "User Inserts Own Payments" ON public.payments;
CREATE POLICY "User Inserts Own Payments" ON public.payments
FOR INSERT WITH CHECK (user_id = public.current_profile_id());

-- NB : les mises à jour de paiement (webhook opérateur) passent par la clé
-- service_role (Edge Function) qui contourne la RLS.

-- -------------------------------------------------------------------- reports --

DROP POLICY IF EXISTS "Users View Own Reports" ON public.reports;
CREATE POLICY "Users View Own Reports" ON public.reports
FOR SELECT USING (
    reporter_id = public.current_profile_id()
    OR public.is_moderator()
);

DROP POLICY IF EXISTS "Users Insert Own Reports" ON public.reports;
CREATE POLICY "Users Insert Own Reports" ON public.reports
FOR INSERT WITH CHECK (reporter_id = public.current_profile_id());

DROP POLICY IF EXISTS "Moderators Manage Reports" ON public.reports;
CREATE POLICY "Moderators Manage Reports" ON public.reports
FOR ALL USING (public.is_moderator());

-- ----------------------------------------------------------------- audit_logs --

-- Lecture réservée à la modération ; l'écriture se fait via service_role
-- (Edge Functions / triggers), pas depuis le client.
DROP POLICY IF EXISTS "Moderators View Audit Logs" ON public.audit_logs;
CREATE POLICY "Moderators View Audit Logs" ON public.audit_logs
FOR SELECT USING (public.is_moderator());

-- -------------------------------------------------------------- site_settings --

DROP POLICY IF EXISTS "Public Read Site Settings" ON public.site_settings;
CREATE POLICY "Public Read Site Settings" ON public.site_settings
FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins Manage Site Settings" ON public.site_settings;
CREATE POLICY "Admins Manage Site Settings" ON public.site_settings
FOR ALL USING (public.current_profile_role() = 'admin');

-- ==============================================================================
-- Seed : types de documents du Cameroun (alignés sur MOCK_DOCUMENT_TYPES
-- de src/lib/supabase.ts — mêmes slugs, ids régénérés en UUID)
-- ==============================================================================

INSERT INTO public.document_types (name, slug, description, icon_name) VALUES
  ('Carte Nationale d''Identité (CNI)', 'cni', 'CNI Camerounaise informatisée ou récépissé', 'CreditCard'),
  ('Passeport Officiel', 'passport', 'Passeport Biométrique République du Cameroun', 'BookOpen'),
  ('Permis de Conduire', 'drivers_license', 'Permis de conduire toutes catégories (A, B, C, D)', 'Car'),
  ('Carte Étudiante / Universitaire', 'student_card', 'Carte d''étudiant (UY1, UY2, Douala, Dschang, Buéa, NGaoundéré)', 'GraduationCap'),
  ('Carte Professionnelle', 'pro_card', 'Ordre des Médecins, Avocats, Fonctionnaires, Entreprises', 'Briefcase'),
  ('Autre Document d''Identité', 'other', 'Carte de séjour, Acte de naissance, Attestation', 'FileText')
ON CONFLICT (slug) DO NOTHING;

-- ==============================================================================
-- Notes de déploiement
-- 1. Exécuter ce script dans le SQL Editor Supabase (ou `supabase db push`).
-- 2. Authentification : dans Authentication → URL Configuration, mettre
--    Site URL = https://docfinder.vercel.app (votre domaine Vercel) et ajouter
--    http://localhost:5173 dans Redirect URLs (dev).
--    Le client utilise l'auth email/mot de passe (email synthétique
--    <tel>@phone.docfinder.cm) : désactiver les confirmations par email dans
--    Authentication → Providers → Email ("Confirm email" OFF) pour que
--    l'inscription par téléphone soit immédiate.
-- 3. Promouvoir un modérateur/admin :
--    UPDATE public.profiles SET role = 'moderator' WHERE phone = '+2376...';
-- 4. Buckets Storage créés par ce script : "masked" (public) et "vault"
--    (privé, un dossier par profil).
-- 5. Phase paiements (plus tard) : Edge Functions + webhook MTN/Orange, puis
--    supprimer la politique d'INSERT de `payments` (écriture service_role
--    uniquement).
-- ===========================================================================
