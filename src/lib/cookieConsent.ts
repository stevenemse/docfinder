// Consentement cookies — stocké dans localStorage (lui-même exempté : strictement nécessaire
// pour mémoriser le choix et ne pas re-afficher le bandeau à chaque page).

const CONSENT_KEY = 'df_cookie_consent';

// null = pas encore répondu (bandeau à afficher)
export function getCookieConsent(): boolean | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === 'accepted') return true;
    if (v === 'refused') return false;
  } catch {
    // localStorage indisponible
  }
  return null;
}
