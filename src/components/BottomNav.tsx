import React from 'react';
import { Home, Search, PlusCircle, FolderCheck, ShieldAlert, LogIn } from 'lucide-react';
import type { Profile } from '../types';

interface BottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isAuthenticated: boolean;
  profile: Profile | null;
  onOpenAuth: (mode: 'login') => void;
  onOpenFoundModal: () => void;
  onOpenLostModal: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  setCurrentTab,
  isAuthenticated,
  profile,
  onOpenAuth,
  onOpenFoundModal,
  onOpenLostModal
}) => {
  const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator';

  return (
    <nav className="bottom-nav">
      {/* VISITEUR */}
      {!isAuthenticated && (
        <>
          <button
            className={`bottom-nav-item ${currentTab === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentTab('home')}
          >
            <Home size={20} />
            <span>Accueil</span>
          </button>

          <button
            className={`bottom-nav-item ${currentTab === 'search' ? 'active' : ''}`}
            onClick={() => setCurrentTab('search')}
          >
            <Search size={20} />
            <span>Rechercher</span>
          </button>

          <button
            className="bottom-nav-item"
            onClick={() => onOpenAuth('login')}
            style={{ color: 'var(--primary-700)' }}
          >
            <LogIn size={20} />
            <span style={{ fontWeight: 700 }}>Connexion</span>
          </button>
        </>
      )}

      {/* CITOYEN CONNECTÉ — Accès aux deux actions (Trouveur & Chercheur = même personne) */}
      {isAuthenticated && !isAdmin && (
        <>
          <button
            className={`bottom-nav-item ${currentTab === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentTab('home')}
          >
            <Home size={20} />
            <span>Accueil</span>
          </button>

          <button
            className={`bottom-nav-item ${currentTab === 'search' ? 'active' : ''}`}
            onClick={() => setCurrentTab('search')}
          >
            <Search size={20} />
            <span>Catalogue</span>
          </button>

          {/* Bouton central flottant — double action */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <div style={{ display: 'flex', gap: '4px', marginTop: '-14px' }}>
              {/* Document trouvé */}
              <button
                onClick={onOpenFoundModal}
                title="Signaler un document trouvé"
                style={{
                  background: 'var(--primary-700)',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(13, 92, 58, 0.4)',
                  cursor: 'pointer'
                }}
              >
                <PlusCircle size={18} />
              </button>
              {/* Déclarer perte */}
              <button
                onClick={onOpenLostModal}
                title="Déclarer une perte"
                style={{
                  background: 'var(--gold-600)',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(217, 119, 6, 0.4)',
                  cursor: 'pointer'
                }}
              >
                <PlusCircle size={18} />
              </button>
            </div>
            <span style={{ fontSize: '0.6rem', color: 'var(--slate-500)', fontWeight: 700, letterSpacing: '0.3px' }}>
              Signaler / Perte
            </span>
          </div>

          <button
            className={`bottom-nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentTab('dashboard')}
          >
            <FolderCheck size={20} />
            <span>Mes Dossiers</span>
          </button>
        </>
      )}

      {/* ADMIN / MODÉRATEUR */}
      {isAuthenticated && isAdmin && (
        <>
          <button
            className={`bottom-nav-item ${currentTab === 'admin' ? 'active' : ''}`}
            onClick={() => setCurrentTab('admin')}
          >
            <ShieldAlert size={20} />
            <span>Modération</span>
          </button>

          <button
            className={`bottom-nav-item ${currentTab === 'search' ? 'active' : ''}`}
            onClick={() => setCurrentTab('search')}
          >
            <Search size={20} />
            <span>Documents</span>
          </button>

          <button
            className={`bottom-nav-item ${currentTab === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentTab('home')}
          >
            <Home size={20} />
            <span>Accueil</span>
          </button>
        </>
      )}
    </nav>
  );
};
