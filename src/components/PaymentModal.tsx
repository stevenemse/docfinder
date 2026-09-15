import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  CheckCircle2, 
  ShieldCheck, 
  Lock,
  Loader2,
  PhoneCall
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { PaymentProviderType } from '../types';
import { CheckoutSection } from './CheckoutSection';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  recoveryRequestId: string;
  onPaymentSuccess: (requestId: string, provider: PaymentProviderType, txRef: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  recoveryRequestId,
  onPaymentSuccess
}) => {
  const [selectedProvider, setSelectedProvider] = useState<PaymentProviderType>('mtn_momo');
  const [phoneNumber, setPhoneNumber] = useState<string>('677123456');
  const [paymentStep, setPaymentStep] = useState<'form' | 'ussd_pending' | 'success'>('form');
  const [transactionRef, setTransactionRef] = useState<string>('');

  if (!isOpen) return null;

  const handleInitiatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentStep('ussd_pending');

    const generatedRef = `TX-CMR-${Date.now().toString().slice(-6)}`;
    setTransactionRef(generatedRef);

    // Simulate USSD prompt confirmation after 3.2 seconds
    setTimeout(() => {
      setPaymentStep('success');
      onPaymentSuccess(recoveryRequestId, selectedProvider, generatedRef);

      // Trigger celebration confettis!
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (err) {
        console.log('Confetti error:', err);
      }
    }, 3200);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
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
              <Smartphone size={18} />
            </div>
            <h2 className="modal-title">Paiement Sécurisé Mobile Money</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {paymentStep === 'form' && (
            <form onSubmit={handleInitiatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Fee summary card */}
              <div style={{
                background: 'linear-gradient(135deg, #064e3b, #0d5c3a)',
                color: '#ffffff',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: 'var(--shadow-md)'
              }}>
                <div>
                  <div style={{ fontSize: '0.76rem', color: '#a7f3d0', fontWeight: 600, textTransform: 'uppercase' }}>
                    Frais Forfaitaires de Restitution
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    2 000 FCFA
                  </div>
                </div>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.74rem',
                  fontWeight: 700
                }}>
                  Sécurisé SSL
                </div>
              </div>

              {/* Provider Selection */}
              <CheckoutSection step={1} title="Choisissez votre opérateur" subtitle="Mobile Money Cameroun" />
              <div className="form-group">
                <label className="form-label">Opérateur de paiement :</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* MTN MoMo */}
                  <div
                    className={`momo-option-card ${selectedProvider === 'mtn_momo' ? 'selected-mtn' : ''}`}
                    onClick={() => setSelectedProvider('mtn_momo')}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#b45309' }}>
                        MTN MoMo
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
                        Mobile Money
                      </div>
                    </div>
                    <div className="momo-brand-icon" style={{ background: '#f59e0b', color: '#ffffff' }}>
                      MTN
                    </div>
                  </div>

                  {/* Orange Money */}
                  <div
                    className={`momo-option-card ${selectedProvider === 'orange_money' ? 'selected-orange' : ''}`}
                    onClick={() => setSelectedProvider('orange_money')}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#c2410c' }}>
                        Orange Money
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
                        OM Cameroun
                      </div>
                    </div>
                    <div className="momo-brand-icon" style={{ background: '#ea580c', color: '#ffffff' }}>
                      OM
                    </div>
                  </div>
                </div>
              </div>

              {/* Phone Input */}
              <CheckoutSection step={2} title="Numéro à débiter" subtitle="Une demande de confirmation USSD y sera envoyée" />
              <div className="form-group">
                <label className="form-label">Numéro de téléphone mobile (+237) *</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    padding: '10px 12px',
                    background: 'var(--slate-100)',
                    border: '1px solid var(--border-color)',
                    borderRight: 'none',
                    borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: 'var(--slate-700)'
                  }}>
                    +237
                  </span>
                  <input
                    type="tel"
                    className="form-input"
                    style={{ borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}
                    placeholder="6xx xx xx xx"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="alert-security-box">
                <Lock size={18} style={{ flexShrink: 0, color: 'var(--gold-600)' }} />
                <div>
                  <strong>Sécurité de la Transaction :</strong>
                  <p style={{ marginTop: '2px', fontSize: '0.76rem' }}>
                    Une notification USSD Push vous invitera à taper votre code secret sur votre téléphone. Aucune donnée bancaire n'est conservée.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff' }}
              >
                Valider et payer 2 000 FCFA →
              </button>
            </form>
          )}

          {paymentStep === 'ussd_pending' && (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <Loader2 size={44} className="animate-spin" color="var(--primary-700)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Autorisation USSD en cours...
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginTop: '8px', lineHeight: 1.5 }}>
                Veuillez consulter votre téléphone mobile <strong>+237 {phoneNumber}</strong> et confirmer le débit de <strong>2 000 FCFA</strong> avec votre code secret {selectedProvider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}.
              </p>

              <div style={{
                marginTop: '16px',
                padding: '10px',
                background: 'var(--slate-100)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.76rem',
                color: 'var(--slate-500)'
              }}>
                Réf. Transaction : {transactionRef} | En attente de webhook serveur...
              </div>
            </div>
          )}

          {paymentStep === 'success' && (
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--primary-100)',
                color: 'var(--primary-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <CheckCircle2 size={38} />
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Paiement Confirmé avec Succès !
              </h3>

              <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', marginTop: '6px' }}>
                Reçu n° <strong>{transactionRef}</strong> — 2 000 FCFA ({selectedProvider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'})
              </p>

              {/* Unlocked contact pointer (les coordonnées réelles du trouveur
                  sont débloquées serveur et affichées dans le Dashboard) */}
              <div style={{
                marginTop: '16px',
                textAlign: 'left',
                background: 'var(--primary-50)',
                border: '1px solid var(--primary-100)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px'
              }}>
                <div style={{ fontWeight: 800, color: 'var(--primary-900)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={18} color="var(--primary-700)" />
                  Instructions de Récupération Sécurisée
                </div>

                <div style={{ marginTop: '10px', fontSize: '0.82rem', color: 'var(--slate-700)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PhoneCall size={14} color="var(--primary-700)" style={{ flexShrink: 0 }} />
                  <span>
                    Les coordonnées du trouveur (nom, téléphone, point de retrait sécurisé) sont maintenant visibles dans votre
                    <strong> Dashboard → onglet Restitutions</strong>.
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', width: '100%', marginTop: '20px' }}
                onClick={onClose}
              >
                Terminer et fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
