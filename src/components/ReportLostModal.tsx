import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import type { DocumentType, LostDocument } from '../types';
import { sha256Hex } from '../lib/crypto';
import { citiesOfRegion, regionNames, CITY_OTHER } from '../lib/cameroonGeo';
import { useModalA11y } from '../lib/useModalA11y';
import { dataService } from '../services/dataService';
import { handleSupabaseError } from '../lib/errors';
import { buildReportLostSchema, type ReportLostFormValues } from '../lib/validation';
import { CheckoutSection } from './CheckoutSection';

interface ReportLostModalProps {
  isOpen: boolean;
  onClose: () => void;
  docTypes: DocumentType[];
  onLostCreated: (lostDoc: LostDocument) => void | Promise<void>;
  seekerProfileId: string;
  onViewMatches: () => void;
}

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} role="alert" className="form-error">
      {message}
    </p>
  ) : null;

export const ReportLostModal: React.FC<ReportLostModalProps> = ({
  isOpen,
  onClose,
  docTypes,
  onLostCreated,
  seekerProfileId,
  onViewMatches
}) => {
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  const modalRef = useModalA11y(isOpen, onClose);

  /** Champs de preuve du type courant : lus par le resolver (qui est stable). */
  const proofFieldsRef = useRef<DocumentType['secret_proof_fields']>([]);

  const resolver = useMemo(
    () => (values: ReportLostFormValues, ctx: unknown, options: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (zodResolver(buildReportLostSchema(proofFieldsRef.current ?? [])) as any)(values, ctx, options),
    []
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    clearErrors,
    formState: { errors, isSubmitting }
  } = useForm<ReportLostFormValues>({
    resolver,
    mode: 'onBlur',
    defaultValues: {
      docTypeId: docTypes[0]?.id || 'dt-1',
      fullName: '',
      partialDocNum: '',
      region: 'Centre',
      city: citiesOfRegion('Centre')[0],
      cityOther: '',
      approxZone: '',
      lostDate: new Date().toISOString().split('T')[0],
      secretQuestion: 'Quel est le lieu exact de naissance inscrit sur la pièce ?',
      secretAnswer: '',
      proofs: {}
    }
  });

  const docTypeId = watch('docTypeId');
  const region = watch('region');
  const city = watch('city');

  const currentProofFields = useMemo(
    () => docTypes.find((dt) => dt.id === docTypeId)?.secret_proof_fields ?? [],
    [docTypes, docTypeId]
  );

  useEffect(() => {
    proofFieldsRef.current = currentProofFields;
  }, [currentProofFields]);

  // Les types arrivent async (Supabase) : si l'état initial pointait vers le
  // mock 'dt-1', on resynchronise dès que la vraie liste est chargée.
  useEffect(() => {
    if (docTypes.length > 0 && !docTypes.some((d) => d.id === docTypeId)) {
      setValue('docTypeId', docTypes[0].id);
    }
  }, [docTypes, docTypeId, setValue]);

  // Formulaire remis à zéro à chaque ouverture (pas de fuite d'un dossier à l'autre).
  useEffect(() => {
    if (!isOpen) return;
    setIsSuccess(false);
    setSubmitError(null);
    setReferenceFile(null);
    setReferencePreview(null);
    reset({
      docTypeId: docTypes[0]?.id || 'dt-1',
      fullName: '',
      partialDocNum: '',
      region: 'Centre',
      city: citiesOfRegion('Centre')[0],
      cityOther: '',
      approxZone: '',
      lostDate: new Date().toISOString().split('T')[0],
      secretQuestion: 'Quel est le lieu exact de naissance inscrit sur la pièce ?',
      secretAnswer: '',
      proofs: {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSubmitError('Format non accepté : choisissez une image (JPEG, PNG…).');
      return;
    }
    setSubmitError(null);
    setReferenceFile(file);
    const reader = new FileReader();
    reader.onload = () => setReferencePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setReferenceFile(null);
    setReferencePreview(null);
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      // Upload de la photo de référence (bucket privé vault) — best effort
      let referenceImagePath: string | null = null;
      if (referenceFile) {
        try {
          const up = await dataService.uploadReferenceImage(referenceFile, seekerProfileId);
          referenceImagePath = up.path;
        } catch (err) {
          console.warn('Upload photo de référence échoué (on continue sans):', err);
        }
      }

      const configuredFields = currentProofFields;
      const hasConfiguredFields = configuredFields.length > 0;
      const secretQuestionFinal = hasConfiguredFields
        ? configuredFields.map((f) => f.label).join(' | ')
        : (values.secretQuestion || 'Preuve de propriété');
      const secretAnswerFinal = hasConfiguredFields
        ? configuredFields.map((f) => `${f.label}: ${values.proofs?.[f.key] || ''}`).join(' | ')
        : (values.secretAnswer ?? '');

      const newLost: Omit<LostDocument, 'id' | 'created_at' | 'updated_at'> = {
        seeker_id: seekerProfileId,
        document_type_id: values.docTypeId,
        full_name_search: values.fullName.trim(),
        doc_number_partial: values.partialDocNum?.trim() || undefined,
        // Sécurité : SHA-256 — le numéro et la réponse secrète ne sont jamais stockés en clair
        doc_number_hash: values.partialDocNum ? await sha256Hex(values.partialDocNum) : undefined,
        lost_region: values.region,
        lost_city: values.city === CITY_OTHER ? (values.cityOther ?? '').trim() : values.city,
        approx_loss_zone: values.approxZone || undefined,
        lost_date_approx: values.lostDate || new Date().toISOString().split('T')[0],
        secret_proof_question: secretQuestionFinal,
        secret_proof_answer_hash: await sha256Hex(secretAnswerFinal),
        reference_image_path: referenceImagePath,
        status: 'published'
      };

      const saved: LostDocument = {
        ...newLost,
        id: `lost-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await onLostCreated(saved);
      setIsSuccess(true);
    } catch (err) {
      setSubmitError(
        handleSupabaseError(err, "Enregistrement impossible pour le moment. Vérifiez votre connexion et réessayez.")
      );
    }
  });

  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="report-lost-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
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
            <h2 id="report-lost-title" className="modal-title">Déclarer un document perdu</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fermer le formulaire de déclaration de perte">
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
                  Consulter mes correspondances →
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
            <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="alert-security-box">
                <Lock size={18} style={{ flexShrink: 0, color: 'var(--gold-600)' }} />
                <div>
                  <strong>Sécurité Anti-Fraude :</strong>
                  <p style={{ marginTop: '2px', fontSize: '0.78rem' }}>
                    La question secrète ci-dessous sera exigée lors d'une tentative de réclamation pour prouver que vous êtes bien le titulaire légitime.
                  </p>
                </div>
              </div>

              {submitError && (
                <div role="alert" className="form-alert">
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{submitError}</span>
                </div>
              )}

              {hasFieldErrors && (
                <p className="form-hint-error">
                  Certains champs sont incomplets — les messages sont indiqués sous chaque champ.
                </p>
              )}

              {/* ÉTAPE 1 — La pièce */}
              <CheckoutSection step={1} title="La pièce égarée" />

              <div className="form-group">
                <label className="form-label" htmlFor="lost-doc-type">Type de document *</label>
                <select
                  id="lost-doc-type"
                  className="form-select"
                  aria-invalid={!!errors.docTypeId}
                  aria-describedby={errors.docTypeId ? 'lost-doc-type-error' : undefined}
                  {...register('docTypeId')}
                >
                  {docTypes.map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.name}</option>
                  ))}
                </select>
                <FieldError id="lost-doc-type-error" message={errors.docTypeId?.message} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="lost-full-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={13} />
                  Nom et prénom inscrits sur la pièce *
                </label>
                <input
                  id="lost-full-name"
                  type="text"
                  className="form-input"
                  placeholder="ex: Kamga Chantal"
                  autoComplete="name"
                  aria-invalid={!!errors.fullName}
                  aria-describedby={errors.fullName ? 'lost-full-name-error' : undefined}
                  {...register('fullName')}
                />
                <FieldError id="lost-full-name-error" message={errors.fullName?.message} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="lost-doc-number" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={13} />
                  Numéro partiel de la pièce (si mémorisé)
                </label>
                <input
                  id="lost-doc-number"
                  type="text"
                  className="form-input"
                  placeholder="ex: 109288 ou fragments"
                  aria-describedby="lost-doc-number-hint"
                  {...register('partialDocNum')}
                />
                <p id="lost-doc-number-hint" className="form-hint">Haché SHA-256 côté client — jamais stocké en clair.</p>
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
                      <img src={referencePreview} alt="Aperçu de la pièce jointe" className="ref-upload-thumb" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ref-upload-title">Photo jointe ✓</div>
                        <div className="ref-upload-sub">
                          Stockée en privé — visible uniquement par vous et les modérateurs DPO pour accélérer la vérification.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        aria-label="Retirer la photo jointe"
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
                  <label className="form-label" htmlFor="lost-region" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <MapPin size={12} />
                    Région *
                  </label>
                  <select
                    id="lost-region"
                    className="form-select"
                    aria-invalid={!!errors.region}
                    {...register('region', {
                      onChange: (e) => {
                        const r = e.target.value;
                        setValue('city', citiesOfRegion(r)[0] ?? '');
                        setValue('cityOther', '');
                        clearErrors(['city', 'cityOther']);
                      }
                    })}
                  >
                    {regionNames().map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <FieldError id="lost-region-error" message={errors.region?.message} />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="lost-city">Ville *</label>
                  <select
                    id="lost-city"
                    className="form-select"
                    aria-invalid={!!errors.city}
                    {...register('city', {
                      onChange: (e) => {
                        if (e.target.value !== CITY_OTHER) setValue('cityOther', '');
                      }
                    })}
                  >
                    {citiesOfRegion(region).map(c => <option key={c} value={c}>{c}</option>)}
                    <option value={CITY_OTHER}>Autre (préciser)…</option>
                  </select>
                  {city === CITY_OTHER && (
                    <>
                      <input
                        type="text"
                        className="form-input"
                        style={{ marginTop: '8px' }}
                        placeholder="Nom de la ville ou du village"
                        aria-label="Nom de la ville ou du village"
                        aria-invalid={!!errors.cityOther}
                        aria-describedby={errors.cityOther ? 'lost-city-other-error' : undefined}
                        {...register('cityOther')}
                      />
                      <FieldError id="lost-city-other-error" message={errors.cityOther?.message} />
                    </>
                  )}
                  <FieldError id="lost-city-error" message={errors.city?.message} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="lost-approx-zone">Zone approximative de la perte</label>
                <input
                  id="lost-approx-zone"
                  type="text"
                  className="form-input"
                  placeholder="ex: Bastos, Tsinga, Agence Buca Voyages..."
                  {...register('approxZone')}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="lost-date" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={13} />
                  Date approximative de la perte
                </label>
                <input
                  id="lost-date"
                  type="date"
                  className="form-input"
                  {...register('lostDate')}
                />
              </div>

              {/* ÉTAPE 3 — Preuve secrète (champs configurés par type de document) */}
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
                  Informations confidentielles de vérification
                </div>

                {currentProofFields.length === 0 ? (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="lost-secret-question" style={{ fontSize: '0.78rem' }}>Question :</label>
                      <select
                        id="lost-secret-question"
                        className="form-select"
                        style={{ fontSize: '0.82rem' }}
                        {...register('secretQuestion')}
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
                      <label className="form-label" htmlFor="lost-secret-answer" style={{ fontSize: '0.78rem' }}>
                        Réponse secrète attendue (confidentielle) *
                      </label>
                      <input
                        id="lost-secret-answer"
                        type="text"
                        className="form-input"
                        placeholder="ex: Bafoussam ou Yaoundé 2"
                        aria-invalid={!!errors.secretAnswer}
                        aria-describedby={errors.secretAnswer ? 'lost-secret-answer-error' : undefined}
                        {...register('secretAnswer')}
                      />
                      <FieldError id="lost-secret-answer-error" message={errors.secretAnswer?.message} />
                    </div>
                  </>
                ) : (
                  currentProofFields.map((f) => (
                    <div className="form-group" key={f.key} style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor={`lost-proof-${f.key}`} style={{ fontSize: '0.78rem' }}>
                        {f.label}{f.required ? ' *' : ''}
                      </label>
                      <input
                        id={`lost-proof-${f.key}`}
                        type={f.type === 'date' ? 'date' : 'text'}
                        className="form-input"
                        aria-invalid={!!errors.proofs?.[f.key]}
                        aria-describedby={errors.proofs?.[f.key] ? `lost-proof-${f.key}-error` : undefined}
                        {...register(`proofs.${f.key}` as const)}
                      />
                      <FieldError id={`lost-proof-${f.key}-error`} message={errors.proofs?.[f.key]?.message} />
                    </div>
                  ))
                )}
              </div>

              <button
                type="submit"
                className="btn-cta-lost"
                style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', marginTop: '10px' }}
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting
                  ? (referenceFile ? 'Envoi de la photo...' : 'Enregistrement...')
                  : 'Lancer la recherche automatique →'}
              </button>

              <div style={{ fontSize: '0.72rem', color: 'var(--slate-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
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
