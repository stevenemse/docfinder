-- ==============================================================================
-- MIGRATION v3 — Double code : dépôt confirmé PAR le partenaire
-- À exécuter UNE FOIS. Idempotent.
--
-- Modèle validé avec le propriétaire — triple confirmation croisée :
--   1. Le TROUVEUR initie le dépôt → le système génère un CODE DE DÉPÔT qu'il
--      présente au partenaire (avec le document).
--   2. Le PARTENAIRE (anonyme ou enregistré) saisit ce code de dépôt sur la
--      page partenaire → le dépôt passe 'pending_deposit' → 'deposited'.
--      C'est le partenaire qui confirme qu'il détient la pièce : plus
--      d'auto-déclaration du trouveur.
--   3. Le CHERCHEUR se présente avec son CODE DE RETRAIT + son nom → le
--      partenaire confirme la remise → séquestre libéré.
--
-- Chaque acteur est vérifié par ce qu'il seul possède :
--   trouveur = code de dépôt · partenaire = sa confirmation · chercheur = code + nom
-- ==============================================================================

-- ── 1) Colonne : hash du code de dépôt + statut intermédiaire ───────────────
ALTER TABLE public.document_handovers
  ADD COLUMN IF NOT EXISTS deposit_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS deposited_at TIMESTAMPTZ;  -- devient la vraie date (confirmation partenaire)

-- Le code de retrait n'existe qu'APRÈS confirmation du dépôt par le partenaire
ALTER TABLE public.document_handovers
  ALTER COLUMN pickup_code_hash DROP NOT NULL;

-- Le statut admet l'état intermédiaire 'pending_deposit' (créé, pas encore
-- confirmé par le partenaire)
ALTER TABLE public.document_handovers
  DROP CONSTRAINT IF EXISTS document_handovers_status_check;
ALTER TABLE public.document_handovers
  ADD CONSTRAINT document_handovers_status_check
    CHECK (status IN ('pending_deposit', 'deposited', 'withdrawn', 'returned', 'expired'));

-- Un seul dépôt en cours par demande (pending OU déposé)
DROP INDEX IF EXISTS idx_handovers_code_hash;
CREATE INDEX IF NOT EXISTS idx_handovers_deposit_hash
  ON public.document_handovers (deposit_code_hash)
  WHERE status = 'pending_deposit';

-- ── 2) deposit_document : crée le dépôt PENDING avec le code de dépôt ───────
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
  v_deposit_code TEXT;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.recovery_request_id = p_recovery_request_id AND p.status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Le paiement doit être confirmé avant le dépôt';
  END IF;

  -- Anti-doublon : un dépôt en cours ou actif existe déjà ?
  SELECT h.id INTO v_existing
  FROM public.document_handovers h
  WHERE h.recovery_request_id = p_recovery_request_id
    AND h.status IN ('pending_deposit', 'deposited');
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Un dépôt existe déjà pour cette demande';
  END IF;

  -- Séquestre
  INSERT INTO public.payouts (recovery_request_id, finder_id, amount)
  SELECT p_recovery_request_id, v_profile_id, p.amount
  FROM public.payments p
  WHERE p.recovery_request_id = p_recovery_request_id AND p.status = 'paid'
  ON CONFLICT (recovery_request_id) DO NOTHING;

  -- CODE DE DÉPÔT : présenté par le trouveur au partenaire
  v_deposit_code := (
    SELECT string_agg(ch, '')
    FROM (
      SELECT substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1) AS ch
      FROM generate_series(1, 8)
    ) s
  );

  INSERT INTO public.document_handovers
    (recovery_request_id, finder_id, partner_id, deposit_code_hash,
     recipient_name, status)
  VALUES
    (p_recovery_request_id, v_profile_id, p_partner_id, public.hash_secret(v_deposit_code),
     v_request.full_name_search, 'pending_deposit')
  RETURNING id INTO v_handover_id;

  RETURN jsonb_build_object(
    'handover_id', v_handover_id,
    'deposit_code', v_deposit_code,
    'recipient_name', v_request.full_name_search
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_document(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.deposit_document(UUID, UUID) TO authenticated;

-- ── 3) confirm_deposit : LE PARTENAIRE confirme qu'il détient la pièce ──────
-- En saisissant le code de dépôt. Génère le code de retrait à ce moment.
CREATE OR REPLACE FUNCTION public.confirm_deposit(p_deposit_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_handover RECORD;
  v_pickup_code TEXT;
BEGIN
  IF p_deposit_code IS NULL OR length(trim(p_deposit_code)) <> 8 THEN
    RAISE EXCEPTION 'Code de dépôt invalide';
  END IF;

  SELECT h.*, r.requester_id
    INTO v_handover
  FROM public.document_handovers h
  JOIN public.recovery_requests r ON r.id = h.recovery_request_id
  WHERE h.deposit_code_hash = public.hash_secret(upper(trim(p_deposit_code)))
    AND h.status = 'pending_deposit'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code de dépôt inconnu ou déjà confirmé';
  END IF;

  -- Le partenaire enregistré ne peut confirmer que chez lui (l'anonyme
  -- prouve par le code seul)
  IF v_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.partners pt
      WHERE pt.id = v_handover.partner_id
        AND pt.linked_profile_id = v_profile_id
    ) = FALSE
    AND EXISTS (
      SELECT 1 FROM public.partners pt
      WHERE pt.linked_profile_id = v_profile_id
    ) THEN
      RAISE EXCEPTION 'Ce dépôt est destiné à un autre partenaire';
    END IF;
  END IF;

  -- Code de retrait du chercheur, généré à la confirmation
  v_pickup_code := (
    SELECT string_agg(ch, '')
    FROM (
      SELECT substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1) AS ch
      FROM generate_series(1, 8)
    ) s
  );

  UPDATE public.document_handovers
     SET status = 'deposited',
         deposit_code_hash = public.hash_secret(upper(trim(p_deposit_code))) || ':' || v_pickup_code,
         pickup_code_hash = public.hash_secret(v_pickup_code),
         deposited_at = now(),
         withdrawal_deadline = now() + INTERVAL '30 days',
         updated_at = now()
   WHERE id = v_handover.id;

  -- Le chercheur (payeur) lira le code via get_my_pickup_info
  INSERT INTO public.pickup_code_view_keys
    (recovery_request_id, pickup_code, handover_id)
  VALUES
    (v_handover.recovery_request_id, v_pickup_code, v_handover.id)
  ON CONFLICT (recovery_request_id) DO UPDATE
    SET pickup_code = EXCLUDED.pickup_code, handover_id = EXCLUDED.handover_id;

  RETURN jsonb_build_object(
    'handover_id', v_handover.id,
    'pickup_code', v_pickup_code,
    'recipient_name', v_handover.recipient_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_deposit(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.confirm_deposit(TEXT) TO anon, authenticated;

-- ── 4) lookup_pickup : ne trouve que les dépôts CONFIRMÉS ───────────────────
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

GRANT EXECUTE ON FUNCTION public.lookup_pickup(TEXT) TO anon, authenticated;

-- ── 5) get_my_handovers : expose le code de dépôt au trouveur ───────────────
-- Le code en clair est conservé dans pickup_code_view_keys (transfert), ici
-- on le joint pour que le trouveur puisse le re-consulter.
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

GRANT EXECUTE ON FUNCTION public.get_my_handovers() TO authenticated;

-- ── 6) Expiration : les dépôts non confirmés meurent à 72 h ─────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_handovers()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expired INT := 0;
  v_pending INT;
  v_h RECORD;
BEGIN
  -- 6a) Dépôts jamais confirmés par le partenaire (72 h) → annulés
  UPDATE public.document_handovers
     SET status = 'returned',
         return_reason = 'depot_non_confirme_72h',
         updated_at = now()
   WHERE status = 'pending_deposit'
     AND created_at < now() - INTERVAL '72 hours';
  GET DIAGNOSTICS v_pending = ROW_COUNT;
  v_expired := v_expired + v_pending;

  -- 6b) Relances J-7 et J-1 avant expiration du délai de garde
  INSERT INTO public.user_notifications (profile_id, type, title, body, recovery_request_id)
  SELECT r.requester_id,
         'pickup_reminder',
         '⏰ Rappel : votre document vous attend',
         'Le document déposé chez ' || pt.name ||
         ' doit être retiré avant le ' || to_char(h.withdrawal_deadline, 'DD/MM/YYYY') ||
         '. Passé ce délai, il sera retourné au trouveur et vos fonds remboursés.',
         r.id
  FROM public.document_handovers h
  JOIN public.recovery_requests r ON r.id = h.recovery_request_id
  JOIN public.partners pt ON pt.id = h.partner_id
  WHERE h.status = 'deposited'
    AND h.withdrawal_deadline <= now() + INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.recovery_request_id = r.id AND n.type = 'pickup_reminder'
        AND n.created_at > now() - INTERVAL '7 days'
    );

  -- 6c) Expiration du délai de garde → retour + remboursement
  FOR v_h IN
    SELECT h.id, h.recovery_request_id, h.finder_id, r.requester_id, p.id AS payout_id
    FROM public.document_handovers h
    JOIN public.recovery_requests r ON r.id = h.recovery_request_id
    LEFT JOIN public.payouts p ON p.recovery_request_id = h.recovery_request_id
    WHERE h.status = 'deposited' AND h.withdrawal_deadline < now()
  LOOP
    UPDATE public.document_handovers
       SET status = 'returned', return_reason = 'delai_garde_depasse', updated_at = now()
     WHERE id = v_h.id;

    UPDATE public.recovery_requests
       SET status = 'info_needed', updated_at = now()
     WHERE id = v_h.recovery_request_id;

    IF v_h.payout_id IS NOT NULL THEN
      UPDATE public.payouts
         SET status = 'cancelled', updated_at = now()
       WHERE id = v_h.payout_id AND status = 'held';
    END IF;

    INSERT INTO public.user_notifications (profile_id, type, title, body, recovery_request_id)
    VALUES
      (v_h.requester_id, 'handover_expired',
       '⌛ Délai de garde dépassé',
       'Le document est retourné au trouveur. Votre paiement sera remboursé sous 72 h.',
       v_h.recovery_request_id),
      (v_h.finder_id, 'handover_expired',
       '📦 Document retourné chez vous',
       'Le document n''a pas été retiré dans le délai. Il vous est retourné — récupérez-le auprès du partenaire.',
       v_h.recovery_request_id);

    v_expired := v_expired + 1;
  END LOOP;

  RETURN v_expired;
END;
$$;

-- ── 7) Le chercheur ne voit la fiche que si le dépôt est confirmé ───────────
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
         pt.phone AS partner_phone, pt.status AS partner_status,
         k.pickup_code
    INTO v_row
  FROM public.document_handovers h
  JOIN public.partners pt ON pt.id = h.partner_id
  JOIN public.recovery_requests r ON r.id = h.recovery_request_id
  LEFT JOIN public.pickup_code_view_keys k ON k.recovery_request_id = r.id
  WHERE r.id = p_recovery_request_id AND r.requester_id = v_profile_id
    AND h.status IN ('deposited', 'withdrawn')   -- pas les pending_deposit
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
    'partner_status', v_row.partner_status,
    'pickup_code', v_row.pickup_code,
    'deposited_at', v_row.deposited_at,
    'deadline', v_row.withdrawal_deadline
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_pickup_info(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_pickup_info(UUID) TO authenticated;
