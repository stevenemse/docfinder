-- ==============================================================================
-- MIGRATION — Fin du mode anonyme : confirmation réservée aux partenaires
-- enregistrés (temporaire « pending » inclus, validé ensuite par l'admin)
-- ==============================================================================
-- À exécuter via : npx supabase db query --linked --file supabase/migration-partner-auth-required.sql
-- Idempotent.

-- ── 1) confirm_deposit : exige un partenaire lié au profil appelant ──────────
CREATE OR REPLACE FUNCTION public.confirm_deposit(p_deposit_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_partner RECORD;
  v_handover RECORD;
  v_pickup_code TEXT;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Connectez-vous avec un compte partenaire pour confirmer un dépôt';
  END IF;

  SELECT pt.id, pt.name, pt.status INTO v_partner
    FROM public.partners pt
   WHERE pt.linked_profile_id = v_profile_id
   LIMIT 1;

  IF v_partner.id IS NULL THEN
    RAISE EXCEPTION 'Aucun point de dépôt lié à votre compte. Soumettez la candidature « Devenir partenaire » avec ce même compte.';
  END IF;

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

  IF v_handover.partner_id IS NOT NULL AND v_handover.partner_id <> v_partner.id THEN
    RAISE EXCEPTION 'Ce dépôt est destiné à un autre partenaire';
  END IF;

  -- Le dépôt est rattaché au point de dépôt confirmant (traçabilité complète)
  UPDATE public.document_handovers
     SET partner_id = v_partner.id
   WHERE id = v_handover.id AND partner_id IS NULL;

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
    'Votre document a été confirmé au dépôt chez ' || v_partner.name ||
    '. Présentez votre code de retrait et une pièce d''identité au nom de ' ||
    v_handover.recipient_name || '. Délai de garde : 30 jours.',
    v_handover.recovery_request_id);

  RETURN jsonb_build_object(
    'handover_id', v_handover.id,
    'pickup_code', v_pickup_code,
    'recipient_name', v_handover.recipient_name
  );
END;
$function$;

-- ── 2) verify_pickup : exige un partenaire lié (any status) ──────────────────
CREATE OR REPLACE FUNCTION public.verify_pickup(p_code text, p_recipient_name text, p_via text DEFAULT 'qr_scan')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_partner RECORD;
  v_handover RECORD;
  v_name_norm TEXT;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Connectez-vous avec un compte partenaire pour confirmer un retrait';
  END IF;

  SELECT pt.id, pt.name, pt.status INTO v_partner
    FROM public.partners pt
   WHERE pt.linked_profile_id = v_profile_id
   LIMIT 1;

  IF v_partner.id IS NULL THEN
    RAISE EXCEPTION 'Aucun point de dépôt lié à votre compte. Soumettez la candidature « Devenir partenaire » avec ce même compte.';
  END IF;

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

  v_name_norm := lower(regexp_replace(trim(p_recipient_name), '\s+', ' ', 'g'));
  IF v_name_norm <> lower(regexp_replace(v_handover.recipient_name, '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'Le nom ne correspond pas au destinataire attendu';
  END IF;

  UPDATE public.document_handovers
     SET status = 'withdrawn',
         withdrawn_at = now(),
         withdrawn_by_partner = v_partner.id,
         withdrawn_via = CASE WHEN p_via IN ('qr_scan', 'manual_code') THEN p_via::text ELSE 'manual_code' END,
         updated_at = now()
   WHERE id = v_handover.id;

  UPDATE public.recovery_requests
     SET status = 'completed', unlocked_at = now(), updated_at = now()
   WHERE id = v_handover.recovery_request_id;

  UPDATE public.payouts
     SET status = 'released', released_at = now(),
         released_via_handover = v_handover.id, updated_at = now()
   WHERE recovery_request_id = v_handover.recovery_request_id
     AND status = 'held';

  RETURN jsonb_build_object(
    'handover_id', v_handover.id,
    'recovery_request_id', v_handover.recovery_request_id,
    'recipient_name', v_handover.recipient_name,
    'withdrawn_at', now(),
    'funds_released', TRUE
  );
END;
$function$;

-- ── 3) lookup_pickup : consultation réservée au partenaire connecté ──────────
CREATE OR REPLACE FUNCTION public.lookup_pickup(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_handover RECORD;
BEGIN
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('found', FALSE, 'auth_required', TRUE);
  END IF;

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
    'doc_partial', v_handover.doc_partial
  );
END;
$function$;

-- ── 4) register_partner : lie automatiquement le profil appelant ─────────────
CREATE OR REPLACE FUNCTION public.register_partner(p_name text, p_kind text DEFAULT 'momo_kiosk', p_region text DEFAULT NULL, p_city text DEFAULT NULL, p_address text DEFAULT NULL, p_phone text DEFAULT NULL, p_contact_name text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_partner_id UUID;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Créez un compte DocFinder puis soumettez votre candidature depuis ce compte';
  END IF;

  -- Un même profil ne peut pas candidater deux fois
  IF EXISTS (SELECT 1 FROM public.partners WHERE linked_profile_id = v_profile_id) THEN
    RAISE EXCEPTION 'Votre compte est déjà lié à un point de dépôt';
  END IF;

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
         ' attend votre validation. Il peut déjà confirmer des dépôts et retraits.'
  FROM public.profiles p
  WHERE p.role IN ('admin', 'moderator');

  RETURN v_partner_id;
END;
$function$;

-- ── 5) Droits : plus d'accès anonyme ─────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.lookup_pickup(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_deposit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_pickup(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_partner(text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_pickup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_deposit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pickup(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_partner(text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_pickup(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_deposit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_pickup(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_partner(text, text, text, text, text, text, text) TO service_role;
