import React, { useState } from 'react';
import { X, ShieldCheck, FileImage, Loader2, AlertCircle, MapPin, Calendar, Hash, User } from 'lucide-react';
import type { FoundDocument } from '../types';
import { CheckoutSection } from './CheckoutSection';
import { citiesOfRegion, regionNames, CITY_OTHER } from '../lib/cameroonGeo';

interface ClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  foundDoc: FoundDocument | null;
  onSubmit: (params: {
    fullName: string;
    docNumber: string;
    region: string;
    city: string;
    approxZone: string;
    lostDate: string;
    secretAnswer: string;
    referenceFile: File | null;
  }) => Promise<void>;
}

/**
 * Revendication « C'est mon document » — formulaire unique, court, en sections.
 * Crée automatiquement la déclaration de perte à la volée (RPC serveur) puis
 * soumet la revendication si une correspondance couvre ce document.
 */
export const ClaimModal: React.FC<ClaimModalProps> = ({ isOpen, onClose, foundDoc, onSubmit }) => {
  const [fullName, setFullName] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [region, setRegion] = useState('Centre');
  const [city, setCity] = useState(citiesOfRegion('Centre')[0]);
  const [cityOther, setCityOther] = useState('');
  const [approxZone, setApproxZone] = useState('');
  const [lostDate, setLostDate] = useState(new Date().toISOString().split('T')[0]);
  const [secretAnswer, setSecretAnswer] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setReferenceFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setReferencePreview(String(reader.result));
      reader.readAsDataURL(f);
    } else {
      setReferencePreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSubmit({
        fullName,
        docNumber,
        region,
        city: city === CITY_OTHER ? cityOther.trim() : city,
        approxZone,
        lostDate,
        secretAnswer,
        referenceFile
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la revendication.');
    } finally {
      setSubmitting(false);
    }
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
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="modal-title">C'est mon document</h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '1px' }}>
                {foundDoc?.title_masked || 'Déclaration de perte + revendication en un seul formulaire'}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <CheckoutSection step={1} title="Votre pièce" subtitle="Les informations telles qu'inscrites sur le document" />

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <User size={13} />
                Noms et prénoms inscrits sur la pièce *
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: Kamga Marie Chantal"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Hash size={13} />
                Numéro de la pièce * (si vous vous en souvenez)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: 1029384758"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                required
                minLength={4}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '4px' }}>
                Haché SHA-256 côté serveur — jamais stocké ni affiché en clair.
              </div>
            </div>

            <CheckoutSection step={2} title="Où et quand l'avez-vous perdu ?" />

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <MapPin size={12} />
                  Région *
                </label>
                <select
                  className="form-select"
                  value={region}
                  onChange={(e) => {
                    const r = e.target.value;
                    setRegion(r);
                    setCity(citiesOfRegion(r)[0] ?? '');
                    setCityOther('');
                  }}
                >
                  {regionNames().map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ville *</label>
                <select
                  className="form-select"
                  value={city === CITY_OTHER ? CITY_OTHER : city}
                  onChange={(e) => {
                    if (e.target.value === CITY_OTHER) setCity(CITY_OTHER);
                    else { setCity(e.target.value); setCityOther(''); }
                  }}
                  required
                >
                  {citiesOfRegion(region).map(c => <option key={c} value={c}>{c}</option>)}
                  <option value={CITY_OTHER}>Autre (préciser)…</option>
                </select>
                {city === CITY_OTHER && (
                  <input
                    type="text"
                    className="form-input"
                    style={{ marginTop: '8px' }}
                    placeholder="Nom de la ville ou du village"
                    value={cityOther}
                    onChange={(e) => setCityOther(e.target.value)}
                    required
                  />
                )}
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Zone approximative</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex: Bastos, marché central…"
                  value={approxZone}
                  onChange={(e) => setApproxZone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Calendar size={12} />
                  Date approximative
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={lostDate}
                  onChange={(e) => setLostDate(e.target.value)}
                />
              </div>
            </div>

            <CheckoutSection step={3} title="Preuve de propriété" subtitle="Vérifiée par nos modérateurs — jamais publique" />

            <div className="form-group">
              <label className="form-label">Réponse de vérification * (lieu de naissance, date de délivrance…)</label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: Née le 12/03/1995 à Bafoussam"
                value={secretAnswer}
                onChange={(e) => setSecretAnswer(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <FileImage size={13} />
                Photo d'une pièce similaire ou de votre dossier (optionnelle — accélère la validation)
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="form-input"
                onChange={handleFile}
                style={{ padding: '8px' }}
              />
              {referencePreview && (
                <div style={{
                  marginTop: '8px',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-color)',
                  maxHeight: '140px'
                }}>
                  <img src={referencePreview} alt="Aperçu" style={{ width: '100%', objectFit: 'cover' }} />
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
              type="submit"
              disabled={submitting}
              className="btn-cta-lost"
              style={{
                backgroundColor: 'var(--primary-700)',
                color: '#ffffff',
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={16} className="animate-spin" />
                  Traitement…
                </span>
              ) : (
                'Déclarer la perte et revendiquer →'
              )}
            </button>

            <div style={{ fontSize: '0.7rem', color: 'var(--slate-500)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <ShieldCheck size={12} color="var(--primary-600)" />
              Votre déclaration de perte est créée automatiquement — surveillance immédiate.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
