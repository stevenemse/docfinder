import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  Check, 
  Eraser
} from 'lucide-react';
import type { DocumentType, FoundDocument } from '../types';
import { sha256Hex } from '../lib/crypto';
import { CheckoutSection } from './CheckoutSection';

interface ReportFoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  docTypes: DocumentType[];
  onFoundCreated: (doc: FoundDocument) => void;
  finderProfileId: string;
}

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

  // Les types arrivent async (Supabase) : resynchronisation si mock 'dt-1'
  useEffect(() => {
    if (docTypes.length > 0 && !docTypes.some(d => d.id === docTypeId)) {
      setDocTypeId(docTypes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTypes]);

  // Canvas Redaction State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [redactionBlocks, setRedactionBlocks] = useState<{ x: number; y: number; w: number; h: number }[]>([
    { x: 30, y: 35, w: 100, h: 120 }, // Default photo mask
    { x: 150, y: 125, w: 180, h: 25 }, // Default doc number mask
    { x: 150, y: 160, w: 140, h: 25 }  // Default signature mask
  ]);

  // Compute live masked title and partial number
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

  // Draw simulated ID card on Canvas with Redaction Masks
  useEffect(() => {
    if (step === 3 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background Card
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      // Card Header Banner (Cameroon Green)
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(4, 4, canvas.width - 8, 28);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Plus Jakarta Sans, sans-serif';
      ctx.fillText('RÉPUBLIQUE DU CAMEROUN — PEACE - WORK - FATHERLAND', 16, 21);

      // Simulated User Photo Silhouette
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(30, 38, 100, 115);
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(80, 80, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(80, 130, 35, 20, 0, 0, Math.PI, true);
      ctx.fill();

      // Lines of text
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`NOM: ${fullName || 'DIPITA NDONGO'}`, 145, 60);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('PRÉNOMS: JEAN PATRICK', 145, 80);
      ctx.fillText('NÉ LE: 14/05/1992 À YAOUNDÉ', 145, 100);
      ctx.fillText(`N° IDENTIFIANT: ${docNumber || '1029384758'}`, 145, 120);

      // Signature zone
      ctx.fillStyle = '#64748b';
      ctx.font = 'italic 10px cursive';
      ctx.fillText('Signature officielle autorisée', 145, 155);

      // Draw Redaction Blocks
      redactionBlocks.forEach((block) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(block.x, block.y, block.w, block.h);

        // Stamp on mask
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('MASQUÉ', block.x + 6, block.y + block.h / 2 + 3);
      });
    }
  }, [step, redactionBlocks, fullName, docNumber]);

  const handleAddRedactionMask = () => {
    setRedactionBlocks(prev => [
      ...prev,
      { x: 140, y: 50, w: 160, h: 22 }
    ]);
  };

  const handleResetMasks = () => {
    setRedactionBlocks([
      { x: 30, y: 35, w: 100, h: 120 },
      { x: 150, y: 125, w: 180, h: 25 },
      { x: 150, y: 160, w: 140, h: 25 }
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Get canvas snapshot as redacted image data URL
    let redactedImageUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80';
    if (canvasRef.current) {
      redactedImageUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
    }

    const partialNum = computePartialNumber(docNumber);
    const maskedTitle = computeMaskedTitle();

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
      found_date: foundDate,
      masked_image_url: redactedImageUrl,
      original_image_path: `vault/originals/doc-${Date.now()}.png`,
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
                  Caviarder la photo (Obligatoire) →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <CheckoutSection step={3} title="Caviardage obligatoire" subtitle="Masquez visage, numéro et signature avant publication" />

              <div style={{
                background: 'var(--slate-900)',
                color: '#ffffff',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.82rem'
              }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} color="#34d399" />
                  Outil de Redaction & Caviardage Automatique
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--slate-300)', marginTop: '4px' }}>
                  Conformément au RGPD et à la loi camerounaise, les visages, signatures et numéros complets sont obligatoirement masqués avant affichage.
                </p>
              </div>

              <div className="canvas-redaction-container">
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-700)' }}>
                  Aperçu Public Anonymisé en Direct
                </div>

                <div className="canvas-preview-wrapper">
                  <canvas 
                    ref={canvasRef} 
                    width={350} 
                    height={200}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={handleAddRedactionMask}
                    style={{
                      background: 'var(--slate-200)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    + Ajouter zone de masquage
                  </button>

                  <button
                    type="button"
                    onClick={handleResetMasks}
                    style={{
                      background: 'var(--slate-200)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Eraser size={13} />
                    Réinitialiser
                  </button>
                </div>
              </div>

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
                >
                  Publier le signalement sécurisé ✔
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
                Merci pour votre civisme ! Votre signalement a été anonymisé et enregistré sous la référence :
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
                  setStep(1);
                  setCreatedDocId(null);
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
