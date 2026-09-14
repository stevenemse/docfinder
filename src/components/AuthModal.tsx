import React, { useState } from 'react';
import { X, ShieldCheck, AlertCircle, Phone, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { authService } from '../services/authService';
import type { Profile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (profile: Profile) => void;
  initialMode?: 'login' | 'register';
  initialRole?: string; // Non utilisé — gardé pour compatibilité API
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialMode = 'login'
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Champs formulaire
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [optionalEmail, setOptionalEmail] = useState('');
  const [showEmailOption, setShowEmailOption] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

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
        if (password.length < 6) {
          setErrorMsg('Le mot de passe doit contenir au moins 6 caractères.');
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

  const handleQuickDemoLogin = (key: 'citizen1' | 'citizen2' | 'admin') => {
    const profile = authService.loginAsDemo(key);
    onAuthSuccess(profile);
    onClose();
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
                {/* Full Name */}
                <div className="form-group">
                  <label className="form-label">Nom et Prénom *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ex: Chantal Kamga ou Paul Eto'o"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>

                {/* Phone — Identifiant principal */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} />
                    Numéro de Téléphone (Cameroun) * — <span style={{ color: 'var(--primary-700)', fontWeight: 800 }}>Identifiant de connexion</span>
                  </label>
                  <div style={{ display: 'flex' }}>
                    <span style={{
                      padding: '10px 12px',
                      background: 'var(--primary-50)',
                      border: '1px solid var(--primary-200)',
                      borderRight: 'none',
                      borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      color: 'var(--primary-800)'
                    }}>
                      🇨🇲 +237
                    </span>
                    <input
                      type="tel"
                      className="form-input"
                      style={{ borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}
                      placeholder="6xx xx xx xx (MTN ou Orange)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '4px' }}>
                    Ce numéro sera votre identifiant de connexion et permettra les futures notifications SMS.
                  </p>
                </div>

                {/* Password */}
                <div className="form-group">
                  <label className="form-label">Mot de Passe * (min. 6 caractères)</label>
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
              </>
            )}

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} />
                    Numéro de téléphone ou adresse email
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="+237 6xx xx xx xx ou email@exemple.com"
                    value={phoneOrEmail}
                    onChange={(e) => setPhoneOrEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Mot de Passe</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
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

          {/* Quick Demo Bar */}
          <div style={{
            marginTop: '18px',
            paddingTop: '14px',
            borderTop: '1px dashed var(--border-color)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)', fontWeight: 600, marginBottom: '8px' }}>
              ⚡ Accès Rapide Démo (Mode Test, sans saisie)
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('citizen1')}
                style={{
                  background: 'var(--primary-50)',
                  border: '1px solid var(--primary-100)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  color: 'var(--primary-800)',
                  cursor: 'pointer'
                }}
              >
                👤 Chantal (Citoyenne)
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('citizen2')}
                style={{
                  background: 'var(--primary-50)',
                  border: '1px solid var(--primary-100)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  color: 'var(--primary-800)',
                  cursor: 'pointer'
                }}
              >
                👤 Paul (Citoyen)
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('admin')}
                style={{
                  background: 'var(--slate-100)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  color: 'var(--slate-700)',
                  cursor: 'pointer'
                }}
              >
                🛡️ Modérateur DPO
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
