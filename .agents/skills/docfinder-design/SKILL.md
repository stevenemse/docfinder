---
name: docfinder-design
description: Design system et conventions UI/UX de DocFinder Cameroun — variables CSS, tons, patterns de modales/formulaires, règles responsive établies. À charger pour toute modification de style, composant ou mise en page.
metadata:
  category: frontend
  framework: react
---

# Design System DocFinder Cameroun

Application React 19 + Vite + CSS pur (pas de Tailwind) dans `src/index.css`.
Production réelle : https://docfinder-cm.vercel.app — les utilisateurs sont des
citoyens camerounais, beaucoup sur téléphones modestes. Performance et
lisibilité priment.

## Identité

- **Tons** : vert institutionnel (confiance, État) + or/ambre (dynamisme).
- **Police** : Inter (déjà en place — ne pas changer).
- **Ton global** : institutionnel mais chaleureux, jamais gadget.

## Variables CSS (source de vérité — toujours utiliser les vars)

```css
/* Primaire */ --primary-900 → --primary-50 (vert : #052e16 → #f0fdf4)
/* Accent  */ --gold-700 → --gold-50 (or : #92400e → #fffbeb)
/* Alerte  */ --red-700, --red-600, --red-100, --red-50
/* Info    */ --blue-600, --blue-100
/* Neutre  */ --slate-900 → --slate-400
/* Surfaces: --surface-card, --border-color */
```

Il n'existe PAS : `--primary-200`, `--gold-300`, `--gold-200`.
Ne jamais inventer une variable — vérifier dans `:root` (haut de index.css).

## Patterns établis (réutiliser, ne pas recréer)

- **Modales** : classes `modal-overlay` / `modal-body` — entrée 250 ms
  opacity+scale, champs min 44px, police 16px (anti-zoom iOS).
- **Téléphone** : préfixe `+237 🇨🇲` collé au champ, classe dédiée, utilisateur
  ne saisit que 9 chiffres.
- **KPIs admin** : `.admin-kpi` avec `tone-` (gold/warn), pastille
  `.admin-kpi-icon`, liseré `::before` dégradé. Grille 2 col mobile / 3 col ≥640px.
- **Modale à étapes** : pastilles numérotées (style checkout) — pattern des
  modales ReportLost/Found et Paiement.
- **Champs à icônes** : icône lucide dans le champ, label au-dessus.
- **Onglets** : `.dashboard-tabs` scroll horizontal tactile (min-height 44px).

## Règles responsive dures (acquises à prix de débogage)

1. `min-width: 0` sur tout enfant flex dont le contenu est textuel — sinon
   débordement (leçon du graphe admin : 14 labels de dates).
2. Étiquettes de graphique mobile : alléger (nth-child) plutôt que réduire la
   police. Info-bulle = donnée complète.
3. `-webkit-line-clamp` pour labels multi-lignes, jamais `nowrap` tronqué sur
   les libellés métier.
4. Grilles : colonnes fixes par breakpoint (`repeat(2, …)` / `repeat(3, …)`),
   `auto-fit` interdit (crée des rangées orphelines inégales — leçon KPIs).
5. Section `prefers-reduced-motion` : toute nouvelle animation y est ajoutée.
6. Touch targets ≥ 44px sur tout élément cliquable mobile.

## SEO & PWA (ne pas régresser)

- Chaque vue publique a titre + meta description via `src/lib/seo.ts`
  (`setSeo`) ; vues privées passent en `noindex`.
- L'app est installable (PWA) : manifest + service worker `public/sw.js` —
  toute nouvelle route/asset doit rester servable offline ou être exclu du cache.
- Image OG : régénérée par `node scripts/generate-og-image.mjs` si modif.

## Contact & légal (valeurs officielles)

- Email : docfinder@gmail.com — Tél : +237 686 03 37 89 — Yaoundé, Cameroun
- Confidentialité reste au FOOTER, jamais dans la navbar.
- Éléments démo interdits : l'app est en production.

## Processus de modification UI

1. Modifier, puis `npx tsc -b` (vert obligatoire)
2. Vérifier visuellement dans le preview (mobile 406px + desktop)
3. Commiter avec message descriptif du POURQUOI, pusher (déploiement Vercel auto)
