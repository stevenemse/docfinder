import React, { useState } from 'react';
import { 
  X, 
  Search, 
  HelpCircle, 
  Sparkles,
  Lock
} from 'lucide-react';
import type { DocumentType, LostDocument } from '../types';
import { sha256Hex } from '../lib/crypto';

interface ReportLostModalProps {
  isOpen: boolean;
  onClose: () => void;
  docTypes: DocumentType[];
  onLostCreated: (lostDoc: LostDocument) => void;
  seekerProfileId: string;
  onViewMatches: () => void;
}

export const ReportLostModal: React.FC<ReportLostModalProps> = ({
  isOpen,
  onClose,
  docTypes,
  onLostCreated,
  seekerProfileId,
  onViewMatches
}) => {
  const [docTypeId, setDocTypeId] = useState<string>(docTypes[0]?.id || 'dt-1');
  const [fullName, setFullName] = useState<string>('');
  const [partialDocNum, setPartialDocNum] = useState<string>('');
  const [region, setRegion] = useState<string>('Centre');
  const [city, setCity] = useState<string>('Yaoundé');
  const [approxZone, setApproxZone] = useState<string>('');
  const [lostDate, setLostDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [secretQuestion, setSecretQuestion] = useState<string>(
    'Quel est le lieu exact de naissance inscrit sur la pièce ?'
  );
  const [secretAnswer, setSecretAnswer] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newLost: Omit<LostDocument, 'id' | 'created_at' | 'updated_at'> = {
      seeker_id: seekerProfileId,
      document_type_id: docTypeId,
      full_name_search: fullName.trim(),
      doc_number_partial: partialDocNum.trim() || undefined,
      // Sécurité : SHA-256 — le numéro et la réponse secrète ne sont jamais stockés en clair
      doc_number_hash: partialDocNum ? await sha256Hex(partialDocNum) : undefined,
      lost_region: region,
      lost_city: city,
      approx_loss_zone: approxZone || undefined,
      lost_date_approx: lostDate,
      secret_proof_question: secretQuestion,
      secret_proof_answer_hash: await sha256Hex(secretAnswer),
      status: 'published'
    };

    const saved: LostDocument = {
      ...newLost,
      id: `lost-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    onLostCreated(saved);
    setIsSuccess(true);
  };

  if (!isOpen) return null;

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
              <Search size={18} />
            </div>
            <h2 className="modal-title">Déclarer un document perdu</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {isSuccess ? (
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
                <Sparkles size={36} />
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Déclaration Enregistrée & Matching Actif
              </h3>

              <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginTop: '8px', lineHeight: 1.5 }}>
                Notre moteur analyse instantanément les documents déjà signalés. Vos critères sont enregistrés sous surveillance permanente.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn-cta-lost"
                  style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', width: '100%' }}
                  onClick={() => {
                    onClose();
                    setIsSuccess(false);
                    onViewMatches();
                  }}
                >
                  Consulter mes correspondances 🔍
                </button>

                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--slate-600)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '8px'
                  }}
                  onClick={() => {
                    onClose();
                    setIsSuccess(false);
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="alert-security-box">
                <Lock size={18} style={{ flexShrink: 0, color: 'var(--gold-600)' }} />
                <div>
                  <strong>Sécurité Anti-Fraude :</strong>
                  <p style={{ marginTop: '2px', fontSize: '0.78rem' }}>
                    La question secrète ci-dessous sera exigée lors d'une tentative de réclamation pour prouver que vous êtes bien le titulaire légitime.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Type de document égaré *</label>
                <select 
                  className="form-select"
                  value={docTypeId}
                  onChange={(e) => setDocTypeId(e.target.value)}
                >
                  {docTypes.map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Nom et prénom inscrits sur la pièce *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Kamga Chantal"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Numéro partiel de la pièce (si mémorisé)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: 109288 ou fragments"
                  value={partialDocNum}
                  onChange={(e) => setPartialDocNum(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Région de la perte *</label>
                  <select 
                    className="form-select"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    <option value="Centre">Centre</option>
                    <option value="Littoral">Littoral</option>
                    <option value="Ouest">Ouest</option>
                    <option value="Sud-Ouest">Sud-Ouest</option>
                    <option value="Nord-Ouest">Nord-Ouest</option>
                    <option value="Nord">Nord</option>
                    <option value="Extrême-Nord">Extrême-Nord</option>
                    <option value="Adamaoua">Adamaoua</option>
                    <option value="Est">Est</option>
                    <option value="Sud">Sud</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ville *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ex: Yaoundé"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Zone approximative de la perte</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Bastos, Tsinga, Agence Buca Voyages..."
                  value={approxZone}
                  onChange={(e) => setApproxZone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date approximative de la perte</label>
                <input
                  type="date"
                  className="form-input"
                  value={lostDate}
                  onChange={(e) => setLostDate(e.target.value)}
                />
              </div>

              {/* Secret ownership challenge */}
              <div style={{
                background: 'var(--slate-50)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--slate-800)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HelpCircle size={16} color="var(--primary-700)" />
                  Preuve Secrète de Propriété (Non publique)
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>
                    Question de vérification :
                  </label>
                  <select
                    className="form-select"
                    value={secretQuestion}
                    onChange={(e) => setSecretQuestion(e.target.value)}
                    style={{ fontSize: '0.82rem' }}
                  >
                    <option value="Quel est le lieu exact de naissance inscrit sur la pièce ?">
                      Quel est le lieu exact de naissance inscrit sur la pièce ?
                    </option>
                    <option value="Quelle est l'autorité signataire ou commissariat émetteur ?">
                      Quelle est l'autorité signataire ou commissariat émetteur ?
                    </option>
                    <option value="Quel signe distinctif se trouve sur la pochette/étui ?">
                      Quel signe distinctif se trouve sur la pochette/étui ?
                    </option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>
                    Réponse secrète attendue (confidentielle) * :
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ex: Bafoussam ou Yaoundé 2"
                    value={secretAnswer}
                    onChange={(e) => setSecretAnswer(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', marginTop: '10px' }}
              >
                Lancer la recherche automatique 🚀
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
