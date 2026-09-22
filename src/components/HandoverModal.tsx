import React, { useEffect, useState } from 'react';
import { X, Store, QrCode, Copy, CheckCircle2, MapPin, Loader2, AlertCircle, PackageCheck } from 'lucide-react';
import QRCode from 'qrcode';
import type { Partner } from '../types';
import { CheckoutSection } from './CheckoutSection';
import { dataService } from '../services/dataService';

interface HandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  recoveryRequestId: string | null;
  documentTitle?: string;
  onDeposited?: (pickupCode: string) => void;
}

/**
 * Dépôt du document chez un partenaire (côté trouveur).
 * 1. Choix du partenaire (annuaire actif)
 * 2. Confirmation → RPC deposit_document (génère le code + le séquestre)
 * 3. Affichage du code + QR à transmettre au chercheur
 */
export const HandoverModal: React.FC<HandoverModalProps> = ({
  isOpen,
  onClose,
  recoveryRequestId,
  documentTitle,
  onDeposited
}) => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [depositResult, setDepositResult] = useState<{ depositCode: string; recipientName: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDepositResult(null);
    setErrorMsg(null);
    setCopied(false);
    dataService.getActivePartners().then(list => {
      setPartners(list);
      if (list.length > 0) setSelectedPartner(list[0].id);
    }).catch(() => setPartners([]));
  }, [isOpen]);

  // Génération du QR : URL de la page partenaire, onglet confirmation de dépôt,
  // code de dépôt pré-rempli (présenté par le trouveur au comptoir)
  useEffect(() => {
    if (!depositResult) { setQrDataUrl(null); return; }
    const url = `${window.location.origin}${window.location.pathname}#partenaire?dep=${depositResult.depositCode}`;
    QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [depositResult]);

  if (!isOpen) return null;

  const handleDeposit = async () => {
    if (!recoveryRequestId || !selectedPartner) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await dataService.depositDocument(recoveryRequestId, selectedPartner);
      setDepositResult({ depositCode: res.pickupCode, recipientName: res.recipientName });
      onDeposited?.(res.pickupCode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors du dépôt.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (!depositResult) return;
    try {
      navigator.clipboard?.writeText(depositResult.depositCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard indisponible */ }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--primary-100)',
              color: 'var(--primary-800)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Store size={18} />
            </div>
            <div>
              <h2 className="modal-title">Dépôt chez un partenaire</h2>
              {documentTitle && (
                <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '1px' }}>
                  {documentTitle}
                </div>
              )}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {!depositResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <CheckoutSection step={1} title="Choisissez le point de dépôt" subtitle="Le document y sera conservé en sécurité" />

              <div style={{
                background: 'var(--slate-50)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                fontSize: '0.78rem',
                color: 'var(--slate-600)',
                display: 'flex',
                gap: '8px'
              }}>
                <PackageCheck size={16} style={{ flexShrink: 0, color: 'var(--primary-700)', marginTop: '2px' }} />
                <span>
                  Choisissez le partenaire qui gardera la pièce. Un <strong>code de dépôt</strong> sera généré :
                  présentez-le avec le document au comptoir — <strong>c'est le partenaire qui confirme le dépôt</strong>
                  en le saisissant. Sans sa confirmation, le dépôt n'existe pas.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Partenaire *</label>
                {partners.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                    Aucun partenaire actif pour le moment — contactez l'administration.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {partners.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPartner(p.id)}
                        style={{
                          textAlign: 'left',
                          background: selectedPartner === p.id ? 'var(--primary-50)' : 'var(--surface-card)',
                          border: selectedPartner === p.id ? '2px solid var(--primary-600)' : '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px'
                        }}
                      >
                        <Store size={16} style={{ flexShrink: 0, color: 'var(--primary-700)', marginTop: '2px' }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 800, fontSize: '0.85rem', color: 'var(--slate-900)' }}>
                            {p.name}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                            <MapPin size={11} />
                            {p.address || ''}{p.city ? ` — ${p.city}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {errorMsg && (
                <div style={{
                  background: 'var(--red-50, #fef2f2)',
                  border: '1px solid var(--red-100, #fecaca)',
                  color: 'var(--red-700, #b91c1c)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="button"
                className="btn-cta-lost"
                disabled={loading || !selectedPartner}
                style={{
                  backgroundColor: 'var(--primary-700)',
                  color: '#ffffff',
                  opacity: loading || !selectedPartner ? 0.7 : 1,
                  cursor: loading || !selectedPartner ? 'not-allowed' : 'pointer'
                }}
                onClick={handleDeposit}
              >
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Loader2 size={16} className="animate-spin" />
                    Génération du dépôt…
                  </span>
                ) : (
                  'Confirmer le dépôt et générer le code →'
                )}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--primary-100)',
                color: 'var(--primary-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto'
              }}>
                <CheckCircle2 size={36} />
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Dépôt initialisé !
              </h3>

              <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', lineHeight: 1.5 }}>
                Présentez ce <strong>code de dépôt</strong> avec le document au comptoir du partenaire.
                Il le saisira pour <strong>confirmer qu'il détient la pièce</strong> — le propriétaire
                recevra alors son code de retrait.
              </p>

              <button
                type="button"
                onClick={copyCode}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  background: 'var(--slate-100)',
                  border: '2px dashed var(--primary-300)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px',
                  cursor: 'pointer',
                  margin: '0 auto',
                  width: '100%',
                  maxWidth: '320px'
                }}
                title="Cliquer pour copier"
              >
                <span style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  letterSpacing: '0.15em',
                  color: 'var(--primary-800)'
                }}>
                  {depositResult.depositCode}
                </span>
                {copied ? <CheckCircle2 size={18} color="var(--primary-700)" /> : <Copy size={18} color="var(--slate-500)" />}
              </button>
              <div style={{ fontSize: '0.7rem', color: 'var(--slate-500)', marginTop: '-6px' }}>
                Code de dépôt — pour le partenaire uniquement
              </div>

              {qrDataUrl && (
                <div style={{ margin: '0 auto' }}>
                  <img
                    src={qrDataUrl}
                    alt="QR code de retrait"
                    style={{
                      width: '180px',
                      height: '180px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)'
                    }}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <QrCode size={12} />
                    Le partenaire scanne ce QR pour confirmer le dépôt
                  </div>
                </div>
              )}

              <div style={{
                background: 'var(--slate-50)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                fontSize: '0.76rem',
                color: 'var(--slate-600)',
                textAlign: 'left'
              }}>
                <strong>Destinataire attendu :</strong> {depositResult.recipientName}
                <br />
                <strong>Si le partenaire ne confirme pas sous 72 h</strong>, le dépôt est annulé
                automatiquement et vous pouvez le déposer ailleurs.
                <br />
                <strong>Après confirmation :</strong> garde de 30 jours chez le partenaire.
              </div>

              <button
                type="button"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff' }}
                onClick={onClose}
              >
                Terminer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
