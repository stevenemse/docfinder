import React, { useState } from 'react';
import { User, Phone, Mail, KeyRound, Save, Loader2, CheckCircle2, AlertCircle, ShieldCheck, Bell, BellOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { normalizePhone } from '../services/authService';
import { pushService } from '../services/pushService';
import type { Profile } from '../types';

interface ProfilePageProps {
  profile: Profile;
  onProfileUpdated: (p: Profile) => void;
  showToast: (msg: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ profile, onProfileUpdated, showToast }) => {
  // ---- Informations personnelles ----
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  // Format local 9 chiffres (le +237 est implicite et affiché dans le label)
  const [phone, setPhone] = useState(() => {
    const d = (profile.phone || '').replace(/\D/g, '');
    const local = d.startsWith('237') ? d.slice(3) : d;
    return [
      local.slice(0, 4),
      local.slice(4, 6),
      local.slice(6, 8),
      local.slice(8, 9)
    ].filter(Boolean).join(' ');
  });
  const [email, setEmail] = useState(profile.email || '');

  // ---- Changement de mot de passe ----
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [infoMsg, setInfoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ---- Notifications push ----
  const [pushBusy, setPushBusy] = useState(false);
  const [pushGranted, setPushGranted] = useState(() => pushService.permission() === 'granted');
  const [pushSupported] = useState(() => pushService.isSupported());

  const infoDirty =
    displayName !== (profile.display_name || '') ||
    phone !== (profile.phone || '') ||
    email !== (profile.email || '');

  const handleSaveInfo = async () => {
    setInfoMsg(null);

    if (!displayName.trim()) {
      setInfoMsg({ type: 'err', text: 'Le nom ne peut pas être vide.' });
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 9 || !digits.startsWith('6')) {
      setInfoMsg({ type: 'err', text: 'Numéro invalide : saisissez les 9 chiffres après le +237 (ex : 6XX XX XX XX).' });
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone !== profile.phone) {
      // Unicité du numéro : on interroge la table profiles (la RLS limite ce qu'on voit,
      // mais le doublon sera aussi rejeté côté serveur si une contrainte existe)
      try {
        if (isSupabaseConfigured()) {
          const { data: taken, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', normalizedPhone)
            .maybeSingle();
          if (!error && taken) {
            setInfoMsg({ type: 'err', text: 'Ce numéro est déjà utilisé par un autre compte.' });
            return;
          }
        }
      } catch {
        // La RLS peut empêcher la lecture : la contrainte côté serveur reste le garde-fou
      }
    }

    setSavingInfo(true);
    try {
      if (isSupabaseConfigured()) {
        // 1. Met à jour l'identifiant d'authentification si le numéro a changé —
        //    UNIQUEMENT si l'email d'auth actuel est un alias téléphone.
        //    (Comptes Google : on préserve l'email Google comme identifiant.)
        if (normalizedPhone !== profile.phone) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            const authEmail = user?.email ?? '';
            if (authEmail.endsWith('@phone.docfinder.cm')) {
              const newAuthEmail = `${normalizedPhone.replace(/\D/g, '')}@phone.docfinder.cm`;
              const { error: authErr } = await supabase.auth.updateUser({ email: newAuthEmail });
              if (authErr) {
                // Non bloquant : certains projets exigent une confirmation par email
                console.warn('Mise à jour email auth (non bloquant):', authErr.message);
              }
            }
          } catch (authCheckErr) {
            console.warn('Vérification email auth (non bloquant):', authCheckErr);
          }
        }

        // 2. Met à jour le profil
        const { data, error } = await supabase
          .from('profiles')
          .update({
            display_name: displayName.trim(),
            phone: normalizedPhone,
            email: email.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id)
          .select();

        if (error) {
          setInfoMsg({ type: 'err', text: `Échec de la mise à jour : ${error.message}` });
          return;
        }

        // 0 ligne modifiée = RLS a bloqué : session réelle requise
        if (!data || data.length === 0) {
          setInfoMsg({
            type: 'err',
            text: 'Session expirée ou non authentifiée. Veuillez vous déconnecter puis vous reconnecter, puis réessayez.'
          });
          return;
        }

        const updated = data[0] as Profile;
        onProfileUpdated(updated);
        localStorage.setItem('docfinder_active_session', JSON.stringify(updated));
        setInfoMsg({ type: 'ok', text: 'Informations mises à jour avec succès.' });
        showToast('Profil mis à jour ✅');
      } else {
        // Mode démo local
        const updated: Profile = {
          ...profile,
          display_name: displayName.trim(),
          phone: normalizedPhone,
          email: email.trim() || null,
          updated_at: new Date().toISOString()
        };
        onProfileUpdated(updated);
        localStorage.setItem('docfinder_active_session', JSON.stringify(updated));
        setInfoMsg({ type: 'ok', text: 'Informations mises à jour (mode local).' });
        showToast('Profil mis à jour ✅');
      }
    } catch (err) {
      setInfoMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur inattendue lors de la mise à jour.'
      });
    } finally {
      setSavingInfo(false);
    }
  };

  const handleChangePassword = async () => {
    setPwdMsg(null);

    if (newPassword.length < 6) {
      setPwdMsg({ type: 'err', text: 'Le mot de passe doit contenir au moins 6 caractères.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'err', text: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }

    setSavingPwd(true);
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
          setPwdMsg({ type: 'err', text: error.message });
          return;
        }
        setPwdMsg({ type: 'ok', text: 'Mot de passe modifié avec succès.' });
        showToast('Mot de passe mis à jour 🔐');
      } else {
        setPwdMsg({ type: 'err', text: 'Le changement de mot de passe nécessite la connexion Supabase.' });
        return;
      }
    } catch (err) {
      setPwdMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur inattendue.'
      });
    } finally {
      setSavingPwd(false);
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <div className="profile-page">
      {/* Carte identité */}
      <div className="profile-card">
        <div className="profile-avatar-row">
          <div className="profile-avatar-lg">
            {profile.display_name?.charAt(0)?.toUpperCase() || 'C'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
              {profile.display_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span className="badge-match-forte">
                <ShieldCheck size={12} />
                {profile.role === 'moderator' || profile.role === 'admin' ? 'Modérateur DPO' : 'Citoyen vérifié'}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--slate-500)' }}>
                {profile.created_at
                  ? `Membre depuis ${new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
                  : 'Citoyen DocFinder'}
              </span>
            </div>
          </div>
        </div>

        <div className="profile-card-title">
          <User size={16} />
          Mes informations
        </div>

        <div className="profile-form-grid">
          <div className="form-group span-2">
            <label className="form-label">Nom et Prénom</label>
            <input
              type="text"
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre nom complet"
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone size={13} />
              Téléphone (identifiant) — +237
            </label>
            <input
              type="tel"
              className="form-input"
              inputMode="numeric"
              maxLength={12}
              value={phone}
              onChange={(e) => {
                // Affichage harmonisé : 9 chiffres max, format 4-2-2-2
                const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                setPhone([
                  digits.slice(0, 4),
                  digits.slice(4, 6),
                  digits.slice(6, 8),
                  digits.slice(8, 9)
                ].filter(Boolean).join(' '));
              }}
              placeholder="6XX XX XX XX"
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail size={13} />
              Email (optionnel)
            </label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre.email@exemple.com"
            />
          </div>
        </div>

        {infoMsg && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: infoMsg.type === 'ok' ? 'var(--primary-50)' : 'var(--red-50)',
            border: `1px solid ${infoMsg.type === 'ok' ? 'var(--primary-100)' : 'var(--red-100)'}`,
            color: infoMsg.type === 'ok' ? 'var(--primary-800)' : 'var(--red-700)'
          }}>
            {infoMsg.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{infoMsg.text}</span>
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="profile-save-btn"
            onClick={handleSaveInfo}
            disabled={savingInfo || !infoDirty}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            {savingInfo ? <Loader2 size={15} className="animate-pulse-slow" /> : <Save size={15} />}
            {savingInfo ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
          {!infoDirty && (
            <span style={{ fontSize: '0.74rem', color: 'var(--slate-400)' }}>
              Aucune modification à enregistrer
            </span>
          )}
        </div>

        <p style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '12px', lineHeight: 1.5 }}>
          ⚠️ Si vous changez votre numéro de téléphone, celui-ci devient votre nouvel identifiant
          de connexion à partir de votre prochaine session.
        </p>
      </div>

      {/* Carte notifications push */}
      <div className="profile-card">
        <div className="profile-card-title">
          <Bell size={16} />
          Notifications — Alertes de correspondance
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--slate-600)', lineHeight: 1.55, margin: '0 0 12px' }}>
          Recevez une alerte sur cet appareil dès qu'un <strong>document trouvé</strong>{' '}
          correspond à l'une de vos déclarations de perte — sans avoir à surveiller l'application.
        </p>

        {!pushSupported ? (
          <p style={{ fontSize: '0.78rem', color: 'var(--slate-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <BellOff size={14} /> Non supporté par ce navigateur (installez l'app pour y accéder).
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!pushGranted ? (
              <button
                className="profile-save-btn"
                onClick={async () => {
                  setPushBusy(true);
                  const r = await pushService.enable(profile.id);
                  setPushGranted(pushService.permission() === 'granted');
                  setPushBusy(false);
                  showToast(r.message);
                }}
                disabled={pushBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {pushBusy ? <Loader2 size={15} className="animate-pulse-slow" /> : <Bell size={15} />}
                {pushBusy ? 'Activation...' : 'Activer les notifications'}
              </button>
            ) : (
              <>
                <button
                  className="profile-save-btn"
                  onClick={async () => {
                    setPushBusy(true);
                    const r = await pushService.sendTest();
                    setPushBusy(false);
                    showToast(r.message);
                  }}
                  disabled={pushBusy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  {pushBusy ? <Loader2 size={15} className="animate-pulse-slow" /> : <Bell size={15} />}
                  {pushBusy ? 'Envoi...' : 'Tester la notification'}
                </button>
                <button
                  onClick={async () => {
                    setPushBusy(true);
                    const r = await pushService.disable(profile.id);
                    setPushGranted(pushService.permission() === 'granted' && false);
                    setPushBusy(false);
                    showToast(r.message);
                  }}
                  disabled={pushBusy}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: 'none', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)', padding: '10px 14px',
                    fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate-600)', cursor: 'pointer'
                  }}
                >
                  <BellOff size={15} /> Désactiver
                </button>
              </>
            )}
          </div>
        )}

        <p style={{ fontSize: '0.7rem', color: 'var(--slate-500)', marginTop: '10px', lineHeight: 1.5 }}>
          Un seul abonnement par appareil — vous pouvez le retirer à tout moment.
          Aucune donnée personnelle n'est incluse dans les notifications.
        </p>
      </div>

      {/* Carte sécurité */}
      <div className="profile-card">
        <div className="profile-card-title">
          <KeyRound size={16} />
          Sécurité — Changer mon mot de passe
        </div>

        <div className="profile-form-grid">
          <div className="form-group">
            <label className="form-label">Nouveau mot de passe</label>
            <input
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="•••••••• (min. 6 caractères)"
              minLength={6}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirmer le mot de passe</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
            />
          </div>
        </div>

        {pwdMsg && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: pwdMsg.type === 'ok' ? 'var(--primary-50)' : 'var(--red-50)',
            border: `1px solid ${pwdMsg.type === 'ok' ? 'var(--primary-100)' : 'var(--red-100)'}`,
            color: pwdMsg.type === 'ok' ? 'var(--primary-800)' : 'var(--red-700)'
          }}>
            {pwdMsg.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{pwdMsg.text}</span>
          </div>
        )}

        <div style={{ marginTop: '16px' }}>
          <button
            className="profile-save-btn"
            onClick={handleChangePassword}
            disabled={savingPwd || !newPassword || !confirmPassword}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--slate-800)' }}
          >
            {savingPwd ? <Loader2 size={15} className="animate-pulse-slow" /> : <KeyRound size={15} />}
            {savingPwd ? 'Modification...' : 'Changer le mot de passe'}
          </button>
        </div>
      </div>
    </div>
  );
};
