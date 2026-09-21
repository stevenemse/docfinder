---
name: ui-motion
description: Principes d'animation UI d'Emil Kowalski appliqués à DocFinder — quand animer, durées, easings, interdits, reduced-motion. À charger pour tout travail d'animation ou de transition d'interface.
metadata:
  category: frontend
  framework: react
---

# UI Motion — Principes Emil Kowalski pour DocFinder

L'animation sert la compréhension, jamais la décoration. Si on ne sait pas
POURQUOI on anime, on n'anime pas.

## Quand animer (les seuls cas légitimes)

1. **Entrée/sortie** d'un élément superposé : modales, toasts, popovers —
   l'animation explique d'où vient l'élément et où il va.
2. **Feedback d'action** : bouton pressé (scale 0.97), état de chargement.
3. **Changement d'état visible** : accordéon, onglet actif, progression.
4. **Orientation spatiale** : un panneau qui glisse depuis son bord (drawer mobile).

Tout le reste (heroes, sections au scroll, boucles décoratives) : ne pas animer,
sauf reveal discret demandé explicitement (voir useReveal existant).

## Durées (jamais improvisées)

| Type | Durée |
|---|---|
| Micro (hover, press) | 120–150 ms |
| Standard (toast, dropdown) | 200 ms |
| Modale, drawer | 250 ms |
| Grand surface (page) | 300 ms max |

## Easings

- **Entrée d'élément** : `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out quint) —
  départ rapide, arrivée douce. Déjà la convention du projet.
- **Sortie** : `ease-in` ou `cubic-bezier(0.4, 0, 1, 1)` — plus courte que l'entrée.
- **Jamais** `ease-in-out` par défaut, jamais `bounce`/`elastic` (sauf confettis).

## Animer uniquement transform et opacity

Ces deux propriétés sont compositedes par le GPU : 60 fps garantis.
Animer `width`, `height`, `top`, `left`, `margin`, `box-shadow` ou `filter`
provoque un layout/reflow à chaque frame — interdit.
(Exemple existant correct : barres du graphique admin animent `height` une seule
fois au montage — acceptable car ponctuel et mesuré.)

## Accessibilité non négociable

Toute nouvelle animation DOIT être neutralisée si l'utilisateur préfère
moins de mouvement :

```css
@media (prefers-reduced-motion: reduce) {
  .ma-classe { transition: none; animation: none; }
}
```

Vérifier que le bloc global `prefers-reduced-motion` de `src/index.css`
couvre les nouvelles classes (il coupe déjà `.reveal`, `.admin-bar`,
`.admin-dist-fill`).

## Convention modale DocFinder (à conserver)

Les modales utilisent les classes CSS `modal-overlay` / `modal-card` avec
animation d'entrée (opacity + scale). Toute nouvelle modale doit réutiliser
ces classes, pas recréer des keyframes. Si une animation sortante est
nécessaire (fermeture), elle dure max 150 ms et ne bloque pas le clic.

## Checklist avant de pousser une animation

1. Pourquoi cette animation ? (répondre en une phrase, sinon supprimer)
2. transform/opacity uniquement ? sinon refaire
3. Durée dans les fourchettes du tableau ?
4. prefers-reduced-motion couvert ?
5. Aucune animation au scroll qui retarde la lecture du contenu ?
6. Test mobile (les animations lourdes se voient plus sur téléphones modestes)
