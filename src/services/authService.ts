import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { Profile, UserRole } from '../types';

// Profils de démonstration — compte citoyen unifié
// Un même citoyen peut à la fois chercher ET signaler des documents trouvés
export const DEMO_PROFILES: Record<string, Profile> = {
  citizen1: {
    id: 'prof-citizen1',
    user_id: 'user-citizen1',
    role: 'citizen',
    display_name: 'Chantal Kamga',
    phone: '+237655443322',
    email: 'chantal.kamga@docfinder.cm',
    is_verified: true,
    status: 'active',
    created_at: new Date('2026-02-15').toISOString(),
    updated_at: new Date('2026-02-15').toISOString()
  },
  citizen2: {
    id: 'prof-citizen2',
    user_id: 'user-citizen2',
    role: 'citizen',
    display_name: "Paul Eto'o",
    phone: '+237677112233',
    email: 'paul.etoo@docfinder.cm',
    is_verified: true,
    status: 'active',
    created_at: new Date('2026-02-18').toISOString(),
    updated_at: new Date('2026-02-18').toISOString()
  },
  admin: {
    id: 'prof-admin',
    user_id: 'user-admin',
    role: 'admin',
    display_name: 'Modérateur DPO DocFinder',
    phone: '+237699001122',
    email: 'admin@docfinder.cm',
    is_verified: true,
    status: 'active',
    created_at: new Date('2026-01-10').toISOString(),
    updated_at: new Date('2026-01-10').toISOString()
  }
};

export interface AuthSessionState {
  isAuthenticated: boolean;
  profile: Profile | null;
  role: UserRole;
  isLiveSupabase: boolean;
}

const STORAGE_SESSION_KEY = 'docfinder_active_session';

// Normalise le numéro camerounais : "677 11 22 33" → "+237677112233"
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('237')) return `+${digits}`;
  if (digits.startsWith('6') || digits.startsWith('2')) return `+237${digits}`;
  return `+237${digits}`;
}

// Génère un email synthétique depuis le numéro (pour Supabase Auth qui requiert un email)
function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@phone.docfinder.cm`;
}

export const authService = {
  // Récupère la session active (Supabase ou localStorage)
  async getInitialSession(): Promise<AuthSessionState> {
    if (isSupabaseConfigured()) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          let { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', session.user.id)
            .single();

          // Session sans profil = retour OAuth (premier login Google) :
          // on auto-crée le profil depuis les métadonnées Google.
          if (!profile) {
            profile = await authService.ensureProfile();
          }

          if (profile) {
            return {
              isAuthenticated: true,
              profile: profile as Profile,
              role: profile.role,
              isLiveSupabase: true
            };
          }
        }
      } catch (err) {
        console.warn('Erreur session Supabase:', err);
      }
    }

    // Fallback : session persistée localement
    try {
      const stored = localStorage.getItem(STORAGE_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Profile;
        return {
          isAuthenticated: true,
          profile: parsed,
          role: parsed.role,
          isLiveSupabase: isSupabaseConfigured()
        };
      }
    } catch {
      // Ignore parsing errors
    }

    return {
      isAuthenticated: false,
      profile: null,
      role: 'citizen',
      isLiveSupabase: isSupabaseConfigured()
    };
  },

  // Inscription avec téléphone (identifiant principal) et email optionnel
  async register(params: {
    phone: string;
    password: string;
    displayName: string;
    email?: string;
  }): Promise<{ profile: Profile | null; error?: string }> {
    const { phone, password, displayName, email } = params;
    const normalizedPhone = normalizePhone(phone);
    // Supabase Auth utilise un email — on génère un email depuis le téléphone si aucun email fourni
    const authEmail = email?.trim() ? email.trim() : phoneToEmail(normalizedPhone);

    if (isSupabaseConfigured()) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            data: {
              display_name: displayName,
              phone: normalizedPhone
            }
          }
        });

        if (authError) {
          return { profile: null, error: authError.message };
        }

        if (authData.user) {
          const newProfile = {
            user_id: authData.user.id,
            role: 'citizen' as const,
            display_name: displayName,
            phone: normalizedPhone,
            email: email?.trim() || null,
            is_verified: true,
            status: 'active' as const
          };

          const { data: insertedProfile, error: profileError } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();

          if (profileError) {
            return { profile: null, error: profileError.message };
          }

          localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(insertedProfile));
          return { profile: insertedProfile as Profile };
        }
      } catch (err: any) {
        return { profile: null, error: err.message || 'Erreur réseau Supabase' };
      }
    }

    // Mode démo : simulation locale
    const simulatedProfile: Profile = {
      id: `prof-${Date.now()}`,
      user_id: `user-${Date.now()}`,
      role: 'citizen',
      display_name: displayName,
      phone: normalizedPhone,
      email: email?.trim() || null,
      is_verified: true,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(simulatedProfile));
    return { profile: simulatedProfile };
  },

  // Connexion par téléphone + mot de passe (email comme alternative)
  async login(params: {
    phoneOrEmail: string;
    password: string;
  }): Promise<{ profile: Profile | null; error?: string }> {
    const { phoneOrEmail, password } = params;

    // Détermine si c'est un numéro ou un email
    const isEmail = phoneOrEmail.includes('@');
    const authEmail = isEmail
      ? phoneOrEmail.trim()
      : phoneToEmail(normalizePhone(phoneOrEmail));

    if (isSupabaseConfigured()) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password
        });

        if (authError) {
          return { profile: null, error: 'Numéro/email ou mot de passe incorrect.' };
        }

        if (authData.user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', authData.user.id)
            .single();

          if (profileError || !profile) {
            return { profile: null, error: 'Profil introuvable. Veuillez vous réinscrire.' };
          }

          localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
          return { profile: profile as Profile };
        }
      } catch (err: any) {
        return { profile: null, error: err.message || 'Erreur de connexion' };
      }
    }

    // Mode démo : détecte le profil depuis le numéro ou l'email
    let demoProfile: Profile;
    if (phoneOrEmail.includes('admin')) {
      demoProfile = DEMO_PROFILES.admin;
    } else {
      // Par défaut, citoyen standard
      demoProfile = DEMO_PROFILES.citizen1;
    }

    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(demoProfile));
    return { profile: demoProfile };
  },

  // Connexion / inscription via Google (OAuth) — zéro friction :
  // un clic, l'utilisateur choisit son compte Google et revient connecté.
  // Le profil est auto-créé au retour (ensureProfile) avec le nom Google.
  async signInWithGoogle(): Promise<{ error?: string }> {
    if (!isSupabaseConfigured()) {
      return { error: 'Google n\'est disponible qu\'en ligne. Utilisez le formulaire numéro + mot de passe.' };
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' }
        }
      });
      if (error) return { error: error.message };
      // Redirection vers Google en cours — le retour passera par getInitialSession
      return {};
    } catch (err: any) {
      return { error: err.message || 'Erreur de connexion Google' };
    }
  },

  // Crée le profil s'il n'existe pas encore (retour OAuth, premier login Google)
  async ensureProfile(): Promise<Profile | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      const user = session.user;

      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) return existing as Profile;

      // Auto-création : nom depuis Google, téléphone laissé à compléter
      const displayName =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        (user.email ? user.email.split('@')[0] : 'Utilisateur Google');

      const { data: created, error } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          role: 'citizen' as const,
          display_name: displayName,
          phone: null,
          email: user.email ?? null,
          is_verified: true,
          status: 'active' as const
        })
        .select()
        .single();

      if (error || !created) {
        console.warn('ensureProfile : échec auto-création :', error?.message);
        return null;
      }
      return created as Profile;
    } catch (err) {
      console.warn('ensureProfile :', err);
      return null;
    }
  },

  // Accès rapide pour tests
  loginAsDemo(key: 'citizen1' | 'citizen2' | 'admin'): Profile {
    const profile = DEMO_PROFILES[key];
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
    return profile;
  },

  // Déconnexion
  async logout(): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Erreur déconnexion Supabase:', err);
      }
    }
    localStorage.removeItem(STORAGE_SESSION_KEY);
  }
};
