-- Fix register_partner : variables correctement utilisées dans la notification
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
