import React, { useState } from 'react';
import { Cookie } from 'lucide-react';
import { getCookieConsent } from '../lib/cookieConsent';

interface CookieConsentProps {
  onOpenCookiesPolicy: () => void;
}

export const CookieConsent: React.FC<CookieConsentProps> = ({ onOpenCookiesPolicy }) => {
  const [visible, setVisible] = useState<boolean>(() => getCookieConsent() === null);

  if (!visible) return null;

  const record = (choice: 'accepted' | 'refused') => {
    try {
      localStorage.setItem('df_cookie_consent', choice);
    } catch {
      // localStorage indisponible : on masque simplement pour cette session
    }
    setVisible(false);
  };

  return (
    <div className="cookie-banner" role="dialog" aria-label="Consentement cookies">
      <div className="cookie-banner-text">
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Cookie size={14} /> Cookies & confidentialité
        </strong>
        <br />
        Nous utilisons uniquement des cookies <strong>strictement nécessaires</strong> (session de
        connexion, sécurité, votre choix ici) — jamais de publicité ni de traceur tiers.{' '}
        <button type="button" onClick={onOpenCookiesPolicy}>
          En savoir plus
        </button>
      </div>
      <div className="cookie-actions">
        <button className="cookie-btn cookie-btn-refuse" onClick={() => record('refused')}>
          Continuer sans
        </button>
        <button className="cookie-btn cookie-btn-accept" onClick={() => record('accepted')}>
          Accepter
        </button>
      </div>
    </div>
  );
};
