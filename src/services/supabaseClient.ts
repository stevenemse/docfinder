import { createClient } from '@supabase/supabase-js';

const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

/**
 * True uniquement quand de vraies clés sont fournies (.env.local / variables
 * d'environnement de production). Sinon l'app tourne en mode démo (localStorage).
 */
export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(envUrl) &&
    Boolean(envKey) &&
    !envUrl.includes('placeholder') &&
    !envUrl.includes('your-project') &&
    envUrl.startsWith('https://')
  );
};

/**
 * CLIENT UNIQUE de tout l'application (élimine le double GoTrueClient).
 * L'anon key est une clé publique : la sécurité est garantie par les
 * politiques RLS de supabase/schema.sql, pas par le secret du client.
 */
export const supabase = createClient(
  isSupabaseConfigured() ? envUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured() ? envKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Détecte la session dans l'URL (#access_token=…) : indispensable au
      // retour du flux OAuth Google (retour implicite avec jeton dans le hash).
      detectSessionInUrl: true
    }
  }
);
