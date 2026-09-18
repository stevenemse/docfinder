import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── PWA ──────────────────────────────────────────────────────────────────────
// Le service worker n'est enregistré qu'en production (le dev Vite gère déjà
// le HMR ; un SW en dev cacherait les changements et rendrait le debugging
// chaotique). L'app reste 100 % fonctionnelle si l'enregistrement échoue.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* hors-ligne indisponible : l'app continue de fonctionner normalement */
    });
  });
}
