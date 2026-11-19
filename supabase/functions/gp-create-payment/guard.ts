// =============================================================================
// Garde anti-double paiement — logique pure (testable hors Edge Function)
// =============================================================================
// Une demande de restitution ne doit donner lieu qu'à UN seul paiement réel de
// 2 000 FCFA. Deux verrous complémentaires :
//   1. en base : index unique partiel payments_one_pending_per_request
//      (au plus une ligne 'pending' par recovery_request_id) ;
//   2. ici : avant d'appeler GeniusPay, on refuse une nouvelle initiation si un
//      paiement est déjà payé, en cours d'initialisation ou en attente.
// Sans le second verrou, deux checkouts pouvaient être créés et tous deux
// encaissés (cas ae70a7e4 : 2 × 2 000 F pour un forfait unique).

/** Référence locale d'une ligne 'pending' réservée avant l'appel marchand. */
export const LOCAL_RESERVATION_PREFIX = 'RSV_';

/** Au-delà, une réservation sans référence GeniusPay est considérée abandonnée. */
export const RESERVATION_TTL_MS = 2 * 60 * 1000;

export interface ExistingPayment {
  id: string;
  status: string;
  transaction_ref: string;
  checkout_url: string | null;
  created_at: string;
}

export type Decision =
  /** Aucun paiement en cours : on peut créer le checkout (après réservation). */
  | { action: 'proceed' }
  /** Ligne 'pending' obsolète à clore en base avant de continuer. */
  | { action: 'settle'; paymentId: string; to: 'failed' | 'cancelled' | 'expired' }
  /** Initiation refusée ; checkoutUrl permet de reprendre un paiement existant. */
  | { action: 'refuse'; error: string; checkoutUrl?: string; reference?: string };

const MESSAGE_ALREADY_PAID =
  "Cette restitution a déjà été réglée : aucun second paiement n'est nécessaire.";
const MESSAGE_CONFIRMING =
  "Votre paiement a déjà été effectué : la restitution est en cours de confirmation.";
const MESSAGE_INITIALISING =
  "Un paiement est déjà en cours d'initialisation pour cette restitution. Patientez un instant avant de réessayer.";
const MESSAGE_PENDING =
  'Un paiement est déjà en attente pour cette restitution. Finalisez-le depuis le lien de paiement ou réessayez dans quelques minutes.';

/**
 * Décide quoi faire d'une nouvelle initiation.
 *
 * @param existing     paiements de la demande (tous statuts)
 * @param remoteStatus statut GeniusPay de la ligne 'pending' courante
 *                     (null si l'agrégateur est injoignable)
 * @param nowMs        horloge injectable pour les tests
 */
export function planPaymentInitiation(
  existing: ExistingPayment[],
  remoteStatus: string | null,
  nowMs: number = Date.now(),
): Decision {
  // Un forfait déjà encaissé ferme définitivement la demande.
  if (existing.some((p) => p.status === 'paid')) {
    return { action: 'refuse', error: MESSAGE_ALREADY_PAID };
  }

  // Une seule ligne 'pending' possible (index unique partiel en base) : on
  // prend la plus récente par sécurité.
  const pending = existing.filter((p) => p.status === 'pending').at(-1);
  if (!pending) return { action: 'proceed' };

  // Réservation d'une initiation concurrente, pas encore de checkout.
  if (pending.transaction_ref.startsWith(LOCAL_RESERVATION_PREFIX)) {
    const createdMs = Date.parse(pending.created_at);
    const age = Number.isFinite(createdMs) ? nowMs - createdMs : Number.POSITIVE_INFINITY;
    return age < RESERVATION_TTL_MS
      ? { action: 'refuse', error: MESSAGE_INITIALISING }
      : { action: 'settle', paymentId: pending.id, to: 'expired' };
  }

  // Paiement réel en attente : seul GeniusPay fait foi.
  switch ((remoteStatus || '').toLowerCase()) {
    case 'completed':
      return { action: 'refuse', error: MESSAGE_CONFIRMING };
    case 'failed':
    case 'cancelled':
    case 'expired':
      return {
        action: 'settle',
        paymentId: pending.id,
        to: (remoteStatus || '').toLowerCase() as 'failed' | 'cancelled' | 'expired',
      };
    case 'pending':
    case 'processing':
    case 'initiated':
      // Checkout encore valable : on renvoie le même (aucun second débit).
      return pending.checkout_url
        ? {
            action: 'refuse',
            error: MESSAGE_PENDING,
            checkoutUrl: pending.checkout_url,
            reference: pending.transaction_ref,
          }
        : { action: 'refuse', error: MESSAGE_PENDING };
    default:
      // Statut distant inconnu : on refuse plutôt que de risquer un 2e débit.
      return { action: 'refuse', error: MESSAGE_PENDING };
  }
}
