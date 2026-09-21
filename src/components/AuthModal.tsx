import React, { useState } from 'react';
import { X, ShieldCheck, AlertCircle, Phone, Mail, ChevronDown, ChevronUp, UserRound, KeyRound } from 'lucide-react';
import { CheckoutSection } from './CheckoutSection';
import { authService } from '../services/authService';
import type { Profile } from '../types';

const GoogleIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (profile: Profile) => void;
  initialMode?: 'login' | 'register';
  initialRole?: string; // Non utilisé — gardé pour compatibilité API
  onOpenLegal?: (doc: 'privacy' | 'terms' | 'cookies') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialMode = 'login',
  onOpenLegal
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Champs formulaire
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [optionalEmail, setOptionalEmail] = useState('');
  const [showEmailOption, setShowEmailOption] = useState(false);

  // Consentement RGPD / loi camerounaise 2024/017 (obligatoire à l'inscription)
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogle = async () => {
    setErrorMsg(null);
    setIsGoogleLoading(true);
    const res = await authService.signInWithGoogle();
    if (res.error) {
      setErrorMsg(res.error);
      setIsGoogleLoading(false);
      return;
    }
    // Filet de sécurité : si la redirection vers Google n'a pas eu lieu
    // (bloqueur de navigation, provider non activé…), on restaure le bouton.
    window.setTimeout(() => {
      setIsGoogleLoading(false);
      setErrorMsg(
        "La redirection vers Google n'a pas abouti. Si le problème persiste, " +
        'le provider Google n\'est peut-être pas encore activé côté serveur — ' +
        'utilisez le formulaire numéro + mot de passe en attendant.'
      );
    }, 8000);
  };

  const handleSwitchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setErrorMsg(null);
    setPhoneOrEmail('');
    setPassword('');
    setDisplayName('');
    setPhone('');
    setOptionalEmail('');
    setShowEmailOption(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        if (!phoneOrEmail.trim() || !password.trim()) {
          setErrorMsg('Veuillez renseigner votre numéro de téléphone et votre mot de passe.');
          setIsLoading(false);
          return;
        }

        const res = await authService.login({ phoneOrEmail: phoneOrEmail.trim(), password });
        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.profile) {
          onAuthSuccess(res.profile);
          onClose();
        }
      } else {
        if (!phone.trim() || !password.trim() || !displayName.trim()) {
          setErrorMsg('Veuillez renseigner votre nom, votre numéro de téléphone et un mot de passe.');
          setIsLoading(false);
          return;
        }
        // Numéro camerounais : exactement 9 chiffres, commençant par 6 (MTN/Orange)
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length !== 9 || !phoneDigits.startsWith('6')) {
          setErrorMsg('Numéro invalide : saisissez les 9 chiffres après le +237 (ex : 6XX XX XX XX).');
          setIsLoading(false);
          return;
        }
        if (password.length < 8) {
          setErrorMsg('Le mot de passe doit contenir au moins 6 caractères.');
          setIsLoading(false);
          return;
        }
        if (!consentAccepted) {
          setErrorMsg('Vous devez accepter la Politique de Confidentialité et les Conditions d\'Utilisation pour créer un compte.');
          setIsLoading(false);
          return;
        }

        const res = await authService.register({
          phone,
          password,
          displayName,
          email: optionalEmail.trim() || undefined
        });
        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.profile) {
          onAuthSuccess(res.profile);
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  const legalLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--primary-700)',
    fontWeight: 700,
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 'inherit'
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="brand-icon" style={{ width: '32px', height: '32px' }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="modal-title" style={{ fontSize: '1.05rem' }}>
                {mode === 'login' ? 'Connexion Sécurisée' : 'Créer un Compte Citoyen'}
              </h2>
              <span style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
                DocFinder Cameroun
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switch */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--slate-50)'
        }}>
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleSwitchMode(m)}
              style={{
                padding: '12px',
                border: 'none',
                background: mode === m ? '#ffffff' : 'transparent',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: mode === m ? 'var(--primary-700)' : 'var(--slate-500)',
                borderBottom: mode === m ? '3px solid var(--primary-700)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {m === 'login' ? 'Se Connecter' : 'Créer un Compte'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Connexion Google — zéro friction */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={isGoogleLoading || isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              background: '#ffffff',
              color: 'var(--slate-800)',
              border: '1.5px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 20px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: isGoogleLoading ? 'wait' : 'pointer',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              marginBottom: '16px'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--slate-400)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            {isGoogleLoading
              ? <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>Redirection vers Google…</span>
              : <>
                  <GoogleIcon size={18} />
                  Continuer avec Google
                </>}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '14px',
            color: 'var(--slate-400)',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            <span style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
            ou avec votre numéro
            <span style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
          </div>
          {/* Unified Citizen Info Banner */}
          <div style={{
            background: 'var(--primary-50)',
            border: '1px solid var(--primary-100)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '0.78rem',
            color: 'var(--primary-900)',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start'
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>ℹ️</span>
            <span>
              <strong>Compte Citoyen Unique :</strong> Avec un seul compte, vous pouvez
              à la fois <em>signaler un document que vous avez trouvé</em> et <em>déclarer
              la perte de vos propres pièces</em>. Pas besoin de deux comptes.
            </span>
          </div>

          {/* Error */}
          {errorMsg && (
            <div style={{
              background: 'var(--red-50)',
              border: '1px solid var(--red-100)',
              color: 'var(--red-700)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '12px'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>

            {/* REGISTER FORM */}
            {mode === 'register' && (
              <>
                {/* Étape 1 — Identité */}
                <CheckoutSection step={1} title="Qui êtes-vous ?" subtitle="Comme inscrit sur vos pièces officielles" />

                {/* Full Name */}
                <div className="form-group">
                  <label className="form-label">Nom et Prénom *</label>
                  <div className="input-icon-wrap">
                    <UserRound size={15} />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="ex: Chantal Kamga ou Paul Eto'o"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Phone — Identifiant principal (saisie 9 chiffres uniquement) */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} />
                    Numéro de Téléphone * — <span style={{ color: 'var(--primary-700)', fontWeight: 800 }}>Identifiant de connexion</span>
                  </label>
                  <div style={{ display: 'flex' }}>
                    <span className="phone-prefix">
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>🇨🇲</span>
                      +237
                    </span>
                    <input
                      type="tel"
                      className="form-input"
                      style={{ borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}
                      placeholder="6XX XX XX XX"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={12}
                      value={phone}
                      onChange={(e) => {
                        // 9 chiffres max, formatage automatique 4-2-2-2
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                        setPhone([
                          digits.slice(0, 4),
                          digits.slice(4, 6),
                          digits.slice(6, 8),
                          digits.slice(8, 9)
                        ].filter(Boolean).join(' '));
                      }}
                      required
                    />
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '4px' }}>
                    Les 9 chiffres après le +237 (MTN ou Orange). Ce numéro sera votre identifiant de connexion.
                  </p>
                </div>

                {/* Étape 2 — Sécurité */}
                <CheckoutSection step={2} title="Sécurisez votre compte" />

                {/* Password */}
                <div className="form-group">
                  <label className="form-label">Mot de Passe * (min. 6 caractères)</label>
                  <div className="input-icon-wrap">
                    <KeyRound size={15} />
                    <input
                      type="password"
                      className="form-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                {/* Optional Email — Collapsible */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowEmailOption(!showEmailOption)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--slate-600)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Mail size={13} />
                    {showEmailOption ? 'Masquer' : 'Ajouter une adresse email'} (optionnel — récupération de compte)
                    {showEmailOption ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {showEmailOption && (
                    <div className="form-group" style={{ marginTop: '10px' }}>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="votre.email@exemple.com (facultatif)"
                        value={optionalEmail}
                        onChange={(e) => setOptionalEmail(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Consentement RGPD / Loi n° 2024/017 — obligatoire */}
                <div style={{
                  background: 'var(--slate-50)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}>
                  <input
                    type="checkbox"
                    id="rgpd-consent"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    style={{ marginTop: '2px', width: '16px', height: '16px', flexShrink: 0, accentColor: 'var(--primary-700)' }}
                  />
                  <label htmlFor="rgpd-consent" style={{ fontSize: '0.76rem', color: 'var(--slate-600)', lineHeight: 1.55 }}>
                    J'accepte la{' '}
                    <button type="button" style={legalLinkStyle} onClick={() => onOpenLegal?.('privacy')}>
                      Politique de Confidentialité
                    </button>{' '}
                    et les{' '}
                    <button type="button" style={legalLinkStyle} onClick={() => onOpenLegal?.('terms')}>
                      Conditions Générales d'Utilisation
                    </button>
                    . Je consens au traitement de mes données personnelles (nom, numéro de téléphone)
                    conformément à la{' '}
                    <strong>loi n° 2024/017 du 23 décembre 2024</strong> relative à la protection des
                    données à caractère personnel au Cameroun.
                  </label>
                </div>
              </>
            )}

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <>
                <CheckoutSection title="Vos identifiants" subtitle="Numéro de téléphone + mot de passe" />

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} />
                    Numéro de téléphone ou adresse email
                  </label>
                  <div className="input-icon-wrap">
                    <UserRound size={15} />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="+237 6xx xx xx xx ou email@exemple.com"
                      value={phoneOrEmail}
                      onChange={(e) => setPhoneOrEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Mot de Passe</label>
                  <div className="input-icon-wrap">
                    <KeyRound size={15} />
                    <input
                      type="password"
                      className="form-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Légal — accessible depuis la connexion aussi */}
                <p style={{ fontSize: '0.72rem', color: 'var(--slate-500)', textAlign: 'center', lineHeight: 1.5 }}>
                  En vous connectant, vous acceptez nos{' '}
                  <button type="button" style={legalLinkStyle} onClick={() => onOpenLegal?.('terms')}>
                    CGU
                  </button>{' '}
                  et notre{' '}
                  <button type="button" style={legalLinkStyle} onClick={() => onOpenLegal?.('privacy')}>
                    Politique de Confidentialité
                  </button>.
                </p>
              </>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                backgroundColor: 'var(--primary-700)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '13px 20px',
                fontSize: '0.95rem',
                fontWeight: 800,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                marginTop: '4px',
                opacity: isLoading ? 0.7 : 1,
                transition: 'opacity 0.15s ease'
              }}
            >
              {isLoading
                ? 'Connexion en cours...'
                : mode === 'login'
                  ? '🔐  Se Connecter'
                  : '✅  Créer mon Compte Citoyen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
