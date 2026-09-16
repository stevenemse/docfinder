import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  CheckCircle2, 
  ShieldCheck, 
  Lock,
  Loader2,
  PhoneCall,
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { PaymentProviderType } from '../types';
import { CheckoutSection } from './CheckoutSection';
import { dataService } from '../services/dataService';
import { isSupabaseConfigured } from '../services/supabaseClient';

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
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [paymentStep, setPaymentStep] = useState<'form' | 'redirecting' | 'ussd_pending' | 'success' | 'error'>('form');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  /**
   * Production : création de la transaction via l'Edge Function gp-create-payment
   * (clés marchandes GeniusPay côté serveur uniquement), puis redirection vers
   * la page de checkout hébergée (MTN MoMo, Orange Money, Wave, carte…).
   * La confirmation finale arrive par webhook GeniusPay + retour ?payment=success&ref=…
   *
   * Mode démo (sans Supabase) : simulation USSD conservée.
   */
  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mode démo — simulation locale
    if (!isSupabaseConfigured()) {
      const generatedRef = `TX-CMR-${Date.now().toString().slice(-6)}`;
      setTransactionRef(generatedRef);
      setPaymentStep('ussd_pending');
      setTimeout(() => {
        setPaymentStep('success');
        onPaymentSuccess(recoveryRequestId, 'mtn_momo' as PaymentProviderType, generatedRef);
        try {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } catch (err) {
          console.log('Confetti error:', err);
        }
      }, 3200);
      return;
    }

    // Production — checkout GeniusPay hébergé
    setErrorMessage('');
    setPaymentStep('redirecting');
    try {
      const { checkoutUrl, reference } = await dataService.createGeniusPayPayment({
        requestId: recoveryRequestId,
        phone: phoneNumber
      });
      setTransactionRef(reference);
      window.location.href = checkoutUrl;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue');
      setPaymentStep('error');
    }
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

              {/* Moyens acceptés (page de checkout hébergée GeniusPay) */}
              <CheckoutSection step={1} title="Moyens de paiement acceptés" subtitle="Choix effectué sur la page sécurisée" />
              <div className="accepted-methods-grid">
                <div className="accepted-method-chip">
                  <div className="momo-brand-icon" style={{ background: '#f59e0b', color: '#ffffff' }}>MTN</div>
                  MTN MoMo
                </div>
                <div className="accepted-method-chip">
                  <div className="momo-brand-icon" style={{ background: '#ea580c', color: '#ffffff' }}>OM</div>
                  Orange Money
                </div>
                <div className="accepted-method-chip">
                  <div className="momo-brand-icon" style={{ background: '#0ea5e9', color: '#ffffff' }}>WV</div>
                  Wave
                </div>
                <div className="accepted-method-chip">
                  <div className="momo-brand-icon" style={{ background: 'var(--slate-700)', color: '#ffffff' }}>CB</div>
                  Carte bancaire
                </div>
              </div>

              {/* Phone Input */}
              <CheckoutSection step={2} title="Votre numéro mobile" subtitle="Pour la confirmation du débit" />
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
                    placeholder="6XX XX XX XX"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    pattern="[0-9 ]{9,12}"
                    required
                  />
                </div>
              </div>

              <div className="alert-security-box">
                <Lock size={18} style={{ flexShrink: 0, color: 'var(--gold-600)' }} />
                <div>
                  <strong>Sécurité de la Transaction :</strong>
                  <p style={{ marginTop: '2px', fontSize: '0.76rem' }}>
                    Vous serez redirigé vers la page de paiement sécurisée GeniusPay pour confirmer
                    le débit avec votre code secret. Aucune donnée bancaire n'est conservée par DocFinder.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff' }}
              >
                Payer 2 000 FCFA en toute sécurité →
              </button>
            </form>
          )}

          {paymentStep === 'redirecting' && (
            <div style={{ textAlign: 'center', padding: '32px 12px' }}>
              <Loader2 size={44} className="animate-spin" color="var(--primary-700)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Connexion à la plateforme de paiement…
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginTop: '8px', lineHeight: 1.5 }}>
                Ouverture de la page de paiement sécurisée GeniusPay. Vous y choisirez votre
                moyen de paiement (MTN MoMo, Orange Money, Wave, carte) et confirmerez le débit
                de <strong>2 000 FCFA</strong>.
              </p>
            </div>
          )}

          {paymentStep === 'error' && (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <AlertTriangle size={34} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Paiement non initialisé
              </h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--slate-600)', marginTop: '8px', lineHeight: 1.5 }}>
                {errorMessage}
              </p>
              <button
                type="button"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', width: '100%', marginTop: '20px' }}
                onClick={() => setPaymentStep('form')}
              >
                Réessayer
              </button>
            </div>
          )}

          {paymentStep === 'ussd_pending' && (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <Loader2 size={44} className="animate-spin" color="var(--primary-700)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Autorisation USSD en cours...
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginTop: '8px', lineHeight: 1.5 }}>
                Veuillez consulter votre téléphone mobile <strong>+237 {phoneNumber}</strong> et confirmer le débit de <strong>2 000 FCFA</strong> avec votre code secret.
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
                Reçu n° <strong>{transactionRef}</strong> — 2 000 FCFA
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
