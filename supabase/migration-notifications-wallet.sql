-- ==============================================================================
-- MIGRATION — Notifications in-app complètes + Wallet partenaire (retraits)
-- À exécuter UNE FOIS dans le Supabase SQL Editor. Idempotent.
--
-- 1) Types de notifications élargis : dépôt confirmé, paiement reçu, retrait
--    demandé/traité, candidature partenaire (pour les modérateurs).
-- 2) Wallet : table wallet_withdrawals + RPC de demande de retrait avec
--    minimum de 5 000 FCFA (pousse le partenaire à accumuler) + traitement admin.
-- 3) Partenaire temporaire : une candidature est confirmable par code de dépôt
--    dès sa création (déjà le cas) — on notifie maintenant les modérateurs.
-- 4) Notifications sur les événements d'argent : paiement confirmé, dépôt
--    confirmé, remise + libération des fonds.
-- ==============================================================================

-- ── 1) Types de notifications élargis ────────────────────────────────────────
ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_type_check CHECK (type IN (
    'pickup_reminder', 'handover_expired', 'escrow_refunded', 'partner_approved',
    'deposit_confirmed', 'payment_received', 'withdrawal_requested',
    'withdrawal_processed', 'partner_registered', 'partner_suspended'
  ));

-- ── 2) Wallet partenaire — retraits par palier ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    phone TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'mtn_momo'
        CHECK (method IN ('mtn_momo', 'orange_money')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'rejected')),
    reject_reason TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.wallet_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner Reads Own Withdrawals" ON public.wallet_withdrawals;
CREATE POLICY "Partner Reads Own Withdrawals"
  ON public.wallet_withdrawals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.partners pt
      WHERE pt.id = partner_id AND pt.linked_profile_id = public.current_profile_id()
    )
  );

DROP POLICY IF EXISTS "Moderators Read All Withdrawals" ON public.wallet_withdrawals;
CREATE POLICY "Moderators Read All Withdrawals"
  ON public.wallet_withdrawals
  FOR SELECT USING (public.is_moderator());

-- Pas d'INSERT/UPDATE direct côté client : tout passe par les RPC ci-dessous.

-- Solde disponible d'un partenaire : dividendes en attente − retraits en cours
CREATE OR REPLACE FUNCTION public.get_partner_available_balance(p_partner_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT SUM(e.amount) FROM public.partner_earnings e
    WHERE e.partner_id = p_partner_id AND e.status = 'pending'
  ), 0)
  - COALESCE((
    SELECT SUM(w.amount) FROM public.wallet_withdrawals w
    WHERE w.partner_id = p_partner_id AND w.status = 'pending'
  ), 0);
$$;

-- Demande de retrait par le partenaire connecté (minimum 5 000 FCFA)
CREATE OR REPLACE FUNCTION public.request_wallet_withdrawal(
  p_amount INTEGER,
  p_phone TEXT,
  p_method TEXT DEFAULT 'mtn_momo'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_partner RECORD;
  v_balance INTEGER;
  v_withdrawal_id UUID;
BEGIN
  SELECT id, name, status INTO v_partner
  FROM public.partners
  WHERE linked_profile_id = v_profile_id
  LIMIT 1;

  IF v_partner.id IS NULL THEN
    RAISE EXCEPTION 'Aucun partenaire lié à ce compte';
  END IF;
  IF v_partner.status <> 'active' THEN
    RAISE EXCEPTION 'Partenaire pas encore validé — wallet indisponible';
  END IF;
  IF p_amount IS NULL OR p_amount < 5000 THEN
    RAISE EXCEPTION 'Retrait minimum : 5 000 FCFA';
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 9 THEN
    RAISE EXCEPTION 'Numéro Mobile Money requis';
  END IF;
  IF p_method NOT IN ('mtn_momo', 'orange_money') THEN
    RAISE EXCEPTION 'Méthode de retrait invalide';
  END IF;

  v_balance := public.get_partner_available_balance(v_partner.id);
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Solde insuffisant : % FCFA disponibles', v_balance;
  END IF;

  INSERT INTO public.wallet_withdrawals (partner_id, amount, phone, method)
  VALUES (v_partner.id, p_amount, trim(p_phone), p_method)
  RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'id', v_withdrawal_id,
    'amount', p_amount,
    'status', 'pending',
    'partner_name', v_partner.name
  );
END;
$$;

-- Wallet complet du partenaire connecté : solde, historique retraits, seuil
CREATE OR REPLACE FUNCTION public.get_my_partner_wallet()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_partner RECORD;
  v_balance INTEGER;
  v_withdrawals JSONB;
  v_total_pending INTEGER;
  v_total_paid INTEGER;
BEGIN
  SELECT id, name, status, phone, contact_name INTO v_partner
  FROM public.partners
  WHERE linked_profile_id = v_profile_id
  LIMIT 1;

  IF v_partner.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_balance := public.get_partner_available_balance(v_partner.id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', w.id, 'amount', w.amount, 'phone', w.phone, 'method', w.method,
    'status', w.status, 'reject_reason', w.reject_reason,
    'requested_at', w.requested_at, 'processed_at', w.processed_at
  ) ORDER BY w.requested_at DESC), '[]'::jsonb)
  INTO v_withdrawals
  FROM public.wallet_withdrawals w
  WHERE w.partner_id = v_partner.id;

  SELECT COALESCE(SUM(e.amount), 0) INTO v_total_pending
  FROM public.partner_earnings e
  WHERE e.partner_id = v_partner.id AND e.status = 'pending';
  SELECT COALESCE(SUM(e.amount), 0) INTO v_total_paid
  FROM public.partner_earnings e
  WHERE e.partner_id = v_partner.id AND e.status = 'paid_out';

  RETURN jsonb_build_object(
    'partner_id', v_partner.id,
    'partner_name', v_partner.name,
    'partner_status', v_partner.status,
    'phone', v_partner.phone,
    'available_balance', v_balance,
    'total_pending', v_total_pending,
    'total_paid', v_total_paid,
    'min_withdrawal', 5000,
    'withdrawals', v_withdrawals
  );
END;
$$;

-- Retraits côté admin : liste complète
CREATE OR REPLACE FUNCTION public.get_admin_withdrawals()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_moderator() THEN RAISE EXCEPTION 'Réservé aux modérateurs'; END IF;

  RETURN COALESCE(jsonb_agg(jsonb_build_object(
    'id', w.id, 'partner_id', w.partner_id, 'partner_name', pt.name,
    'amount', w.amount, 'phone', w.phone, 'method', w.method,
    'status', w.status, 'reject_reason', w.reject_reason,
    'requested_at', w.requested_at, 'processed_at', w.processed_at,
    'partner_status', pt.status
  ) ORDER BY w.requested_at DESC), '[]'::jsonb)
  FROM public.wallet_withdrawals w
  JOIN public.partners pt ON pt.id = w.partner_id;
END;
$$;

-- Traitement admin : payer (marque aussi les dividendes consommés) ou refuser
CREATE OR REPLACE FUNCTION public.process_wallet_withdrawal(
  p_withdrawal_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_w RECORD;
  v_remaining INTEGER;
  v_e RECORD;
BEGIN
  IF NOT public.is_moderator() THEN RAISE EXCEPTION 'Réservé aux modérateurs'; END IF;

  SELECT w.*, pt.name AS partner_name, pt.linked_profile_id
    INTO v_w
  FROM public.wallet_withdrawals w
  JOIN public.partners pt ON pt.id = w.partner_id
  WHERE w.id = p_withdrawal_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Retrait introuvable'; END IF;
  IF v_w.status <> 'pending' THEN RAISE EXCEPTION 'Retrait déjà traité'; END IF;

  IF p_action = 'paid' THEN
    UPDATE public.wallet_withdrawals
       SET status = 'paid', processed_at = now(), processed_by = v_profile_id
     WHERE id = p_withdrawal_id;

    -- Consomme les dividendes FIFO jusqu'à couvrir le montant payé
    -- (consommation partielle du dernier dividende si montant non aligné)
    v_remaining := v_w.amount;
    FOR v_e IN
      SELECT id, amount FROM public.partner_earnings
      WHERE partner_id = v_w.partner_id AND status = 'pending'
      ORDER BY earned_at
    LOOP
      EXIT WHEN v_remaining <= 0;
      IF v_e.amount <= v_remaining THEN
        UPDATE public.partner_earnings
           SET status = 'paid_out', paid_out_at = now()
         WHERE id = v_e.id;
        v_remaining := v_remaining - v_e.amount;
      ELSE
        UPDATE public.partner_earnings
           SET amount = amount - v_remaining
         WHERE id = v_e.id;
        v_remaining := 0;
      END IF;
    END LOOP;

    IF v_w.linked_profile_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (profile_id, type, title, body)
      VALUES (v_w.linked_profile_id, 'withdrawal_processed',
        '💰 Retrait payé',
        'Votre retrait de ' || to_char(v_w.amount, 'FM999 999 999') ||
        ' FCFA a été envoyé au ' || v_w.phone || '.');
    END IF;
    INSERT INTO public.audit_logs (actor_id, action, details)
    VALUES (v_profile_id, 'wallet_withdrawal_paid',
      jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount', v_w.amount,
                         'partner', v_w.partner_name));

  ELSIF p_action = 'rejected' THEN
    UPDATE public.wallet_withdrawals
       SET status = 'rejected', reject_reason = p_reason,
           processed_at = now(), processed_by = v_profile_id
     WHERE id = p_withdrawal_id;

    IF v_w.linked_profile_id IS NOT NULL THEN
      INSERT INTO public.user_notifications (profile_id, type, title, body)
      VALUES (v_w.linked_profile_id, 'withdrawal_processed',
        '❌ Retrait refusé',
        'Votre demande de ' || to_char(v_w.amount, 'FM999 999 999') ||
        ' FCFA a été refusée.' ||
        COALESCE(' Motif : ' || p_reason, ''));
    END IF;
    INSERT INTO public.audit_logs (actor_id, action, details)
    VALUES (v_profile_id, 'wallet_withdrawal_rejected',
      jsonb_build_object('withdrawal_id', p_withdrawal_id, 'reason', p_reason));
  ELSE
    RAISE EXCEPTION 'Action invalide (paid ou rejected)';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_wallet_withdrawal(INTEGER, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.request_wallet_withdrawal(INTEGER, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_partner_wallet() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_partner_wallet() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_withdrawals() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_admin_withdrawals() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.process_wallet_withdrawal(UUID, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.process_wallet_withdrawal(UUID, TEXT, TEXT) TO authenticated;

-- ── 3) Candidature partenaire : notifie tous les modérateurs ─────────────────
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

  -- Les modérateurs voient la candidature arriver (temporaire jusqu'à validation)
  INSERT INTO public.user_notifications (profile_id, type, title, body)
  SELECT p.id, 'partner_registered',
         '🏪 Nouvelle candidature partenaire',
         trim(p_name) || ' — ' || COALESCE(trim(p_city), '—') ||
         ' attend votre validation. En attendant, il peut déjà confirmer des dépôts.'
  FROM public.profiles p
  WHERE p.role IN ('admin', 'moderator');

  RETURN v_partner_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_partner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.register_partner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── 4) Notifications sur les événements d'argent ─────────────────────────────
-- 4a) Paiement confirmé → chercheur + trouveur
CREATE OR REPLACE FUNCTION public.notify_payment_paid()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_requester UUID;
  v_finder UUID;
  v_amount INTEGER := NEW.amount;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN RETURN NEW; END IF;

  SELECT r.requester_id, h.finder_id INTO v_requester, v_finder
  FROM public.recovery_requests r
  LEFT JOIN public.document_handovers h ON h.recovery_request_id = r.id
  WHERE r.id = NEW.recovery_request_id
  LIMIT 1;

  IF v_requester IS NOT NULL THEN
    INSERT INTO public.user_notifications (profile_id, type, title, body, recovery_request_id)
    VALUES (v_requester, 'payment_received',
      '✅ Paiement confirmé',
      'Votre paiement de ' || to_char(v_amount, 'FM999 999 999') ||
      ' FCFA est confirmé. Les fonds sont séquestrés jusqu''à la remise vérifiée du document.',
      NEW.recovery_request_id);
  END IF;
  IF v_finder IS NOT NULL AND v_finder <> v_requester THEN
    INSERT INTO public.user_notifications (profile_id, type, title, body, recovery_request_id)
    VALUES (v_finder, 'payment_received',
      '💰 Fonds séquestrés',
      'Le propriétaire a payé. Déposez maintenant le document chez un partenaire pour déclencher la restitution.',
      NEW.recovery_request_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_paid_notify ON public.payments;
CREATE TRIGGER trg_payment_paid_notify
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_paid();

-- 4b) Dépôt confirmé par le partenaire → le chercheur peut venir chercher
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

  -- Notification : le chercheur sait que la pièce est en sécurité chez le partenaire
  INSERT INTO public.user_notifications (profile_id, type, title, body, recovery_request_id)
  VALUES (v_handover.requester_id, 'deposit_confirmed',
    '📦 Document déposé chez un partenaire',
    'Votre document a été confirmé au dépôt. Présentez votre code de retrait et une pièce d''identité au nom de ' ||
    v_handover.recipient_name || '. Délai de garde : 30 jours.',
    v_handover.recovery_request_id);

  RETURN jsonb_build_object(
    'handover_id', v_handover.id,
    'pickup_code', v_pickup_code,
    'recipient_name', v_handover.recipient_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_deposit(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.confirm_deposit(TEXT) TO anon, authenticated;

-- 4c) Remise vérifiée → fonds libérés : notifie les deux parties
CREATE OR REPLACE FUNCTION public.notify_pickup_verified()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_requester UUID;
  v_partner_name TEXT;
BEGIN
  IF NEW.status <> 'withdrawn' OR OLD.status = 'withdrawn' THEN RETURN NEW; END IF;

  SELECT r.requester_id, pt.name INTO v_requester, v_partner_name
  FROM public.recovery_requests r
  LEFT JOIN public.partners pt ON pt.id = NEW.partner_id
  WHERE r.id = NEW.recovery_request_id
  LIMIT 1;

  IF v_requester IS NOT NULL THEN
    INSERT INTO public.user_notifications (profile_id, type, title, body, recovery_request_id)
    VALUES (v_requester, 'escrow_refunded',
      '🎉 Récupération confirmée — dossiers clôturé',
      'Votre document a été remis. Le séquestre est libéré au trouveur. Merci de fermer la boucle !',
      NEW.recovery_request_id);
  END IF;
  IF NEW.finder_id IS NOT NULL AND NEW.finder_id <> v_requester THEN
    INSERT INTO public.user_notifications (profile_id, type, title, body, recovery_request_id)
    VALUES (NEW.finder_id, 'escrow_refunded',
      '💵 Fonds libérés',
      'Le document a été remis au propriétaire. Votre gain est en cours d''envoi vers votre wallet.',
      NEW.recovery_request_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pickup_verified_notify ON public.document_handovers;
CREATE TRIGGER trg_pickup_verified_notify
  AFTER UPDATE OF status ON public.document_handovers
  FOR EACH ROW EXECUTE FUNCTION public.notify_pickup_verified();

-- ── 5) Suspension/réactivation partenaire : notifie le responsable ───────────
-- (update_partner_status existe déjà ; on y ajoute la notification ici via
--  un trigger dédié, plus simple à maintenir)
CREATE OR REPLACE FUNCTION public.notify_partner_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status OR NEW.linked_profile_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    INSERT INTO public.user_notifications (profile_id, type, title, body)
    VALUES (NEW.linked_profile_id, 'partner_approved',
      '✅ Partenaire validé',
      'Votre point de dépôt est actif. Chaque retrait confirmé chez vous crédite votre wallet (' ||
      NEW.commission_rate::text || ' FCFA). Connectez-vous pour voir votre wallet.');
  ELSIF NEW.status = 'suspended' THEN
    INSERT INTO public.user_notifications (profile_id, type, title, body)
    VALUES (NEW.linked_profile_id, 'partner_suspended',
      '⏸️ Compte partenaire suspendu',
      'Votre compte partenaire a été suspendu par l''administration. Contactez le support : docfinder@gmail.com.');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_status_notify ON public.partners;
CREATE TRIGGER trg_partner_status_notify
  AFTER UPDATE OF status, linked_profile_id, commission_rate ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_status_change();
