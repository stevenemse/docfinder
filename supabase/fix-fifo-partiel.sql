-- Fix FIFO partiel : consommation partielle du dernier dividende
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

    -- Consomme les dividendes FIFO, avec consommation PARTIELLE du dernier
    -- quand le montant du retrait ne tombe pas sur un multiple exact.
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
