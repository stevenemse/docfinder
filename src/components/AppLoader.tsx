import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * Écran de chargement de l'application.
 * Sur une connexion faible (edge, 3G), Supabase met plusieurs secondes à
 * répondre : sans repère visuel, l'utilisateur croit à une page cassée et
 * recharge. Le message s'adapte à l'attente et à l'état du réseau.
 */
export const AppLoader: React.FC = () => {
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4000);
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div className="app-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="app-loader-mark">
        <ShieldCheck size={30} />
        <span className="app-loader-ring" aria-hidden="true" />
      </div>
      <div className="app-loader-brand">DocFinder</div>
      <div className="app-loader-bar" aria-hidden="true">
        <span />
      </div>
      <p className="app-loader-text">
        {offline
          ? 'Hors connexion — on charge vos dossiers en cache…'
          : slow
            ? 'Connexion lente… vos dossiers arrivent.'
            : 'Chargement de vos dossiers sécurisés…'}
      </p>
      {slow && !offline && (
        <p className="app-loader-hint">
          Réseau faible : cela peut prendre quelques secondes, inutile de recharger la page.
        </p>
      )}
    </div>
  );
};
