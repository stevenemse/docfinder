import React, { useEffect, useState } from 'react';
import { Wallet, Store, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { dataService } from '../services/dataService';
import type { CitizenWallet, PartnerWalletFull } from '../types';

const WALLET_STATUS_LABELS: Record<string, string> = {
  held: 'séquestré',
  released: 'versé',
  cancelled: 'annulé',
  paid: 'payé',
  pending: 'en attente',
  failed: 'échoué'
};

const PARTNER_STATUS_LABELS: Record<string, string> = {
  pending: 'Temporaire (en validation)',
  active: 'Actif',
  suspended: 'Suspendu',
  rejected: 'Refusé'
};

interface WalletSectionProps {
  profileId: string;
  /** Ouvre la page partenaire : wallet (retraits) ou candidature. */
  onOpenPartnerPage?: (tab?: 'scan' | 'wallet') => void;
  /** Amène l'utilisateur au dossier de restitution concerné. */
  onOpenRestitution?: (requestId: string) => void;
}

/**
 * Les DEUX portefeuilles du compte, volontairement séparés à l'écran :
 *  - Wallet Citoyen  : gains de trouveur + frais de restitution payés ;
 *  - Wallet Partenaire : dividendes par retrait confirmé + solde retirable.
 * Un même compte peut avoir les deux ; un compte sans point de dépôt voit une
 * invitation, jamais un solde trompeur.
 */
export const WalletSection: React.FC<WalletSectionProps> = ({
  profileId,
  onOpenPartnerPage,
  onOpenRestitution
}) => {
  const [citizenWallet, setCitizenWallet] = useState<CitizenWallet | null>(null);
  const [citizenLoading, setCitizenLoading] = useState(true);
  const [partnerInfo, setPartnerInfo] = useState<{ id: string; name: string; status: string } | null | undefined>(undefined);
  const [partnerWallet, setPartnerWallet] = useState<PartnerWalletFull | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCitizenLoading(true);
    dataService.getMyCitizenWallet(profileId)
      .then(w => { if (!cancelled) setCitizenWallet(w); })
      .catch(() => { if (!cancelled) setCitizenWallet({ earned_total: 0, escrow_total: 0, paid_total: 0, movements: [] }); })
      .finally(() => { if (!cancelled) setCitizenLoading(false); });

    dataService.getMyPartnerStatus()
      .then(p => {
        if (cancelled) return;
        setPartnerInfo(p ? { id: p.id, name: p.name, status: p.status } : null);
        if (p) {
          dataService.getMyPartnerWallet()
            .then(w => { if (!cancelled) setPartnerWallet(w); })
            .catch(() => { /* wallet partenaire indisponible : on affichera — */ });
        }
      })
      .catch(() => { if (!cancelled) setPartnerInfo(null); });

    return () => { cancelled = true; };
  }, [profileId]);

  const formatFcfa = (amount: number) =>
    `${amount.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`;

  return (
    <div className="wallet-grid">
      {/* ── Wallet Citoyen : gains de trouveur + frais de propriétaire ── */}
      <div className="wallet-card wallet-card--citizen">
        <div className="wallet-card-head">
          <div className="wallet-card-title">
            <Wallet size={16} color="var(--primary-700)" />
            Wallet Citoyen
          </div>
        </div>

        {citizenLoading && !citizenWallet ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--slate-500)', fontSize: '0.8rem' }}>
            <Loader2 size={15} className="animate-spin" /> Chargement du wallet…
          </div>
        ) : (
          <>
            <div>
              <div className="wallet-amount">{formatFcfa(citizenWallet?.earned_total ?? 0)}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--slate-500)', fontWeight: 600, marginTop: '2px' }}>
                Gains de restitution perçus
              </div>
            </div>
            <div className="wallet-rows">
              <div className="wallet-row">
                <span>En séquestre (restitution en cours)</span>
                <strong>{formatFcfa(citizenWallet?.escrow_total ?? 0)}</strong>
              </div>
              <div className="wallet-row">
                <span>Frais de restitution payés</span>
                <strong>{formatFcfa(citizenWallet?.paid_total ?? 0)}</strong>
              </div>
            </div>
            <p className="wallet-note">
              Votre portefeuille de citoyen : vous gagnez en rendant un document, vous payez
              pour récupérer le vôtre. Les gains partent sur votre numéro Mobile Money dès que
              la remise est confirmée chez un partenaire.
            </p>

            {(citizenWallet?.movements.length ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate-500)', marginBottom: '4px' }}>
                  Derniers mouvements
                </div>
                {(citizenWallet?.movements ?? []).slice(0, 5).map(m => (
                  <div key={m.id} className="wallet-movement">
                    <div style={{ display: 'flex', gap: '8px', minWidth: 0 }}>
                      <div style={{ flexShrink: 0, marginTop: '2px', color: m.kind === 'earning' ? 'var(--primary-700)' : 'var(--slate-500)' }}>
                        {m.kind === 'earning' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="wallet-movement-label">{m.label}</div>
                        <div className="wallet-movement-meta">
                          {new Date(m.at).toLocaleDateString('fr-FR')} ·{' '}
                          {WALLET_STATUS_LABELS[m.status] ?? m.status}
                        </div>
                        {m.recovery_request_id && onOpenRestitution && (
                          <button
                            type="button"
                            onClick={() => onOpenRestitution(m.recovery_request_id as string)}
                            style={{
                              background: 'none', border: 'none', padding: 0, marginTop: '2px',
                              color: 'var(--primary-700)', fontWeight: 700, fontSize: '0.72rem',
                              cursor: 'pointer', textDecoration: 'underline'
                            }}
                          >
                            Voir le dossier →
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={`wallet-movement-amount ${m.kind === 'earning' ? 'wallet-movement-amount--in' : 'wallet-movement-amount--out'}`}>
                      {m.kind === 'earning' ? '+' : '−'}{formatFcfa(m.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Wallet Partenaire : dividendes et retraits (si rattaché) ── */}
      <div className="wallet-card wallet-card--partner">
        <div className="wallet-card-head">
          <div className="wallet-card-title">
            <Store size={16} color="var(--gold-600, #b7791f)" />
            Wallet Partenaire
          </div>
        </div>

        {partnerInfo === undefined ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--slate-500)', fontSize: '0.8rem' }}>
            <Loader2 size={15} className="animate-spin" /> Vérification du compte partenaire…
          </div>
        ) : !partnerInfo ? (
          <>
            <p className="wallet-note" style={{ fontSize: '0.8rem', color: 'var(--slate-600)' }}>
              Aucun point de dépôt rattaché à ce compte. Boutiques MoMo, cybercafés : recevez les
              documents trouvés et percevez un dividende à chaque retrait confirmé. C'est un
              portefeuille séparé, alimenté uniquement par l'activité partenaire.
            </p>
            {onOpenPartnerPage && (
              <button
                type="button"
                onClick={() => onOpenPartnerPage('scan')}
                style={{
                  alignSelf: 'flex-start', background: 'var(--primary-700)', color: '#ffffff',
                  border: 'none', borderRadius: 'var(--radius-md)', padding: '8px 14px',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Devenir partenaire →
              </button>
            )}
          </>
        ) : (
          <>
            <div>
              <div className="wallet-amount wallet-amount--partner">
                {partnerWallet ? formatFcfa(partnerWallet.available_balance) : '— FCFA'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--slate-500)', fontWeight: 600, marginTop: '2px' }}>
                Solde disponible au retrait · {partnerInfo.name}
              </div>
            </div>
            <div className="wallet-rows">
              <div className="wallet-row">
                <span>Dividendes en attente</span>
                <strong>{formatFcfa(partnerWallet?.total_pending ?? 0)}</strong>
              </div>
              <div className="wallet-row">
                <span>Dividendes déjà payés</span>
                <strong>{formatFcfa(partnerWallet?.total_paid ?? 0)}</strong>
              </div>
              <div className="wallet-row">
                <span>Statut du point de dépôt</span>
                <strong>{PARTNER_STATUS_LABELS[partnerInfo.status] ?? partnerInfo.status}</strong>
              </div>
            </div>
            <p className="wallet-note">
              Les retraits Mobile Money se demandent depuis la page partenaire
              {partnerWallet?.min_withdrawal ? ` (seuil ${formatFcfa(partnerWallet.min_withdrawal)})` : ''}.
            </p>
            {onOpenPartnerPage && (
              <button
                type="button"
                onClick={() => onOpenPartnerPage('wallet')}
                style={{
                  alignSelf: 'flex-start', background: 'var(--surface-subtle, #f1f5f9)', color: 'var(--primary-800)',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '8px 14px',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Ouvrir mon wallet partenaire →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
