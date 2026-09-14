import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  MapPin, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Lock
} from 'lucide-react';
import type { FoundDocument, Match, RecoveryRequest } from '../types';

interface MatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  foundDoc: FoundDocument | null;
  match?: Match | null;
  onRequestRecovery: (docId: string, proofAnswer: string) => void;
  onProceedToPayment: (requestId: string) => void;
  existingRequest?: RecoveryRequest | null;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  isOpen,
  onClose,
  foundDoc,
  match,
  onRequestRecovery,
  onProceedToPayment,
  existingRequest
}) => {
  const [proofAnswer, setProofAnswer] = useState('');
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState(false);

  if (!isOpen || !foundDoc) return null;

  const handleSubmitProof = (e: React.FormEvent) => {
    e.preventDefault();
    onRequestRecovery(foundDoc.id, proofAnswer);
    setSubmittedMessage(true);
  };

  const getQualitativeBadge = (qualitative?: string) => {
    switch (qualitative) {
      case 'forte':
        return <span className="badge-match-forte">✓ Correspondance Très Forte</span>;
      case 'probable':
        return <span className="badge-match-probable">✓ Correspondance Probable</span>;
      default:
        return <span className="badge-match-possible">✓ Correspondance Possible</span>;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--primary-700)" />
              <h2 className="modal-title">Détail de Correspondance Sécurisée</h2>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '2px' }}>
              Réf : {foundDoc.id}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Card Overview */}
          <div style={{
            background: 'var(--slate-50)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                Pièce Anonymisée
              </div>
              {match && getQualitativeBadge(match.match_qualitative)}
            </div>

            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
              {foundDoc.title_masked}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem', color: 'var(--slate-600)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={14} />
                <span>Identifiant partiel : <strong>{foundDoc.doc_number_partial}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} />
                <span>Trouvé à : <strong>{foundDoc.city}</strong> — {foundDoc.approx_location} ({foundDoc.region})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} />
                <span>Signalé le : {new Date(foundDoc.found_date).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>
          </div>

          {/* Redacted Preview */}
          {foundDoc.masked_image_url && (
            <div style={{
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              maxHeight: '160px',
              border: '1px solid var(--border-color)',
              position: 'relative'
            }}>
              <img 
                src={foundDoc.masked_image_url} 
                alt="Aperçu Caviardé" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="redacted-stamp">
                <Lock size={12} />
                <span>DONNÉES SENSIBLES FLOUÉES</span>
              </div>
            </div>
          )}

          {/* If Request is already verified & ready for payment */}
          {existingRequest && existingRequest.verification_status === 'approved' && existingRequest.status !== 'completed' ? (
            <div style={{
              background: 'var(--primary-50)',
              border: '1px solid var(--primary-100)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              textAlign: 'center'
            }}>
              <CheckCircle2 size={36} color="var(--primary-700)" style={{ margin: '0 auto 8px' }} />
              <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary-900)' }}>
                Preuve de Propriété Validée !
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--primary-800)', marginTop: '4px' }}>
                Votre réponse a été confirmée. Vous pouvez maintenant procéder au règlement sécurisé des frais forfaitaires de mise en relation (2 000 FCFA) par Mobile Money (MTN MoMo ou Orange Money).
              </p>

              <button
                type="button"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', width: '100%', marginTop: '16px' }}
                onClick={() => {
                  onClose();
                  onProceedToPayment(existingRequest.id);
                }}
              >
                Payer avec Mobile Money (2 000 FCFA) →
              </button>
            </div>
          ) : existingRequest && existingRequest.status === 'completed' ? (
            <div style={{
              background: 'var(--primary-50)',
              border: '1px solid var(--primary-100)',
              borderRadius: 'var(--radius-md)',
              padding: '16px'
            }}>
              <div style={{ fontWeight: 800, color: 'var(--primary-900)', fontSize: '0.95rem' }}>
                🎉 Restitution Débloquée
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--slate-700)', marginTop: '6px' }}>
                Contact du trouveur : <strong>{existingRequest.unlocked_finder_contact?.display_name || 'Trouveur vérifié'}</strong><br />
                Téléphone : <strong>{existingRequest.unlocked_finder_contact?.phone || '+237 677 11 22 33'}</strong><br />
                Point de retrait sécurisé : <strong>{existingRequest.unlocked_finder_contact?.pickup_point || 'Commissariat du 10ème Arrondissement - Bastos, Yaoundé'}</strong>
              </div>
            </div>
          ) : submittedMessage || (existingRequest && existingRequest.verification_status === 'pending') ? (
            <div style={{
              background: 'var(--gold-50)',
              border: '1px solid var(--gold-100)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              textAlign: 'center'
            }}>
              <AlertCircle size={32} color="var(--gold-600)" style={{ margin: '0 auto 8px' }} />
              <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--gold-700)' }}>
                Demande de Restitution en Attente de Vérification
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--slate-600)', marginTop: '4px' }}>
                Votre élément de preuve a été transmis. Le modérateur ou le système vérifie la concordance avec les données privées non publiées.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitProof} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="alert-security-box">
                <HelpCircle size={20} style={{ flexShrink: 0, color: 'var(--gold-600)' }} />
                <div>
                  <strong>Preuve de Propriété Obligatoire :</strong>
                  <p style={{ marginTop: '2px', fontSize: '0.78rem' }}>
                    Afin d'empêcher toute usurpation d'identité, veuillez fournir un détail ou répondre à la question secrète connue uniquement du titulaire (ex: lieu exact de naissance, date de délivrance).
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Votre preuve de propriété (élément confidentiel non présent sur l'aperçu) * :
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Né le 12/03/1995 à Bafoussam..."
                  value={proofAnswer}
                  onChange={(e) => setProofAnswer(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="agree-ownership"
                  checked={hasAgreedToTerms}
                  onChange={(e) => setHasAgreedToTerms(e.target.checked)}
                  style={{ marginTop: '3px' }}
                  required
                />
                <label htmlFor="agree-ownership" style={{ fontSize: '0.78rem', color: 'var(--slate-600)' }}>
                  Je certifie sur l'honneur être le propriétaire légitime de ce document. Toute fausse déclaration est passible de poursuites.
                </label>
              </div>

              <button
                type="submit"
                disabled={!hasAgreedToTerms || !proofAnswer.trim()}
                className="btn-cta-lost"
                style={{
                  backgroundColor: !hasAgreedToTerms || !proofAnswer.trim() ? 'var(--slate-300)' : 'var(--primary-700)',
                  color: '#ffffff',
                  cursor: !hasAgreedToTerms || !proofAnswer.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                Soumettre ma demande de restitution →
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
