import React, { useEffect, useState } from 'react';
import { Download, Share, Plus, X, Smartphone } from 'lucide-react';

const DISMISS_KEY = 'df_install_dismissed';
const DISMISS_DAYS = 7; // re-proposer après 7 jours si refusé

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function wasRecentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

/**
 * Bandeau d'installation PWA :
 *  - Chrome/Android : bouton natif via l'événement beforeinstallprompt
 *  - iOS Safari : guide manuel « Partager → Sur l'écran d'accueil »
 *  - Masqué si l'app tourne déjà en standalone ou dismissé récemment
 */
export const InstallPrompt: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // déjà installée → jamais de bannière

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!wasRecentlyDismissed()) setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // iOS Safari ne déclenche pas beforeinstallprompt → guide manuel
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
    if (isIOS && !wasRecentlyDismissed()) {
      const t = setTimeout(() => setShowIOS(true), 2500);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBip);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const dismiss = () => {
    setLeaving(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage indisponible */
    }
    setTimeout(() => {
      setVisible(false);
      setShowIOS(false);
    }, 250);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferred(null);
  };

  if (!visible && !showIOS) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: `calc(16px + env(safe-area-inset-bottom))`,
        zIndex: 55,
        maxWidth: 480,
        margin: '0 auto',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 0.25s'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'linear-gradient(135deg, #0d5c3a, #0a3f28)',
          color: '#ffffff',
          borderRadius: 16,
          padding: '12px 14px',
          boxShadow: '0 18px 40px -12px rgba(10, 63, 40, 0.55)'
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <Smartphone size={22} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>
            Installer DocFinder sur votre appareil
          </div>
          <div style={{ fontSize: '0.74rem', opacity: 0.85, lineHeight: 1.35, marginTop: 2 }}>
            Accès rapide depuis votre écran d'accueil, même hors connexion.
          </div>
          {showIOS && (
            <div style={{ fontSize: '0.72rem', opacity: 0.95, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              Sur iPhone : <Share size={12} /> Partager puis <Plus size={12} /> « Sur l'écran d'accueil »
            </div>
          )}
        </div>

        {deferred ? (
          <button
            onClick={install}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#ffffff',
              color: '#0d5c3a',
              border: 'none',
              borderRadius: 10,
              padding: '9px 14px',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <Download size={15} /> Installer
          </button>
        ) : (
          !showIOS && (
            <button
              onClick={dismiss}
              style={{
                background: 'rgba(255,255,255,0.14)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '8px 12px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              Plus tard
            </button>
          )
        )}

        <button
          onClick={dismiss}
          aria-label="Fermer"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            padding: 4,
            flexShrink: 0
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
