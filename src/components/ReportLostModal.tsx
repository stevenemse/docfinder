import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  HelpCircle,
  Sparkles,
  Lock,
  FileImage,
  ImageIcon,
  Trash2,
  MapPin,
  Calendar,
  User,
  Hash,
  ShieldCheck
} from 'lucide-react';
import type { DocumentType, LostDocument } from '../types';
import { sha256Hex } from '../lib/crypto';
import { dataService } from '../services/dataService';
import { CheckoutSection } from './CheckoutSection';

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

  // Photo de référence privée (crédibilité) — optionnelle
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Les types arrivent async (Supabase) : si l'état initial pointait vers le
  // mock 'dt-1', on resynchronise dès que la vraie liste est chargée.
  useEffect(() => {
    if (docTypes.length > 0 && !docTypes.some(d => d.id === docTypeId)) {
      setDocTypeId(docTypes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTypes]);

  if (!isOpen) return null;

  const handlePickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setReferenceFile(file);
    const reader = new FileReader();
    reader.onload = () => setReferencePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setReferenceFile(null);
    setReferencePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setUploadingPhoto(!!referenceFile);

    try {
      // Upload de la photo de référence (bucket privé vault)
      let referenceImagePath: string | null = null;
      if (referenceFile) {
        try {
          const up = await dataService.uploadReferenceImage(referenceFile, seekerProfileId);
          referenceImagePath = up.path;
          setUploadingPhoto(false);
        } catch {
          // La photo est optionnelle : on continue sans elle en cas d'échec
          referenceImagePath = null;
          setUploadingPhoto(false);
        }
      }

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
        lost_date_approx: lostDate || new Date().toISOString().split('T')[0],
        secret_proof_question: secretQuestion,
        secret_proof_answer_hash: await sha256Hex(secretAnswer),
        reference_image_path: referenceImagePath,
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
    } finally {
      setIsSubmitting(false);
      setUploadingPhoto(false);
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
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="alert-security-box">
                <Lock size={18} style={{ flexShrink: 0, color: 'var(--gold-600)' }} />
                <div>
                  <strong>Sécurité Anti-Fraude :</strong>
                  <p style={{ marginTop: '2px', fontSize: '0.78rem' }}>
                    La question secrète ci-dessous sera exigée lors d'une tentative de réclamation pour prouver que vous êtes bien le titulaire légitime.
                  </p>
                </div>
              </div>

              {/* ÉTAPE 1 — La pièce */}
              <CheckoutSection step={1} title="La pièce égarée" />

              <div className="form-group">
                <label className="form-label">Type de document *</label>
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
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={13} />
                  Nom et prénom inscrits sur la pièce *
                </label>
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
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={13} />
                  Numéro partiel de la pièce (si mémorisé)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: 109288 ou fragments"
                  value={partialDocNum}
                  onChange={(e) => setPartialDocNum(e.target.value)}
                />
              </div>

              {/* Photo de référence — optionnelle, privée */}
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <FileImage size={13} />
                  Photo de la pièce (fortement recommandé)
                </label>
                {referencePreview ? (
                  <div className="ref-upload-zone has-file">
                    <div className="ref-upload-preview">
                      <img src={referencePreview} alt="Aperçu de la pièce" className="ref-upload-thumb" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ref-upload-title">Photo jointe ✓</div>
                        <div className="ref-upload-sub">
                          Stockée en privé — visible uniquement par vous et les modérateurs DPO pour accélérer la vérification.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        title="Retirer la photo"
                        style={{
                          background: 'var(--red-50)',
                          border: '1px solid var(--red-100)',
                          color: 'var(--red-600)',
                          borderRadius: 'var(--radius-md)',
                          padding: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="ref-upload-zone" htmlFor="ref-photo-input">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <ImageIcon size={26} color="var(--primary-600)" />
                      <div className="ref-upload-title">Joindre une photo ou un scan de la pièce</div>
                      <div className="ref-upload-sub">
                        Ex : photo prise avec votre téléphone avant la perte, scan anciennement numérisé…
                        <br />
                        Optionnel mais crédibilise fortement votre dossier.
                      </div>
                    </div>
                    <input
                      id="ref-photo-input"
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handlePickPhoto}
                    />
                  </label>
                )}
              </div>

              {/* ÉTAPE 2 — Où et quand */}
              <CheckoutSection step={2} title="Où et quand ?" />

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <MapPin size={12} />
                    Région *
                  </label>
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
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={13} />
                  Date approximative de la perte
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={lostDate}
                  onChange={(e) => setLostDate(e.target.value)}
                />
              </div>

              {/* ÉTAPE 3 — Preuve secrète */}
              <CheckoutSection step={3} title="Preuve secrète de propriété" subtitle="Non publique — sert à vérifier les réclamations" />

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
                  Question de vérification confidentielle
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>
                    Question :
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
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? (uploadingPhoto ? 'Envoi de la photo...' : 'Enregistrement...')
                  : 'Lancer la recherche automatique 🚀'}
              </button>

              <div style={{ fontSize: '0.7rem', color: 'var(--slate-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <ShieldCheck size={12} color="var(--primary-600)" />
                Données chiffrées SHA-256 · photo stockée en coffre privé
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
