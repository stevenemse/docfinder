import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, ShieldCheck, FileImage, Loader2, AlertCircle, MapPin, Calendar, Hash, User } from 'lucide-react';
import type { FoundDocument } from '../types';
import { FormStepper } from './FormStepper';
import { useFormSteps, focusFirstInvalidField, type FormStepDef } from '../lib/useFormSteps';
import { citiesOfRegion, regionNames, CITY_OTHER } from '../lib/cameroonGeo';
import { useModalA11y } from '../lib/useModalA11y';
import { handleSupabaseError } from '../lib/errors';
import { claimSchema, type ClaimFormValues } from '../lib/validation';

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

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} role="alert" className="form-error">
      {message}
    </p>
  ) : null;

/**
 * Revendication « C'est mon document » — formulaire unique, court, en sections.
 * Crée automatiquement la déclaration de perte à la volée (RPC serveur) puis
 * soumet la revendication si une correspondance couvre ce document.
 */
export const ClaimModal: React.FC<ClaimModalProps> = ({ isOpen, onClose, foundDoc, onSubmit }) => {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const modalRef = useModalA11y(isOpen, onClose);

  const form = useForm<ClaimFormValues>({
    resolver: zodResolver(claimSchema),
    mode: 'onBlur',
    defaultValues: {
      fullName: '',
      docNumber: '',
      region: 'Centre',
      city: citiesOfRegion('Centre')[0],
      cityOther: '',
      approxZone: '',
      lostDate: new Date().toISOString().split('T')[0],
      secretAnswer: ''
    }
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    clearErrors,
    watch,
    formState: { errors, isSubmitting }
  } = form;

  /** Parcours en 3 étapes : pièce → lieu/date → preuve de propriété. */
  const formSteps = useMemo<Array<FormStepDef<ClaimFormValues>>>(
    () => [
      { label: 'Votre pièce', fields: ['fullName', 'docNumber'] },
      { label: 'Où et quand ?', fields: ['region', 'city', 'cityOther', 'approxZone', 'lostDate'] },
      { label: 'Preuve de propriété', fields: ['secretAnswer'] }
    ],
    []
  );
  const steps = useFormSteps(form, formSteps);

  /** Corps défilant de la modale (cadrage des erreurs). */
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const region = watch('region');
  const city = watch('city');

  // Chaque ouverture repart d'un formulaire vierge (le document visé change).
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setReferenceFile(null);
    setReferencePreview(null);
    steps.resetSteps();
    reset({
      fullName: '',
      docNumber: '',
      region: 'Centre',
      city: citiesOfRegion('Centre')[0],
      cityOther: '',
      approxZone: '',
      lostDate: new Date().toISOString().split('T')[0],
      secretAnswer: ''
    });
  }, [isOpen, reset]);

  if (!isOpen) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && !f.type.startsWith('image/')) {
      setErrorMsg('Format non accepté : choisissez une image (JPEG, PNG…).');
      return;
    }
    setErrorMsg(null);
    setReferenceFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setReferencePreview(String(reader.result));
      reader.readAsDataURL(f);
    } else {
      setReferencePreview(null);
    }
  };

  const submit = handleSubmit(async (values) => {
    setErrorMsg(null);
    try {
      await onSubmit({
        fullName: values.fullName.trim(),
        docNumber: values.docNumber.trim(),
        region: values.region,
        city: values.city === CITY_OTHER ? (values.cityOther ?? '').trim() : values.city,
        approxZone: values.approxZone ?? '',
        lostDate: values.lostDate ?? '',
        secretAnswer: values.secretAnswer.trim(),
        referenceFile
      });
    } catch (err) {
      setErrorMsg(handleSupabaseError(err, 'Revendication impossible pour le moment. Réessayez.'));
    }
  }, () => {
    steps.focusFirstErrorStep();
    window.setTimeout(() => focusFirstInvalidField(bodyRef.current), 160);
  });

  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="claim-modal-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
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
              <h2 id="claim-modal-title" className="modal-title">C'est mon document</h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '1px' }}>
                {foundDoc?.title_masked || 'Déclaration de perte + revendication en un seul formulaire'}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fermer la fenêtre de revendication">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" ref={bodyRef}>
          <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <FormStepper
              steps={formSteps.map((s) => s.label)}
              current={steps.step}
              onStepClick={steps.goTo}
            />

            {steps.stepError && (
              <p className="form-hint-error" role="alert">{steps.stepError}</p>
            )}

            {hasFieldErrors && (
              <p className="form-hint-error">
                Certains champs sont incomplets — les messages sont indiqués sous chaque champ.
              </p>
            )}

            {steps.step === 0 && <>
            <div className="form-group">
              <label className="form-label" htmlFor="claim-full-name" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <User size={13} />
                Noms et prénoms inscrits sur la pièce *
              </label>
              <input
                id="claim-full-name"
                type="text"
                className="form-input"
                placeholder="ex: Kamga Marie Chantal"
                autoComplete="name"
                aria-invalid={!!errors.fullName}
                aria-describedby={errors.fullName ? 'claim-full-name-error' : undefined}
                {...register('fullName')}
              />
              <FieldError id="claim-full-name-error" message={errors.fullName?.message} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="claim-doc-number" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Hash size={13} />
                Numéro de la pièce * (si vous vous en souvenez)
              </label>
              <input
                id="claim-doc-number"
                type="text"
                className="form-input"
                placeholder="ex: 1029384758"
                aria-invalid={!!errors.docNumber}
                aria-describedby={errors.docNumber ? 'claim-doc-number-error' : 'claim-doc-number-hint'}
                {...register('docNumber')}
              />
              <p id="claim-doc-number-hint" className="form-hint">
                Haché SHA-256 — jamais stocké ni affiché en clair.
              </p>
              <FieldError id="claim-doc-number-error" message={errors.docNumber?.message} />
            </div>

            </>}

            {steps.step === 1 && <>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="claim-region" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <MapPin size={12} />
                  Région *
                </label>
                <select
                  id="claim-region"
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
                <FieldError id="claim-region-error" message={errors.region?.message} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="claim-city">Ville *</label>
                <select
                  id="claim-city"
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
                      aria-describedby={errors.cityOther ? 'claim-city-other-error' : undefined}
                      {...register('cityOther')}
                    />
                    <FieldError id="claim-city-other-error" message={errors.cityOther?.message} />
                  </>
                )}
                <FieldError id="claim-city-error" message={errors.city?.message} />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="claim-approx-zone">Zone approximative</label>
                <input
                  id="claim-approx-zone"
                  type="text"
                  className="form-input"
                  placeholder="ex: Bastos, marché central…"
                  {...register('approxZone')}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="claim-lost-date" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Calendar size={12} />
                  Date approximative
                </label>
                <input
                  id="claim-lost-date"
                  type="date"
                  className="form-input"
                  {...register('lostDate')}
                />
              </div>
            </div>

            </>}

            {steps.step === 2 && <>

            <div className="form-group">
              <label className="form-label" htmlFor="claim-secret-answer">
                Réponse de vérification * (lieu de naissance, date de délivrance…)
              </label>
              <input
                id="claim-secret-answer"
                type="text"
                className="form-input"
                placeholder="ex: Née le 12/03/1995 à Bafoussam"
                aria-invalid={!!errors.secretAnswer}
                aria-describedby={errors.secretAnswer ? 'claim-secret-answer-error' : undefined}
                {...register('secretAnswer')}
              />
              <FieldError id="claim-secret-answer-error" message={errors.secretAnswer?.message} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="claim-photo" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <FileImage size={13} />
                Photo d'une pièce similaire ou de votre dossier (optionnelle — accélère la validation)
              </label>
              <input
                id="claim-photo"
                type="file"
                accept="image/*"
                capture="environment"
                className="form-input"
                onChange={handleFile}
                aria-describedby="claim-photo-hint"
                style={{ padding: '8px' }}
              />
              <p id="claim-photo-hint" className="form-hint">
                L'image est redimensionnée puis stockée dans le coffre privé (visible par vous et les modérateurs).
              </p>
              {referencePreview && (
                <div style={{
                  marginTop: '8px',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-color)',
                  maxHeight: '140px'
                }}>
                  <img src={referencePreview} alt="Aperçu de la photo jointe" style={{ width: '100%', objectFit: 'cover' }} />
                </div>
              )}
            </div>

            </>}

            {errorMsg && (
              <div role="alert" className="form-alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {!steps.isLast ? (
              <div className="form-step-nav">
                {steps.step > 0 && (
                  <button type="button" className="btn-step-back" onClick={steps.goBack}>
                    ← Précédent
                  </button>
                )}
                <button type="button" className="btn-step-next" onClick={() => void steps.goNext()}>
                  Continuer →
                </button>
              </div>
            ) : (
              <div className="form-step-nav">
                <button type="button" className="btn-step-back" onClick={steps.goBack}>
                  ← Précédent
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="btn-cta-lost"
                  style={{
                    backgroundColor: 'var(--primary-700)',
                    color: '#ffffff',
                    opacity: isSubmitting ? 0.7 : 1,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    marginTop: 0
                  }}
                >
                  {isSubmitting ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <Loader2 size={16} className="animate-spin" />
                      Traitement…
                    </span>
                  ) : (
                    'Déclarer et revendiquer →'
                  )}
                </button>
              </div>
            )}

            <div style={{ fontSize: '0.72rem', color: 'var(--slate-600)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <ShieldCheck size={12} color="var(--primary-600)" />
              Votre déclaration de perte est créée automatiquement — surveillance immédiate.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
