-- ==============================================================================
-- MIGRATION v2 — Partenaires : inscription, dividendes, relances, expiration
-- À exécuter UNE FOIS. Idempotent.
--
-- Modèle validé avec le propriétaire :
--   - Partenaire ANONYME  : confirme les retraits au comptoir, ne gagne rien.
--   - Partenaire ENREGISTRÉ : soumet son inscription (nom, position, contact),
--     l'admin la valide → chaque retrait confirmé chez lui génère un dividende
--     (part du forfait, paramétrable) crédité dans son wallet.
--   - Le CODE de retrait est visible par le chercheur (celui qui a payé) :
--     il le présente au partenaire, anonyme ou enregistré.
--   - Relances in-app J-7 / J-1 avant expiration du délai de garde ;
--     à l'expiration : document retourné au trouveur + remboursement.
-- ==============================================================================

-- ── 1) Colonnes partenaires : validation + wallet ────────────────────────────
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  ADD COLUMN IF NOT EXISTS commission_rate INTEGER NOT NULL DEFAULT 300
    CHECK (commission_rate BETWEEN 0 AND 2000);  -- dividende en FCFA par retrait

-- Un partenaire en attente n'apparaît pas dans l'annuaire public
DROP POLICY IF EXISTS "Public Read Active Partners" ON public.partners;
CREATE POLICY "Public Read Active Partners" ON public.partners
  FOR SELECT USING (status = 'active' OR public.is_moderator());

-- get_active_partners : ne liste que les actifs (mis à jour)
CREATE OR REPLACE FUNCTION public.get_active_partners()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'kind', kind, 'region', region,
    'city', city, 'address', address, 'phone', phone, 'status', status
  ) ORDER BY name), '[]'::jsonb)
  FROM public.partners
  WHERE status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.get_active_partners() TO anon, authenticated;

-- ── 2) Inscription partenaire (anonyme → candidature) ───────────────────────
CREATE OR REPLACE FUNCTION public.register_partner(
  p_name TEXT,
  p_kind TEXT DEFAULT 'momo_kiosk',
  p_region TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_partner_id UUID;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) < 3 THEN
    RAISE EXCEPTION 'Nom du point de dépôt requis';
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 9 THEN
    RAISE EXCEPTION 'Numéro de téléphone requis (vérification)';
  END IF;

  -- Un même numéro ne peut pas candidater deux fois
  IF EXISTS (SELECT 1 FROM public.partners WHERE phone = trim(p_phone)) THEN
    RAISE EXCEPTION 'Une candidature existe déjà avec ce numéro';
  END IF;

  INSERT INTO public.partners
    (name, kind, region, city, address, phone, contact_name, status, linked_profile_id)
  VALUES
    (trim(p_name), p_kind, p_region, p_city, p_address, trim(p_phone), p_contact_name,
     'pending', v_profile_id)
  RETURNING id INTO v_partner_id;

  RETURN v_partner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_partner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── 3) Wallet partenaire : dividendes par retrait ───────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_earnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    handover_id UUID NOT NULL UNIQUE REFERENCES public.document_handovers(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid_out', 'cancelled')),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_out_at TIMESTAMPTZ
);

-- Gagne un dividende UNIQUEMENT si le partenaire est enregistré (lié à un
-- contact vérifié, status = 'active'). Le partenaire anonyme ne gagne rien.
CREATE OR REPLACE FUNCTION public.award_partner_earning()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partner RECORD;
BEGIN
  IF NEW.status <> 'withdrawn' THEN RETURN NEW; END IF;

  SELECT status, commission_rate, linked_profile_id, phone
    INTO v_partner
  FROM public.partners WHERE id = NEW.partner_id;

  -- Anonyme (pas de numéro/contact vérifié) ou suspendu : rien
  IF v_partner.status <> 'active' OR v_partner.phone IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.partner_earnings (partner_id, handover_id, amount, status)
  VALUES (NEW.partner_id, NEW.id, v_partner.commission_rate, 'pending')
  ON CONFLICT (handover_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_earning ON public.document_handovers;
CREATE TRIGGER trg_partner_earning
AFTER UPDATE OF status ON public.document_handovers
FOR EACH ROW EXECUTE FUNCTION public.award_partner_earning();

-- Wallet agrégé d'un partenaire (RPC pour l'admin et le partenaire lui-même)
CREATE OR REPLACE FUNCTION public.get_partner_wallet(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_result RECORD;
BEGIN
  IF NOT public.is_moderator()
     AND NOT EXISTS (
       SELECT 1 FROM public.partners pt
       WHERE pt.id = p_partner_id
         AND pt.linked_profile_id = v_profile_id
     ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount END), 0) AS pending_amount,
    COALESCE(SUM(CASE WHEN e.status = 'paid_out' THEN e.amount END), 0) AS paid_amount,
    COUNT(CASE WHEN e.status = 'pending' THEN 1 END) AS pending_count,
    COUNT(CASE WHEN e.status = 'paid_out' THEN 1 END) AS paid_count,
    (SELECT name FROM public.partners WHERE id = p_partner_id) AS partner_name,
    (SELECT status FROM public.partners WHERE id = p_partner_id) AS partner_status
  INTO v_result
  FROM public.partner_earnings e
  WHERE e.partner_id = p_partner_id;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'partner_name', v_result.partner_name,
    'partner_status', v_result.partner_status,
    'pending_amount', v_result.pending_amount,
    'paid_amount', v_result.paid_amount,
    'pending_count', v_result.pending_count,
    'paid_count', v_result.paid_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_partner_wallet(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_partner_wallet(UUID) TO authenticated;

-- Historique détaillé des dividendes
CREATE OR REPLACE FUNCTION public.get_partner_earnings(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
BEGIN
  IF NOT public.is_moderator()
     AND NOT EXISTS (
       SELECT 1 FROM public.partners pt
       WHERE pt.id = p_partner_id AND pt.linked_profile_id = v_profile_id
     ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'amount', e.amount, 'status', e.status,
    'earned_at', e.earned_at, 'paid_out_at', e.paid_out_at,
    'handover_id', e.handover_id
  ) ORDER BY e.earned_at DESC), '[]'::jsonb)
  FROM public.partner_earnings e
  WHERE e.partner_id = p_partner_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_partner_earnings(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_partner_earnings(UUID) TO authenticated;

-- Marquer un dividende payé (admin)
CREATE OR REPLACE FUNCTION public.mark_earning_paid(p_earning_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Réservé aux modérateurs';
  END IF;
  UPDATE public.partner_earnings
     SET status = 'paid_out', paid_out_at = now()
   WHERE id = p_earning_id AND status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_earning_paid(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_earning_paid(UUID) TO authenticated;

-- ── 4) Le chercheur voit son code de retrait ────────────────────────────────
-- Le code est stocké hashé : pour l'afficher au chercheur légitime (celui qui
-- a payé), la RPC de dépôt renvoie aussi le code au requester via une table
-- de transfert à usage unique, lue par get_my_pickup_info.
CREATE TABLE IF NOT EXISTS public.pickup_code_view_keys (
    recovery_request_id UUID PRIMARY KEY REFERENCES public.recovery_requests(id) ON DELETE CASCADE,
    pickup_code TEXT NOT NULL,
    handover_id UUID NOT NULL REFERENCES public.document_handovers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sécurité : RLS, lecture uniquement via la RPC
ALTER TABLE public.pickup_code_view_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No Direct Access" ON public.pickup_code_view_keys;
CREATE POLICY "No Direct Access" ON public.pickup_code_view_keys
  FOR SELECT USING (false);

-- deposit_document : enregistre le code lisible par le chercheur
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

  -- Le chercheur (payeur) pourra lire le code via get_my_pickup_info
  INSERT INTO public.pickup_code_view_keys
    (recovery_request_id, pickup_code, handover_id)
  VALUES
    (p_recovery_request_id, v_code, v_handover_id)
  ON CONFLICT (recovery_request_id) DO UPDATE
    SET pickup_code = EXCLUDED.pickup_code, handover_id = EXCLUDED.handover_id;

  RETURN jsonb_build_object(
    'handover_id', v_handover_id,
    'pickup_code', v_code,
    'recipient_name', v_request.full_name_search
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_document(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.deposit_document(UUID, UUID) TO authenticated;

-- get_my_pickup_info : enrichi du code + du statut du partenaire
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

-- ── 5) Relances et expiration (table notifications) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('pickup_reminder', 'handover_expired', 'escrow_refunded', 'partner_approved')),
    title TEXT NOT NULL,
    body TEXT,
    recovery_request_id UUID REFERENCES public.recovery_requests(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read Own Notifications" ON public.user_notifications;
CREATE POLICY "Read Own Notifications" ON public.user_notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "System Writes Notifications" ON public.user_notifications;
CREATE POLICY "System Writes Notifications" ON public.user_notifications
  FOR INSERT WITH CHECK (true);

-- RPC de lecture/marquage pour l'app
CREATE OR REPLACE FUNCTION public.get_my_notifications()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id, 'type', n.type, 'title', n.title, 'body', n.body,
    'recovery_request_id', n.recovery_request_id,
    'read', n.read_at IS NOT NULL,
    'created_at', n.created_at
  ) ORDER BY n.created_at DESC), '[]'::jsonb)
  FROM public.user_notifications n
  JOIN public.profiles p ON p.id = n.profile_id
  WHERE p.user_id = auth.uid() AND n.created_at > now() - INTERVAL '30 days';
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids UUID[])
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.user_notifications n
     SET read_at = now()
  FROM public.profiles p
  WHERE p.id = n.profile_id AND p.user_id = auth.uid()
    AND n.id = ANY(p_ids) AND n.read_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_notifications() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_notifications() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;

-- ── 6) Job d'expiration : relances J-7/J-1 puis retour + remboursement ─────
CREATE OR REPLACE FUNCTION public.expire_stale_handovers()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expired INT := 0;
  v_h RECORD;
BEGIN
  -- 6a) Relances J-7 et J-1 (une seule par seuil : idempotent par (handover, type))
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

  -- 6b) Expiration : retour au trouveur + remboursement
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

    -- Remboursement du chercheur (fonds séquestrés annulés)
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

-- pg_cron : exécution quotidienne à 08:00 (UTC+1 → 9h heure camerounaise)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('docfinder-expire-handovers')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'docfinder-expire-handovers');

SELECT cron.schedule('docfinder-expire-handovers', '0 8 * * *',
  $$SELECT public.expire_stale_handovers()$$);

-- ── 7) Annuaire admin : toutes les candidatures + wallets ───────────────────
CREATE OR REPLACE FUNCTION public.get_admin_partners()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_moderator() THEN RAISE EXCEPTION 'Réservé aux modérateurs'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pt.id, 'name', pt.name, 'kind', pt.kind,
    'region', pt.region, 'city', pt.city, 'address', pt.address,
    'phone', pt.phone, 'contact_name', pt.contact_name,
    'status', pt.status, 'commission_rate', pt.commission_rate,
    'linked_profile_id', pt.linked_profile_id,
    'created_at', pt.created_at,
    'pending_earnings', COALESCE(e.pending_amount, 0),
    'paid_earnings', COALESCE(e.paid_amount, 0),
    'withdrawals_count', COALESCE(w.count, 0)
  ) ORDER BY pt.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.partners pt
  LEFT JOIN (
    SELECT partner_id,
           SUM(CASE WHEN status='pending' THEN amount END) AS pending_amount,
           SUM(CASE WHEN status='paid_out' THEN amount END) AS paid_amount
    FROM public.partner_earnings GROUP BY partner_id
  ) e ON e.partner_id = pt.id
  LEFT JOIN (
    SELECT partner_id, COUNT(*) AS count
    FROM public.document_handovers WHERE status='withdrawn' GROUP BY partner_id
  ) w ON w.partner_id = pt.id;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_partners() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_admin_partners() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_partner_status(
  p_partner_id UUID,
  p_status TEXT,
  p_commission_rate INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_partner RECORD;
BEGIN
  IF NOT public.is_moderator() THEN RAISE EXCEPTION 'Réservé aux modérateurs'; END IF;
  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;

  SELECT status, linked_profile_id, name INTO v_partner
  FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partenaire introuvable'; END IF;

  UPDATE public.partners
     SET status = p_status,
         commission_rate = COALESCE(p_commission_rate, commission_rate),
         updated_at = now()
   WHERE id = p_partner_id;

  -- Notification au partenaire quand sa candidature est validée
  IF p_status = 'active' AND v_partner.status = 'pending' AND v_partner.linked_profile_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (profile_id, type, title, body)
    VALUES (v_partner.linked_profile_id, 'partner_approved',
            '✅ Votre partenaire est validé !',
            'Vous êtes désormais partenaire DocFinder : chaque retrait confirmé chez vous crédite votre wallet.');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_partner_status(UUID, TEXT, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_partner_status(UUID, TEXT, INTEGER) TO authenticated;
