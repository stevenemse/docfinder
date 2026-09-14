// ==============================================================================
// Hachage SHA-256 des données sensibles (Web Crypto API — native, sans dépendance)
//
// Le client n'envoie JAMAIS le numéro complet de pièce ni la réponse secrète en
// clair : ils sont normalisés puis hachés ici. Le SQL (public.hash_secret)
// reproduit exactement normalizeSecret() pour permettre la comparaison côté
// serveur sans jamais stocker la donnée brute.
// ==============================================================================

/**
 * Normalisation partagée client/serveur :
 * minuscules, accents retirés (Bafoussam === bafoussam), espaces/tirets/points
 * et underscores supprimés (102 938 === 102938).
 */
export function normalizeSecret(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les diacritiques (é → e)
    .replace(/[\s\-_.]/g, '');
}

/** SHA-256 hexadécimal d'une donnée sensible normalisée. */
export async function sha256Hex(value: string): Promise<string> {
  const normalized = normalizeSecret(value);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Génère une référence de transaction unique (reçus Mobile Money). */
export function generateTransactionRef(prefix = 'TX-CMR'): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}${rand}`;
}
