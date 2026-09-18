// ==============================================================================
// pushService — Abonnement aux notifications push (côté navigateur)
// ==============================================================================
// Flux : Permission → PushManager.subscribe (clé VAPID publique) → la souscription
// est enregistrée dans push_subscriptions (RLS : uniquement son propre profil).
// Le toggle de préférence passe par la RPC set_push_enabled (SECURITY DEFINER).
// ==============================================================================
import { supabase, isSupabaseConfigured } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SUBS_TABLE = 'push_subscriptions';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export const pushService = {
  /** Le navigateur supporte-t-il les notifications push ? */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  /** Permission actuelle : 'granted' | 'denied' | 'default' | 'unsupported'. */
  permission(): string {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  /**
   * Active les push pour l'appareil courant : demande la permission, souscrit,
   * enregistre la souscription en base. Retourne un message d'état ou lève.
   */
  async enable(profileId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: 'Supabase non configuré' };
    if (!this.isSupported()) {
      return { ok: false, message: 'Notifications non supportées par ce navigateur' };
    }
    if (!VAPID_PUBLIC_KEY) {
      return { ok: false, message: 'Notifications non configurées (clé VAPID absente)' };
    }

    // 1) Permission (nécessite un geste utilisateur — appelé depuis un clic)
    let perm = Notification.permission;
    if (perm === 'denied') {
      return {
        ok: false,
        message: 'Notifications bloquées — autorisez-les dans les réglages du navigateur',
      };
    }
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      return { ok: false, message: 'Permission refusée' };
    }

    // 2) Service worker (prod uniquement ; en dev on reste sur le SW de prod si présent)
    const reg = await navigator.serviceWorker.ready;

    // 3) Souscription (existante ou nouvelle)
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
    }

    // 4) Enregistrement en base (RLS : son propre profil uniquement)
    const subJson = sub.toJSON();
    const { error } = await supabase.from(SUBS_TABLE).upsert(
      {
        profile_id: profileId,
        endpoint: subJson.endpoint,
        subscription: subJson,
        user_agent: navigator.userAgent.slice(0, 250),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      return { ok: false, message: 'Enregistrement impossible : ' + error.message };
    }

    // 5) Interrupteur maître ON
    await supabase.rpc('set_push_enabled', { p_enabled: true });

    return { ok: true, message: 'Notifications activées sur cet appareil' };
  },

  /** Désactive : retire l'abonnement de cet appareil + interrupteur maître OFF. */
  async disable(_profileId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: 'Supabase non configuré' };

    try {
      if (this.isSupported()) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await supabase.from(SUBS_TABLE).delete().eq('endpoint', sub.endpoint);
          await sub.unsubscribe();
        }
      }
      await supabase.rpc('set_push_enabled', { p_enabled: false });
      return { ok: true, message: 'Notifications désactivées' };
    } catch (err) {
      return { ok: false, message: 'Erreur : ' + String(err) };
    }
  },

  /** Test : envoie une notification de démonstration (passe par push-send). */
  async sendTest(): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: 'Supabase non configuré' };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, message: 'Non connecté' };

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: {
          title: '🔔 DocFinder — Test de notification',
          body: 'Parfait ! Vous recevrez une alerte dès qu\'un document trouvé correspondra à votre déclaration.',
          url: '/?action=dossiers',
          tag: 'test',
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: json.error || `Erreur ${res.status}` };
    return { ok: true, message: `Test envoyé (${json.sent} appareil${json.sent > 1 ? 's' : ''})` };
  },
};
