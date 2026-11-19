/**
 * Traduction centralisée des erreurs Supabase / PostgREST / réseau en messages
 * destinés à l'utilisateur.
 *
 * Règle : le détail technique (code SQL, message de la base, trace) ne doit
 * JAMAIS atteindre l'écran ; il reste dans la console pour le diagnostic.
 */

type Rule = { test: RegExp; message: string };

const ACTIVE_ACCOUNT_REQUIRED =
  'Ce compte est suspendu : la connexion est bloquée. Écrivez à docfinder@gmail.com pour le rétablir.';

const RULES: Rule[] = [
  // Authentification
  // Compte banni côté Supabase Auth (banned_until) ou suspendu côté profil :
  // ne jamais afficher « identifiants incorrects », l'utilisateur doit savoir
  // que son compte est en cause et à qui s'adresser.
  // Volontairement restreint : seuls les marqueurs d'un refus de connexion
  // comptent. Les mots nus « suspendu », « blocked » ou « CORS » apparaissent
  // dans des erreurs réseau sans rapport avec l'état du compte.
  { test: /user_banned|user is banned|user banned|banned_until/i, message: ACTIVE_ACCOUNT_REQUIRED },
  { test: /compte (est )?(suspendu|bloqué)/i, message: ACTIVE_ACCOUNT_REQUIRED },
  { test: /invalid login credentials|invalid_credentials/i, message: 'Numéro/email ou mot de passe incorrect.' },
  { test: /email not confirmed/i, message: 'Confirmez votre adresse email avant de vous connecter.' },
  { test: /user already registered|already been registered|duplicate key.*profiles/i, message: 'Ce numéro possède déjà un compte. Connectez-vous plutôt.' },
  { test: /password should be at least|weak_password/i, message: 'Mot de passe trop court : 8 caractères minimum.' },
  { test: /rate limit|too many requests|over_email_send_rate_limit/i, message: 'Trop de tentatives. Patientez une minute avant de réessayer.' },
  { test: /jwt|token (has )?expired|refresh_token_not_found|session.*missing/i, message: 'Votre session a expiré. Reconnectez-vous pour continuer.' },

  // Autorisations
  { test: /row-level security|permission denied|42501|accès (refusé|réservé)/i, message: "Cette action n'est pas autorisée pour votre compte." },
  { test: /profils? introuvable|profile.*not found/i, message: 'Profil introuvable. Reconnectez-vous ou réinscrivez-vous.' },

  // Paiement (Edge Function gp-create-payment — anti-double paiement)
  { test: /restitution.*déjà (été )?r[ée]gl[ée]e|déjà été réglée/i, message: "Cette restitution a déjà été réglée : aucun second paiement n'est nécessaire." },
  { test: /paiement (est )?déjà en (attente|initialisation)|déjà été effectué/i, message: "Un paiement est déjà en attente pour cette restitution. Finalisez-le depuis le lien de paiement ou réessayez dans quelques minutes." },

  // Données / contraintes
  { test: /violates foreign key|23503/i, message: "Ce dossier n'existe plus ou a été supprimé." },
  { test: /violates not-null|23502/i, message: 'Un champ obligatoire est manquant. Vérifiez le formulaire.' },
  { test: /invalid input syntax|22P02/i, message: 'Une valeur saisie est invalide. Vérifiez le formulaire.' },
  { test: /duplicate key|23505/i, message: 'Cet enregistrement existe déjà.' },
  { test: /payload too large|413/i, message: 'Fichier trop volumineux. Choisissez une image plus légère.' },
  { test: /mime|content.?type|415/i, message: 'Format de fichier non accepté (image JPEG/PNG attendue).' },

  // Réseau
  { test: /failed to fetch|load failed|networkerror|network request failed|cors|blocked by client/i, message: 'Connexion instable — vérifiez votre réseau puis réessayez.' },
  { test: /timeout|timed out|504/i, message: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.' },
  { test: /function .* does not exist|pgrst202/i, message: "Service momentanément indisponible (mise à jour en cours). Réessayez plus tard." },
];

const GENERIC = 'Une erreur est survenue. Réessayez dans un instant.';

/**
 * Renvoie un message affichable pour n'importe quelle erreur (objet Supabase,
 * Error, chaîne renvoyée par un service, valeur inconnue).
 *
 * @param error    l'erreur brute (jamais affichée telle quelle)
 * @param fallback message spécifique au contexte si rien ne correspond
 */
export function handleSupabaseError(error: unknown, fallback: string = GENERIC): string {
  if (!error) return fallback;

  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
          ? String(
              (error as { message?: unknown }).message ??
                (error as { error_description?: unknown }).error_description ??
                ''
            )
          : '';

  const text = raw.trim();
  if (!text) return fallback;

  // Trace technique conservée pour le diagnostic, jamais montrée à l'écran.
  console.warn('[docfinder] erreur technique:', raw);

  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.message;
  }
  return fallback;
}

/** Identifiant DOM stable pour relier un champ à son message d'erreur. */
export function errorId(form: string, field: string): string {
  return `${form}-${field}-error`;
}
