import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Bandeau d'état réseau :
 *  - « Vous êtes hors connexion » (persistant, avec explication des données
 *    en cache) dès que `online` passe à false
 *  - bref « Connexion rétablie » (4 s) au retour du réseau
 */
export const OfflineBanner: React.FC = () => {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      setReconnected(true);
      setTimeout(() => setReconnected(false), 4000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !reconnected) return null;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 14px',
        fontSize: '0.8rem',
        fontWeight: 700,
        color: '#ffffff',
        background: online
          ? 'linear-gradient(90deg, #003734, #00231F)'
          : 'linear-gradient(90deg, #7A5510, #7a5510)',
        animation: 'slideDown 0.25s ease'
      }}
    >
      {online ? (
        <>
          <Wifi size={15} /> Connexion rétablie — données à jour
        </>
      ) : (
        <>
          <WifiOff size={15} />
          Vous êtes hors connexion — vos dossiers déjà consultés restent accessibles.
          Les actions (déclarer, réclamer) nécessitent le réseau.
        </>
      )}
    </div>
  );
};
