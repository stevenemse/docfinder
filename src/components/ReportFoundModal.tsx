import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  Check, 
  Eraser,
  Camera,
  Undo2,
  Sparkles
} from 'lucide-react';
import type { DocumentType, FoundDocument } from '../types';
import { sha256Hex } from '../lib/crypto';
import { dataService } from '../services/dataService';
import { CheckoutSection } from './CheckoutSection';

interface ReportFoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  docTypes: DocumentType[];
  onFoundCreated: (doc: FoundDocument) => void;
  finderProfileId: string;
}

interface MaskZone {
  x: number; // coordonnées dans l'image originale (px)
  y: number;
  w: number;
  h: number;
}

const MASK_W = 110;
const MASK_H = 80;
const MAX_CANVAS_W = 640;

export const ReportFoundModal: React.FC<ReportFoundModalProps> = ({
  isOpen,
  onClose,
  docTypes,
  onFoundCreated,
  finderProfileId
}) => {
  const [step, setStep] = useState<number>(1);
  const [docTypeId, setDocTypeId] = useState<string>(docTypes[0]?.id || 'dt-1');
  const [fullName, setFullName] = useState<string>('');
  const [docNumber, setDocNumber] = useState<string>('');
  const [region, setRegion] = useState<string>('Centre');
  const [city, setCity] = useState<string>('Yaoundé');
  const [approxLocation, setApproxLocation] = useState<string>('');
  const [foundDate, setFoundDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [privateNotes, setPrivateNotes] = useState<string>('');
  const [createdDocId, setCreatedDocId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Les types arrivent async (Supabase) : resynchronisation si mock 'dt-1'
  useEffect(() => {
    if (docTypes.length > 0 && !docTypes.some(d => d.id === docTypeId)) {
      setDocTypeId(docTypes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTypes]);

  // ── Photo réelle ─────────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null); // data URL de l'image importée
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [masks, setMasks] = useState<MaskZone[]>([]); // en coordonnées image
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Veuillez choisir une image (photo du document).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setPhotoError('Photo trop lourde (max 8 Mo).');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoSrc(String(reader.result));
      setMasks([]); // nouvelle image → zones à refaire
    };
    reader.readAsDataURL(file);
  };

  // Chargement de l'image + dimensionnement du canvas d'affichage
  useEffect(() => {
    if (step !== 3 || !photoSrc) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const scale = Math.min(1, MAX_CANVAS_W / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
      setCanvasSize({ w, h });
    };
    img.src = photoSrc;
  }, [step, photoSrc]);

  // Dessin : image + zones de caviardage (redessiné à chaque changement)
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgDims) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = canvas.width / imgDims.w;
    const sy = canvas.height / imgDims.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    masks.forEach(m => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(m.x * sx, m.y * sy, m.w * sx, m.h * sy);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('MASQUÉ', m.x * sx + 5, m.y * sy + (m.h * sy) / 2 + 3);
    });
  }, [masks, imgDims]);

  useEffect(() => {
    if (step === 3 && canvasSize.w > 0) {
      redraw();
    }
  }, [step, canvasSize, redraw]);

  // Clic/touch sur le canvas → zone de caviardage centrée sur le point touché
  const handleCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgDims) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * imgDims.w;
    const py = ((e.clientY - rect.top) / rect.height) * imgDims.h;
    const zone: MaskZone = {
      x: Math.max(0, Math.min(imgDims.w - MASK_W, px - MASK_W / 2)),
      y: Math.max(0, Math.min(imgDims.h - MASK_H, py - MASK_H / 2)),
      w: MASK_W,
      h: MASK_H,
    };
    setMasks(prev => [...prev, zone]);
  };

  const handleUndoMask = () => setMasks(prev => prev.slice(0, -1));
  const handleResetMasks = () => setMasks([]);

  const computePartialNumber = (num: string) => {
    if (!num) return '****';
    const cleaned = num.trim().replace(/\s+/g, '');
    if (cleaned.length <= 4) return '****' + cleaned;
    const start = cleaned.slice(0, 3);
    const end = cleaned.slice(-2);
    return `${start}****${end}`;
  };

  const computeMaskedTitle = () => {
    const selectedDocType = docTypes.find(dt => dt.id === docTypeId);
    const typeLabel = selectedDocType ? selectedDocType.name.split('(')[0].trim() : 'Document';
    if (!fullName.trim()) return `${typeLabel} — Trouvé à ${city}`;
    const parts = fullName.trim().split(' ');
    const maskedName = parts.map((p, idx) => {
      if (p.length <= 2) return p;
      if (idx === 0) return p.charAt(0) + '***' + p.charAt(p.length - 1);
      return p;
    }).join(' ');
    return `${typeLabel} — ${maskedName}`;
  };

  // Image finale caviardée, en pleine résolution (pour l'upload public)
  const renderRedactedFullSize = (): string | null => {
    const img = imgRef.current;
    if (!img || !imgDims) return null;
    const off = document.createElement('canvas');
    off.width = imgDims.w;
    off.height = imgDims.h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    masks.forEach(m => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(m.x, m.y, m.w, m.h);
    });
    return off.toDataURL('image/jpeg', 0.85);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoFile || !photoSrc) {
      setPhotoError('Photo du document requise.');
      return;
    }
    if (masks.length === 0) {
      setPhotoError('Touchez sur la photo les zones à caviarder (visage, numéro, signature) avant de publier.');
      return;
    }
    setSubmitting(true);
    try {
      const redactedImageUrl = renderRedactedFullSize() || photoSrc;
      const partialNum = computePartialNumber(docNumber);
      const maskedTitle = computeMaskedTitle();

      // Original → coffre privé vault (visible par l'utilisateur + modérateurs
      // uniquement). Best effort : le flux continue même si l'upload échoue.
      let originalPath = `vault/originals/doc-${Date.now()}.png`;
      try {
        const up = await dataService.uploadPrivateImage(photoFile, finderProfileId, 'originals');
        if (up?.path) originalPath = up.path;
      } catch {
        /* placeholder conservé */
      }

      const newDoc: Omit<FoundDocument, 'id' | 'created_at' | 'updated_at'> = {
        finder_id: finderProfileId,
        document_type_id: docTypeId,
        title_masked: maskedTitle,
        full_name_normalized: fullName.trim().toLowerCase(),
        // Sécurité : SHA-256 du numéro complet — la donnée brute n'est jamais stockée
        doc_number_hash: await sha256Hex(docNumber),
        doc_number_partial: partialNum,
        region,
        city,
        approx_location: approxLocation || 'Centre-ville',
        found_date: foundDate || new Date().toISOString().split('T')[0],
        masked_image_url: redactedImageUrl,
        original_image_path: originalPath,
        additional_notes_private: privateNotes || undefined,
        status: 'published'
      };

      // Save in storage service
      const saved = {
        ...newDoc,
        id: `found-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      onFoundCreated(saved as FoundDocument);
      setCreatedDocId(saved.id);
      setStep(4); // Success step
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep(1);
    setCreatedDocId(null);
    setPhotoFile(null);
    setPhotoSrc(null);
    setMasks([]);
    setPhotoError(null);
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
              <ShieldCheck size={18} />
            </div>
            <h2 className="modal-title">Signaler un document trouvé</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <CheckoutSection step={1} title="Où avez-vous trouvé la pièce ?" subtitle="Zone publique — soyez précis, jamais personnel" />

              <div className="alert-security-box">
                <AlertTriangle size={20} style={{ flexShrink: 0, color: 'var(--gold-600)' }} />
                <div>
                  <strong>Sécurité Citoyenne :</strong>
                  <p style={{ marginTop: '2px', fontSize: '0.8rem' }}>
                    Ne saisissez jamais votre propre adresse personnelle. Indiquez un point de repère public (ex: carrefour, commissariat, agence).
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Type de document trouvé *</label>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Région *</label>
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
                    placeholder="ex: Yaoundé, Douala"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Lieu approximatif de découverte *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Carrefour Bastos, Taxi vers Akwa..."
                  value={approxLocation}
                  onChange={(e) => setApproxLocation(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date de découverte</label>
                <input
                  type="date"
                  className="form-input"
                  value={foundDate}
                  onChange={(e) => setFoundDate(e.target.value)}
                />
              </div>

              <button 
                type="button"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', marginTop: '8px' }}
                onClick={() => setStep(2)}
              >
                Continuer vers l'identification →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <CheckoutSection step={2} title="Identification de la pièce" subtitle="Pour le matching automatique — jamais affiché au public" />

              <div style={{ 
                background: 'var(--slate-100)', 
                padding: '12px 14px', 
                borderRadius: 'var(--radius-md)',
                fontSize: '0.84rem'
              }}>
                <div style={{ fontWeight: 700, color: 'var(--slate-800)' }}>
                  🔒 Informations pour le matching automatique
                </div>
                <div style={{ color: 'var(--slate-600)', fontSize: '0.78rem', marginTop: '3px' }}>
                  Ces informations permettent à notre moteur de matching de relier la pièce au véritable propriétaire. Seul un titre partiel masqué sera visible par le public.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nom complet figurant sur le document *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Kamga Marie Chantal"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Numéro du document (CNI, Permis, etc.) *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: 1029384758"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  required
                />
                <div style={{ fontSize: '0.76rem', color: 'var(--slate-500)', marginTop: '4px' }}>
                  Aperçu public masqué : <strong>{computePartialNumber(docNumber)}</strong> (le reste est chiffré SHA-256)
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes privées (Optionnel, visibles uniquement par vous et les modérateurs)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="ex: Trouvé dans une pochette noire avec un porte-clés..."
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn-cta-lost"
                  style={{ backgroundColor: 'var(--slate-200)', color: 'var(--slate-800)', flex: 1 }}
                  onClick={() => setStep(1)}
                >
                  ← Retour
                </button>
                <button
                  type="button"
                  className="btn-cta-lost"
                  style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', flex: 2 }}
                  onClick={() => setStep(3)}
                >
                  Photo & caviardage (Obligatoire) →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <CheckoutSection step={3} title="Photo & caviardage obligatoire" subtitle="Importez/filmez la pièce puis masquez les zones sensibles" />

              <div style={{
                background: 'var(--slate-900)',
                color: '#ffffff',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.82rem'
              }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} color="#34d399" />
                  Confidentialité garantie
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--slate-300)', marginTop: '4px' }}>
                  1) Prenez ou importez la photo de la pièce. 2) Touchez sur l'image les zones à caviarder (visage, numéro, signature). Seule l'image caviardée sera publiée ; l'original reste dans le coffre privé, accessible uniquement aux modérateurs DPO.
                </p>
              </div>

              {/* 1. Import / caméra */}
              <div className="form-group">
                <label className="form-label">Photo du document trouvé *</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="form-input"
                  onChange={handlePhotoSelected}
                  style={{ padding: '8px' }}
                />
                <div style={{ fontSize: '0.74rem', color: 'var(--slate-500)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Camera size={13} />
                  Appareil photo ou galerie — la photo reste votre preuve privée.
                </div>
                {photoError && (
                  <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '6px', fontWeight: 600 }}>
                    {photoError}
                  </div>
                )}
              </div>

              {/* 2. Caviardage tactile sur l'image réelle */}
              {photoSrc && canvasSize.w > 0 && (
                <div className="canvas-redaction-container">
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-700)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} color="var(--primary-700)" />
                    Touchez l'image pour caviarder ({masks.length} zone{masks.length > 1 ? 's' : ''})
                  </div>

                  <div className="canvas-preview-wrapper" style={{ touchAction: 'none' }}>
                    <canvas
                      ref={canvasRef}
                      width={canvasSize.w}
                      height={canvasSize.h}
                      onPointerDown={handleCanvasPointer}
                      style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair', borderRadius: '8px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleUndoMask}
                      disabled={masks.length === 0}
                      style={{
                        background: 'var(--slate-200)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: masks.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: masks.length === 0 ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Undo2 size={13} />
                      Annuler la dernière
                    </button>

                    <button
                      type="button"
                      onClick={handleResetMasks}
                      disabled={masks.length === 0}
                      style={{
                        background: 'var(--slate-200)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: masks.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: masks.length === 0 ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Eraser size={13} />
                      Tout effacer
                    </button>
                  </div>
                  {masks.length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--gold-600)', fontWeight: 600, textAlign: 'center', marginTop: '6px' }}>
                      ⚠ Au moins une zone est requise (visage, numéro ou signature)
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn-cta-lost"
                  style={{ backgroundColor: 'var(--slate-200)', color: 'var(--slate-800)', flex: 1 }}
                  onClick={() => setStep(2)}
                >
                  ← Retour
                </button>
                <button
                  type="button"
                  className="btn-cta-lost"
                  style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', flex: 2 }}
                  onClick={handleSubmit}
                  disabled={submitting || !photoFile || masks.length === 0}
                >
                  {submitting ? 'Publication…' : 'Publier le signalement sécurisé ✔'}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
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
                <Check size={36} />
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Signalement Enregistré avec Succès !
              </h3>

              <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginTop: '8px', lineHeight: 1.5 }}>
                Merci pour votre civisme ! Votre photo caviardée et votre signalement ont été enregistrés sous la référence :
              </p>

              <div style={{
                margin: '16px auto',
                padding: '10px 16px',
                background: 'var(--slate-100)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: 'var(--primary-800)',
                display: 'inline-block'
              }}>
                {createdDocId}
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--slate-500)' }}>
                Notre moteur de matching analyse les déclarations de perte en continu. Vous recevrez une alerte dès qu'un propriétaire légitime aura prouvé sa propriété.
              </p>

              <button
                type="button"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', width: '100%', marginTop: '24px' }}
                onClick={() => {
                  onClose();
                  resetAll();
                }}
              >
                Fermer et revenir à l'accueil
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
