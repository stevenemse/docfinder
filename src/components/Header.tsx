import React from 'react';
import { 
  ShieldCheck, 
  Search, 
  PlusCircle, 
  FolderCheck, 
  ShieldAlert, 
  LogOut, 
  LogIn, 
  UserPlus
} from 'lucide-react';
import type { Profile } from '../types';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  profile: Profile | null;
  isAuthenticated: boolean;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onLogout: () => void;
  onOpenFoundModal: () => void;
  onOpenLostModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  profile,
  isAuthenticated,
  onOpenAuth,
  onLogout,
  onOpenFoundModal,
  onOpenLostModal
}) => {
  const role = profile?.role;
  const isAdmin = role === 'admin' || role === 'moderator';

  return (
    <header className="header-glass">
      <div className="header-content">
        {/* Brand */}
        <div className="brand-wrapper" onClick={() => setCurrentTab('home')}>
          <div className="brand-icon">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="brand-title">
              DocFinder
              <span className="cameroon-flag-tag">CAMEROUN</span>
            </div>
            <div className="brand-tagline">
              Plateforme Nationale Sécurisée
            </div>
          </div>
        </div>

        {/* Desktop Navigation — Dynamique selon le statut */}
        <nav className="desktop-nav">
          {/* VISITEUR */}
          {!isAuthenticated && (
            <>
              <button
                className={`desktop-nav-btn ${currentTab === 'home' ? 'active' : ''}`}
                onClick={() => setCurrentTab('home')}
              >
                Accueil
              </button>
              <button
                className={`desktop-nav-btn ${currentTab === 'search' ? 'active' : ''}`}
                onClick={() => setCurrentTab('search')}
              >
                <Search size={15} />
                Recherche
              </button>
            </>
          )}

          {/* CITOYEN CONNECTÉ (Chercheur & Trouveur — même compte) */}
          {isAuthenticated && !isAdmin && (
            <>
              <button
                className={`desktop-nav-btn ${currentTab === 'home' ? 'active' : ''}`}
                onClick={() => setCurrentTab('home')}
              >
                Accueil
              </button>
              <button
                className={`desktop-nav-btn ${currentTab === 'search' ? 'active' : ''}`}
                onClick={() => setCurrentTab('search')}
              >
                <Search size={15} />
                Catalogue
              </button>
              <button
                className={`desktop-nav-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setCurrentTab('dashboard')}
              >
                <FolderCheck size={15} />
                Mes Dossiers
              </button>

              {/* Action rapide : Signaler un document trouvé */}
              <button
                className="desktop-cta"
                onClick={onOpenFoundModal}
                style={{
                  backgroundColor: 'var(--primary-700)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '7px 13px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <PlusCircle size={15} />
                Document Trouvé
              </button>

              {/* Action rapide : Déclarer une perte */}
              <button
                className="desktop-cta"
                onClick={onOpenLostModal}
                style={{
                  backgroundColor: 'var(--gold-600)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '7px 13px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <PlusCircle size={15} />
                Déclarer une Perte
              </button>
            </>
          )}

          {/* ADMIN / MODÉRATEUR */}
          {isAuthenticated && isAdmin && (
            <>
              <button
                className={`desktop-nav-btn ${currentTab === 'admin' ? 'active' : ''}`}
                onClick={() => setCurrentTab('admin')}
              >
                <ShieldAlert size={15} />
                Console de Modération
              </button>
              <button
                className={`desktop-nav-btn ${currentTab === 'search' ? 'active' : ''}`}
                onClick={() => setCurrentTab('search')}
              >
                <Search size={15} />
                Documents Publiés
              </button>
              <button
                className={`desktop-nav-btn ${currentTab === 'home' ? 'active' : ''}`}
                onClick={() => setCurrentTab('home')}
              >
                Accueil
              </button>
            </>
          )}
        </nav>

        {/* Bloc droit : Auth ou Profil */}
        <div className="header-auth-mobile" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn-login"
                onClick={() => onOpenAuth('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--slate-700)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <LogIn size={15} />
                <span className="btn-label">Connexion</span>
              </button>

              <button
                className="btn-signup"
                onClick={() => onOpenAuth('register')}
                style={{
                  backgroundColor: 'var(--primary-700)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <UserPlus size={15} />
                <span className="btn-label">S'inscrire</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Pill Profil */}
              <div className="profile-pill" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--slate-50)',
                padding: '4px 10px 4px 6px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: isAdmin ? 'var(--red-100)' : 'var(--primary-100)',
                  color: isAdmin ? 'var(--red-700)' : 'var(--primary-800)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.78rem'
                }}>
                  {profile?.display_name?.charAt(0) || 'C'}
                </div>

                <div className="profile-pill-text" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--slate-800)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                    {profile?.display_name}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--slate-500)', fontWeight: 600 }}>
                    {isAdmin ? 'Modérateur DPO' : 'Citoyen · DocFinder'}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Se déconnecter"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--slate-400)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
