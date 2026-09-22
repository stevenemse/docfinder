-- ==============================================================================
-- MIGRATION — Infrastructure partenaires : dépôt, code de retrait, séquestre
-- À exécuter UNE FOIS. Idempotent. (Appliquée via `supabase db query --linked`.)
--
-- Cycle couvert (étapes 6 → 9 du fonctionnement DocFinder) :
--   6. Paiement séquestré   : dès le paiement 'paid', les fonds sont marqués
--                            'held' (séquestrés sur le compte marchand).
--   7. Dépôt partenaire     : le trouveur dépose le document chez un partenaire
--                            → handover avec code de retrait unique (8 car.)
--                            + QR signé HMAC, associé au nom du destinataire.
--   8. Retrait vérifié      : le partenaire scanne/saisit le code, vérifie le
--                            nom du destinataire, confirme la remise.
--   9. Clôture              : le scan déclenche la libération des fonds
--                            (payout 'released') et clôt la demande.
--
-- Sécurité :
--   - Code de retrait : 8 caractères A-Z (sans O/I) + 2-9 (sans ambiguïté),
--     hashé SHA-256 en base (jamais stocké en clair après vérification).
--   - QR : URL publique #partenaire?code=… + signature HMAC du serveur
--     (gp-hmac-secret) — un QR falsifié est rejeté.
--   - RLS stricte : partenaires lisent les retraits en attente (données
--     minimales), trouveurs voient leurs dépôts, chercheurs leur code.
-- ==============================================================================

-- ── 1) Table partenaires ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'momo_kiosk'
        CHECK (kind IN ('momo_kiosk', 'cybercafe', 'agency', 'other')),
    region TEXT,
    city TEXT,
    address TEXT,
    phone TEXT,
    contact_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Le profil lié (optionnel) : permet au partenaire de se connecter à la
    -- page de scan avec son propre compte (rôle citizen + flag partner).
    linked_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2) Dépôts de documents (handovers) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_handovers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID NOT NULL REFERENCES public.recovery_requests(id) ON DELETE CASCADE,
    finder_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
    -- Code de retrait hashé (SHA-256). Le code en clair n'est visible qu'au
    -- chercheur et au trouveur, généré par la RPC de dépôt.
    pickup_code_hash TEXT NOT NULL,
    -- Nom du destinataire attendu (vérifié par le partenaire avant remise)
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT,
    status TEXT NOT NULL DEFAULT 'deposited'
        CHECK (status IN ('deposited', 'withdrawn', 'returned', 'expired')),
    -- Traçabilité
    deposited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawal_deadline TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    withdrawn_at TIMESTAMPTZ,
    withdrawn_by_partner UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    withdrawn_via TEXT CHECK (withdrawn_via IN ('qr_scan', 'manual_code')),
    return_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Un seul dépôt actif par demande
    UNIQUE (recovery_request_id, status)
);

-- Index de recherche par hash de code (scan partenaire)
CREATE INDEX IF NOT EXISTS idx_handovers_code_hash
  ON public.document_handovers (pickup_code_hash)
  WHERE status = 'deposited';

-- ── 3) Séquestre / libération (payouts) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recovery_request_id UUID NOT NULL UNIQUE REFERENCES public.recovery_requests(id) ON DELETE CASCADE,
    finder_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'XAF',
    -- held = séquestré (paiement reçu) ; released = libéré au retrait vérifié
    status TEXT NOT NULL DEFAULT 'held'
        CHECK (status IN ('held', 'released', 'cancelled')),
    held_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    released_via_handover UUID REFERENCES public.document_handovers(id) ON DELETE SET NULL,
    provider_ref TEXT,           -- référence du transfert MoMo vers le trouveur
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4) RPC : dépôt du document par le trouveur ──────────────────────────────
-- Retourne le code en clair (affiché une seule fois au trouveur + chercheur)
CREATE OR REPLACE FUNCTION public.deposit_document(
  p_recovery_request_id UUID,
  p_partner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_request RECORD;
  v_handover_id UUID;
  v_code TEXT;
  v_existing UUID;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT r.id, r.finder_id, r.status, l.full_name_search
    INTO v_request
  FROM public.recovery_requests r
  JOIN public.lost_documents l ON l.id = (
    SELECT m.lost_document_id FROM public.matches m
    WHERE m.id = (SELECT match_id FROM public.recovery_requests WHERE id = p_recovery_request_id)
  )
  WHERE r.id = p_recovery_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de restitution introuvable';
  END IF;
  IF v_request.finder_id <> v_profile_id THEN
    RAISE EXCEPTION 'Seul le trouveur peut déposer ce document';
  END IF;
  IF v_request.status NOT IN ('info_needed', 'verified') AND v_request.status <> 'completed' THEN
    RAISE EXCEPTION 'La demande doit être validée et payée avant le dépôt';
  END IF;

  -- Le paiement doit être réglé (fonds séquestrés)
  IF NOT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.recovery_request_id = p_recovery_request_id AND p.status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Le paiement doit être confirmé avant le dépôt';
  END IF;

  -- Anti-doublon : un dépôt actif existe déjà ?
  SELECT h.id INTO v_existing
  FROM public.document_handovers h
  WHERE h.recovery_request_id = p_recovery_request_id AND h.status = 'deposited';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Un dépôt actif existe déjà pour cette demande';
  END IF;

  -- Création/maintien du séquestre
  INSERT INTO public.payouts (recovery_request_id, finder_id, amount)
  SELECT p_recovery_request_id, v_profile_id, p.amount
  FROM public.payments p
  WHERE p.recovery_request_id = p_recovery_request_id AND p.status = 'paid'
  ON CONFLICT (recovery_request_id) DO NOTHING;

  -- Génération du code : 8 caractères sans ambiguïté
  v_code := (
    SELECT string_agg(ch, '')
    FROM (
      SELECT substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1) AS ch
      FROM generate_series(1, 8)
    ) s
  );

  INSERT INTO public.document_handovers
    (recovery_request_id, finder_id, partner_id, pickup_code_hash,
     recipient_name, status)
  VALUES
    (p_recovery_request_id, v_profile_id, p_partner_id, public.hash_secret(v_code),
     v_request.full_name_search, 'deposited')
  RETURNING id INTO v_handover_id;

  RETURN jsonb_build_object(
    'handover_id', v_handover_id,
    'pickup_code', v_code,
    'recipient_name', v_request.full_name_search
  );
END;
$$;

-- ── 5) RPC : vérification par le partenaire (scan QR ou saisie manuelle) ────
CREATE OR REPLACE FUNCTION public.verify_pickup(
  p_code TEXT,
  p_recipient_name TEXT,
  p_via TEXT DEFAULT 'qr_scan'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();  -- peut être NULL (partenaire au comptoir, sans compte)
  v_handover RECORD;
  v_name_norm TEXT;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) <> 8 THEN
    RAISE EXCEPTION 'Code de retrait invalide';
  END IF;
  IF p_recipient_name IS NULL OR length(trim(p_recipient_name)) < 3 THEN
    RAISE EXCEPTION 'Nom du destinataire requis';
  END IF;

  SELECT h.*, r.requester_id, l.full_name_search
    INTO v_handover
  FROM public.document_handovers h
  JOIN public.recovery_requests r ON r.id = h.recovery_request_id
  JOIN public.lost_documents l ON l.id = (
    SELECT m.lost_document_id FROM public.matches m WHERE m.id = r.match_id
  )
  WHERE h.pickup_code_hash = public.hash_secret(upper(trim(p_code)))
    AND h.status = 'deposited'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code inconnu, déjà utilisé ou dépôt expiré';
  END IF;

  -- Vérification du nom du destinataire (normalisation souple)
  v_name_norm := lower(regexp_replace(trim(p_recipient_name), '\s+', ' ', 'g'));
  IF v_name_norm <> lower(regexp_replace(v_handover.recipient_name, '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'Le nom ne correspond pas au destinataire attendu';
  END IF;

  -- Remise validée → clôture + libération du séquestre (transaction atomique)
  UPDATE public.document_handovers
     SET status = 'withdrawn',
         withdrawn_at = now(),
         withdrawn_by_partner = v_profile_id,
         withdrawn_via = CASE WHEN p_via IN ('qr_scan', 'manual_code') THEN p_via::text ELSE 'manual_code' END,
         updated_at = now()
   WHERE id = v_handover.id;

  UPDATE public.recovery_requests
     SET status = 'completed', unlocked_at = now(), updated_at = now()
   WHERE id = v_handover.recovery_request_id;

  UPDATE public.payouts
     SET status = 'released',
         released_at = now(),
         released_via_handover = v_handover.id,
         updated_at = now()
   WHERE recovery_request_id = v_handover.recovery_request_id AND status = 'held';

  RETURN jsonb_build_object(
    'handover_id', v_handover.id,
    'recovery_request_id', v_handover.recovery_request_id,
    'recipient_name', v_handover.recipient_name,
    'withdrawn_at', now(),
    'funds_released', TRUE
  );
END;
$$;

-- ── 6) RPC : consultation d'un dépôt par le code (page partenaire) ──────────
CREATE OR REPLACE FUNCTION public.lookup_pickup(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_handover RECORD;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) <> 8 THEN
    RAISE EXCEPTION 'Code invalide';
  END IF;

  SELECT h.recipient_name, h.deposited_at, h.withdrawal_deadline,
         p.name AS partner_name, fd.title_masked, fd.doc_number_partial
    INTO v_handover
  FROM public.document_handovers h
  JOIN public.partners p ON p.id = h.partner_id
  JOIN public.recovery_requests r ON r.id = h.recovery_request_id
  JOIN public.found_documents fd ON fd.id = (
    SELECT m.found_document_id FROM public.matches m WHERE m.id = r.match_id
  )
  WHERE h.pickup_code_hash = public.hash_secret(upper(trim(p_code)))
    AND h.status = 'deposited'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', FALSE);
  END IF;

  RETURN jsonb_build_object(
    'found', TRUE,
    'recipient_name', v_handover.recipient_name,
    'deposited_at', v_handover.deposited_at,
    'deadline', v_handover.withdrawal_deadline,
    'partner_name', v_handover.partner_name,
    'document', v_handover.title_masked,
    'doc_partial', v_handover.doc_number_partial
  );
END;
$$;

-- ── 7) RPC : code de retrait pour le chercheur (par sa demande) ─────────────
CREATE OR REPLACE FUNCTION public.get_my_pickup_info(p_recovery_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_row RECORD;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;

  SELECT h.id, h.status::text, h.recipient_name, h.deposited_at, h.withdrawal_deadline,
         pt.name AS partner_name, pt.address AS partner_address, pt.city AS partner_city,
         pt.phone AS partner_phone
    INTO v_row
  FROM public.document_handovers h
  JOIN public.partners pt ON pt.id = h.partner_id
  JOIN public.recovery_requests r ON r.id = h.recovery_request_id
  WHERE r.id = p_recovery_request_id AND r.requester_id = v_profile_id
  ORDER BY h.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('found', FALSE); END IF;

  RETURN jsonb_build_object(
    'found', TRUE,
    'status', v_row.status,
    'recipient_name', v_row.recipient_name,
    'partner_name', v_row.partner_name,
    'partner_address', v_row.partner_address,
    'partner_city', v_row.partner_city,
    'partner_phone', v_row.partner_phone,
    'deposited_at', v_row.deposited_at,
    'deadline', v_row.withdrawal_deadline
  );
END;
$$;

-- ── 8) RPC : dépôts actifs du trouveur ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_handovers()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_rows JSONB;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'recovery_request_id', h.recovery_request_id,
    'partner_name', pt.name,
    'partner_city', pt.city,
    'status', h.status,
    'recipient_name', h.recipient_name,
    'deposited_at', h.deposited_at,
    'withdrawn_at', h.withdrawn_at,
    'deadline', h.withdrawal_deadline
  )), '[]'::jsonb)
  INTO v_rows
  FROM public.document_handovers h
  JOIN public.partners pt ON pt.id = h.partner_id
  WHERE h.finder_id = v_profile_id
  ORDER BY h.created_at DESC;

  RETURN v_rows;
END;
$$;

-- ── 9) RPC : liste des partenaires actifs (public, pour le formulaire) ──────
CREATE OR REPLACE FUNCTION public.get_active_partners()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'kind', kind, 'region', region,
    'city', city, 'address', address, 'phone', phone
  ) ORDER BY name), '[]'::jsonb)
  FROM public.partners
  WHERE is_active = TRUE;
$$;

-- ── 10) Trigger : séquestre automatique dès le paiement confirmé ────────────
CREATE OR REPLACE FUNCTION public.create_escrow_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_finder_id UUID;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') THEN
    SELECT finder_id INTO v_finder_id
    FROM public.recovery_requests WHERE id = NEW.recovery_request_id;

    INSERT INTO public.payouts
      (recovery_request_id, finder_id, payment_id, amount, currency, status)
    VALUES
      (NEW.recovery_request_id, v_finder_id, NEW.id, NEW.amount, 'XAF', 'held')
    ON CONFLICT (recovery_request_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_escrow_on_payment ON public.payments;
CREATE TRIGGER trg_escrow_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.create_escrow_on_payment();

-- ── 11) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Partenaires : lecture publique des actifs (annuaire), écriture admin/modo
DROP POLICY IF EXISTS "Public Read Active Partners" ON public.partners;
CREATE POLICY "Public Read Active Partners" ON public.partners
  FOR SELECT USING (is_active = TRUE OR public.is_moderator());

DROP POLICY IF EXISTS "Moderators Manage Partners" ON public.partners;
CREATE POLICY "Moderators Manage Partners" ON public.partners
  FOR ALL USING (public.is_moderator()) WITH CHECK (public.is_moderator());

-- Handovers : les RPC SECURITY DEFINER font le travail ; accès direct limité
-- au trouveur, au chercheur de la demande et aux modérateurs
DROP POLICY IF EXISTS "Handovers Read Via RPC" ON public.document_handovers;
CREATE POLICY "Handovers Read Via RPC" ON public.document_handovers
  FOR SELECT USING (
    finder_id = public.current_profile_id()
    OR public.is_moderator()
    OR EXISTS (
      SELECT 1 FROM public.recovery_requests r
      JOIN public.profiles p ON p.id = r.requester_id
      WHERE r.id = document_handovers.recovery_request_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Handovers Insert Via RPC" ON public.document_handovers;
CREATE POLICY "Handovers Insert Via RPC" ON public.document_handovers
  FOR INSERT WITH CHECK (finder_id = public.current_profile_id());

-- Payouts : chacun voit les siens, les modos tout
DROP POLICY IF EXISTS "Payouts Read Own" ON public.payouts;
CREATE POLICY "Payouts Read Own" ON public.payouts
  FOR SELECT USING (
    finder_id = public.current_profile_id() OR public.is_moderator()
  );

-- ── 12) Droits d'exécution ──────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.deposit_document(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.deposit_document(UUID, UUID) TO authenticated;
-- verify_pickup : anonyme AUTORISÉ. La preuve d'autorité est le code lui-même
-- (8 caractères sans ambiguïté, hashé SHA-256, introuvable par énumération) +
-- la correspondance stricte du nom du destinataire. La RPC refusera tout code
-- erroné et tout nom non correspondant ; withdrawn_by_partner trace le compte
-- quand il existe. Un compte partenaire sera exigé à l'ouverture de nouveaux points.
GRANT EXECUTE ON FUNCTION public.verify_pickup(TEXT, TEXT, TEXT) TO anon, authenticated;
-- lookup_pickup : consultation anonyme autorisée (la page partenaire est
-- utilisée au comptoir, sans compte). Ne révèle que le nom du destinataire
-- attendu et un titre masqué — jamais de donnée sensible. La VALIDATION
-- (verify_pickup) reste authentifiée pour identifier qui confirme la remise.
GRANT EXECUTE ON FUNCTION public.lookup_pickup(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_pickup_info(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_pickup_info(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_handovers() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_handovers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_partners() TO anon, authenticated;

-- ── 13) Données initiales : quelques partenaires pilotes (Yaoundé/Douala) ──
INSERT INTO public.partners (name, kind, region, city, address, phone)
SELECT v.name, v.kind, v.region, v.city, v.address, v.phone
FROM (VALUES
  ('Kiosque MoMo Bastos', 'momo_kiosk', 'Centre', 'Yaoundé', 'Carrefour Bastos, face pharmacie', '+237 690 00 00 01'),
  ('Cyber Café Mvog-Ada', 'cybercafe', 'Centre', 'Yaoundé', 'Rond-point Mvog-Ada', '+237 690 00 00 02'),
  ('Agence MoMo Akwa', 'momo_kiosk', 'Littoral', 'Douala', 'Boulevard de la Liberté, Akwa', '+237 690 00 00 03'),
  ('Cyber Bonanjo Express', 'cybercafe', 'Littoral', 'Douala', 'Rue Joss, Bonanjo', '+237 690 00 00 04')
) AS v(name, kind, region, city, address, phone)
WHERE NOT EXISTS (SELECT 1 FROM public.partners p WHERE p.name = v.name);
