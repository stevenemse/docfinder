// ==============================================================================
// offlineCache — Cache local (localStorage) des données de l'utilisateur
// ==============================================================================
// Rend l'app utile hors connexion : les données chargées pendant les sessions
// en ligne (catalogue public, dossiers, correspondances, restitutions) sont
// mises en cache et relues instantanément quand le réseau tombe.
//
// Sécurité : UNIQUEMENT les données du compte courant — le cache est préfixé
// par l'identifiant du profil et vidé à la déconnexion. Les données admin
// (citoyens, preuves, journal d'audit) ne sont jamais mises en cache.
// ==============================================================================

const NS = 'df_offline_v1';

function key(scope: string, id: string | null): string {
  return `${NS}:${scope}:${id ?? 'anon'}`;
}

function read(scope: string, id: string | null): unknown | null {
  try {
    const raw = localStorage.getItem(key(scope, id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(scope: string, id: string | null, value: unknown): void {
  try {
    localStorage.setItem(key(scope, id), JSON.stringify(value));
  } catch {
    // Quota dépassé / storage indisponible : le cache est un bonus, jamais vital
  }
}

/** Cache la liste des documents trouvés publics (catalogue consultable hors ligne). */
export function cacheFoundDocs(profileId: string | null, docs: unknown[]): void {
  write('found', profileId, { t: Date.now(), docs });
}

/** Cache les dossiers personnels (déclarations, correspondances, restitutions). */
export function cacheMyDossiers(
  profileId: string | null,
  data: { lost: unknown[]; matches: unknown[]; recoveries: unknown[]; payments: unknown[] }
): void {
  write('dossiers', profileId, { t: Date.now(), ...data });
}

/** Retourne le catalogue en cache (null si absent). */
export function getCachedFoundDocs(profileId: string | null): unknown[] | null {
  const c = read('found', profileId) as { docs: unknown[] } | null;
  return c?.docs ?? null;
}

/** Retourne les dossiers personnels en cache (null si absent). */
export function getCachedMyDossiers(profileId: string | null):
  { lost: unknown[]; matches: unknown[]; recoveries: unknown[]; payments: unknown[] } | null {
  return read('dossiers', profileId) as
    { lost: unknown[]; matches: unknown[]; recoveries: unknown[]; payments: unknown[] } | null;
}

/** Purge absolue (déconnexion / changement de compte). */
export function clearOfflineCache(profileId?: string | null): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(`${NS}:`));
    for (const k of keys) {
      if (profileId === undefined || k.endsWith(`:${profileId ?? 'anon'}`)) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* noop */
  }
}
