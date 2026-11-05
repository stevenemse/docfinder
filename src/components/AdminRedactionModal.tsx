import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, AlertTriangle, Eraser, Undo2, Loader2, Check, Ban } from 'lucide-react';
import type { AdminDocumentRow } from '../types';
import { dataService } from '../services/dataService';
import { useModalA11y } from '../lib/useModalA11y';

interface AdminRedactionModalProps {
  doc: AdminDocumentRow;
  onClose: () => void;
  onDone: () => void;
  showToast: (message: string) => void;
}

interface MaskZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MASK_W = 130;
const MASK_H = 95;
const MAX_CANVAS_W = 720;

/**
 * Contrôle humain du caviardage avant publication.
 *
 * Le citoyen masque ce qu'il veut, mais rien n'est publié sans passage par
 * cette étape : un modérateur voit l'image telle qu'elle serait publiée, peut
 * ajouter des masques (le tracé est ré-appliqué sur le fichier, pas seulement
 * à l'écran), puis publier ou rejeter le signalement.
 */
export const AdminRedactionModal: React.FC<AdminRedactionModalProps> = ({
  doc,
  onClose,
  onDone,
  showToast
}) => {
  const [imgStatus, setImgStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [masks, setMasks] = useState<MaskZone[]>([]);
  const [busy, setBusy] = useState<null | 'publish' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const modalRef = useModalA11y(true, onClose);

  // Chargement de l'image effectivement publiée (bucket public "masked").
  useEffect(() => {
    const url = doc.masked_image_url;
    if (!url) {
      setImgStatus('error');
      return;
    }
    let cancelled = false;
    const img = new Image();
    // Nécessaire pour exporter le canvas (toDataURL) depuis le bucket distant.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      const scale = Math.min(1, MAX_CANVAS_W / img.naturalWidth);
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
      setCanvasSize({
        w: Math.round(img.naturalWidth * scale),
        h: Math.round(img.naturalHeight * scale)
      });
      setImgStatus('ready');
    };
    img.onerror = () => { if (!cancelled) setImgStatus('error'); };
    img.src = url;
    return () => { cancelled = true; };
  }, [doc.masked_image_url]);

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
      ctx.fillText('MASQUÉ', m.x * sx + 4, m.y * sy + (m.h * sy) / 2 + 3);
    });
  }, [masks, imgDims]);

  useEffect(() => {
    if (canvasSize.w > 0) redraw();
  }, [canvasSize, redraw]);

  const handleCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgDims) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * imgDims.w;
    const py = ((e.clientY - rect.top) / rect.height) * imgDims.h;
    setMasks(prev => [
      ...prev,
      {
        x: Math.max(0, Math.min(imgDims.w - MASK_W, px - MASK_W / 2)),
        y: Math.max(0, Math.min(imgDims.h - MASK_H, py - MASK_H / 2)),
        w: MASK_W,
        h: MASK_H
      }
    ]);
  };

  /** Rendu pleine résolution : image publiée + nouveaux masques, non réversible. */
  const renderWithMasks = (): string | null => {
    const img = imgRef.current;
    if (!img || !imgDims) return null;
    if (masks.length === 0) return null;
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
    try {
      return off.toDataURL('image/jpeg', 0.85);
    } catch {
      // Canvas « tainted » (image distante sans CORS) : on refuse de publier
      // une image qu'on n'a pas pu masquer, plutôt que publier l'original.
      return null;
    }
  };

  const handlePublish = async () => {
    setError(null);
    let maskedDataUrl: string | null = null;
    if (masks.length > 0) {
      maskedDataUrl = renderWithMasks();
      if (!maskedDataUrl) {
        setError("Impossible de réécrire l'image (accès CORS au fichier refusé). Publiez sans masque ajouté, ou rejetez le signalement.");
        return;
      }
    }
    setBusy('publish');
    const res = await dataService.adminModerateFoundDocument(doc.id, 'published', maskedDataUrl);
    setBusy(null);
    if (!res.ok) {
      setError(res.error || 'Publication refusée.');
      return;
    }
    showToast(
      masks.length > 0
        ? 'Image recaviardée et signalement publié ✓'
        : 'Signalement publié ✓'
    );
    onDone();
    onClose();
  };

  const handleReject = async () => {
    setBusy('reject');
    const res = await dataService.adminModerateFoundDocument(doc.id, 'rejected', null);
    setBusy(null);
    if (!res.ok) {
      setError(res.error || 'Rejet refusé.');
      return;
    }
    showToast('Signalement rejeté — il reste invisible au public.');
    onDone();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-redaction-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
              background: 'var(--primary-100)', color: 'var(--primary-800)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ShieldCheck size={18} />
            </div>
            <h2 id="admin-redaction-title" className="modal-title">Contrôle du caviardage</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fermer le contrôle du caviardage">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--slate-900)' }}>
            {doc.title}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--slate-600)', marginTop: '2px' }}>
            {doc.city} ({doc.region}){doc.doc_number_partial ? ` · N° ${doc.doc_number_partial}` : ''}
            {' '}· déposé le {new Date(doc.created_at).toLocaleDateString('fr-FR')}
          </div>

          <div style={{
            marginTop: '10px', padding: '9px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--gold-50, #fffbeb)', border: '1px solid var(--gold-200, #fde68a)',
            fontSize: '0.76rem', color: '#92400e', lineHeight: 1.5
          }}>
            Voici l'image <strong>telle qu'elle serait publiée</strong>. Si le visage, le numéro ou la
            signature restent lisibles, touchez-les pour les masquer — le masque est réécrit dans le
            fichier, pas seulement affiché.
          </div>

          {imgStatus === 'loading' && (
            <div style={{ textAlign: 'center', padding: '28px', color: 'var(--slate-500)' }}>
              <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              Chargement de l'image publiée…
            </div>
          )}

          {imgStatus === 'error' && (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px',
              background: 'var(--red-50, #fef2f2)', border: '1px solid #fecaca',
              borderRadius: 'var(--radius-md)', padding: '9px 12px',
              fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600
            }}>
              <AlertTriangle size={14} />
              Image indisponible : impossible de vérifier le caviardage. Rejetez le signalement pour
              qu'il soit redéposé avec une photo.
            </div>
          )}

          {imgStatus === 'ready' && canvasSize.w > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-700)', marginTop: '12px' }}>
                Touchez l'image pour ajouter un masque ({masks.length})
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
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setMasks(prev => prev.slice(0, -1))}
                  disabled={masks.length === 0}
                  style={{
                    background: 'var(--slate-200)', border: 'none', borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px', fontSize: '0.74rem', fontWeight: 600,
                    cursor: masks.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  <Undo2 size={13} /> Annuler
                </button>
                <button
                  type="button"
                  onClick={() => setMasks([])}
                  disabled={masks.length === 0}
                  style={{
                    background: 'var(--slate-200)', border: 'none', borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px', fontSize: '0.74rem', fontWeight: 600,
                    cursor: masks.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  <Eraser size={13} /> Tout effacer
                </button>
              </div>
            </>
          )}

          {error && (
            <div role="alert" style={{ marginTop: '10px', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy !== null}
              style={{
                flex: 1, minWidth: '140px', border: '1px solid var(--red-100, #fee2e2)',
                background: 'var(--red-50, #fef2f2)', color: '#b91c1c',
                borderRadius: 'var(--radius-md)', padding: '12px 14px',
                fontWeight: 800, fontSize: '0.82rem', cursor: busy ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              {busy === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              Rejeter
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy !== null || imgStatus !== 'ready'}
              style={{
                flex: 2, minWidth: '180px', border: 'none',
                background: 'var(--primary-700)', color: '#ffffff',
                borderRadius: 'var(--radius-md)', padding: '12px 14px',
                fontWeight: 800, fontSize: '0.82rem',
                cursor: busy || imgStatus !== 'ready' ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              {busy === 'publish' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {masks.length > 0 ? 'Appliquer les masques et publier' : 'Publier cette image'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
