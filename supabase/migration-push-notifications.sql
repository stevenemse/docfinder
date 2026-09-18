-- ==============================================================================
-- MIGRATION — Notifications push (nouveaux documents trouvés correspondants)
-- À exécuter UNE FOIS dans le Supabase SQL Editor (Dashboard → SQL Editor).
-- Idempotent : sans danger si déjà appliqué.
--
-- 1) Table push_subscriptions : une ligne par appareil (endpoint unique),
--    liée au profil citoyen. Le JSON d'abonnement est celui de la Push API
--    (endpoint + keys.p256dh + keys.auth).
-- 2) profiles.push_enabled : interrupteur maître (préférence utilisateur).
-- 3) RLS : chacun gère SES abonnements ; le rôle service_role (Edge Function
--    d'envoi) lit tout.
-- 4) RPC set_push_enabled : toggle côté client (passe par SECURITY DEFINER
--    pour éviter tout contournement).
-- ==============================================================================

-- 1) Table des abonnements push -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_profile
  ON public.push_subscriptions(profile_id);

-- Empêche le doublon exact (même appareil re-abonné) : endpoint = clé unique
-- (déjà contraint par UNIQUE ci-dessus ; l'INSERT du client fait ON CONFLICT).

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND is_active_profile()
  );

DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- service_role (Edge Function d'envoi) : contournement complet RLS par défaut
-- (le rôle bypassrls est attribué à service_role sur Supabase).

-- 2) Interrupteur maître par profil ---------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) RPC toggle (le client ne met à jour que son propre profil) ------------------
CREATE OR REPLACE FUNCTION public.set_push_enabled(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile UUID;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;
  UPDATE public.profiles SET push_enabled = COALESCE(p_enabled, FALSE) WHERE id = v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_push_enabled(BOOLEAN) TO authenticated;

-- 4) Déclencheur : à la création d'un match « suggested » avec score élevé,
--    notifier le chercheur (propriétaire de la déclaration de perte).
--    L'envoi passe par pg_net → Edge Function push-send (non bloquant).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_match_push()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_seeker_profile UUID;
  v_doc_type TEXT;
  v_city TEXT;
  v_qual TEXT;
  v_fn_url TEXT;
  v_anon_key TEXT;
BEGIN
  -- Seulement les nouveaux matches 'suggested' de qualité correcte
  IF NEW.status <> 'suggested' OR NEW.score_internal < 65 THEN
    RETURN NEW;
  END IF;

  SELECT ld.seeker_id, dt.name, ld.lost_city, NEW.match_qualitative
    INTO v_seeker_profile, v_doc_type, v_city, v_qual
  FROM public.lost_documents ld
  JOIN public.document_types dt ON dt.id = ld.document_type_id
  WHERE ld.id = NEW.lost_document_id;

  IF v_seeker_profile IS NULL THEN RETURN NEW; END IF;

  -- Ne pas notifier si le chercheur a désactivé les push (filtré aussi côté
  -- push-send, mais on évite l'appel réseau inutile)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_seeker_profile AND push_enabled = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  v_fn_url := current_setting('app.settings.push_fn_url', TRUE);
  IF v_fn_url IS NULL OR v_fn_url = '' THEN
    v_fn_url := 'https://sbuqfmzraowfjoasrqrj.supabase.co/functions/v1/push-send';
  END IF;
  v_anon_key := current_setting('app.settings.anon_key', TRUE);

  BEGIN
    PERFORM extensions.net.http_post(
      url := v_fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_anon_key, '')
      ),
      body := jsonb_build_object(
        'profile_ids', jsonb_build_array(v_seeker_profile),
        'payload', jsonb_build_object(
          'title', '🔔 DocFinder — Correspondance trouvée !',
          'body', 'Un ' || lower(v_doc_type) || ' signalé trouvé' ||
                  (CASE WHEN v_city IS NOT NULL THEN ' à ' || v_city ELSE '' END) ||
                  ' correspond à votre déclaration (confiance ' || v_qual || '). ' ||
                  'Ouvrez l''app pour vérifier.',
          'url', '/?action=dossiers',
          'tag', 'match-' || NEW.id::text
        )
      ),
      timeout_milliseconds := 8000
    );
  EXCEPTION WHEN OTHERS THEN
    -- pg_net absent / erreur réseau : ne JAMAIS faire échouer la création du match
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_match_push ON public.matches;
CREATE TRIGGER trg_notify_match_push
AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.notify_match_push();

-- 5) Audit : la colonne audit_logs.action est TEXT libre — les actions
--    'push_sent' / 'push_failed' passent sans migration supplémentaire.

-- 6) Configuration optionnelle (surcharge sans redéploiement) :
--    ALTER DATABASE postgres SET "app.settings.push_fn_url" = 'https://sbuqfmzraowfjoasrqrj.supabase.co/functions/v1/push-send';
--    ALTER DATABASE postgres SET "app.settings.anon_key" = '<votre clé anon>';
