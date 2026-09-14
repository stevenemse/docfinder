# 🚀 DocFinder Cameroun — Guide de mise en production

## Étape 1 — Base de données Supabase (5 min)

1. Créez un projet sur [supabase.com](https://supabase.com) (attente ~2 min).
2. **SQL Editor** → New query → collez tout le contenu de `supabase/schema.sql` → **Run**.
   ✅ Le script est idempotent : il crée 10 tables, les politiques RLS, les RPC de
   sécurité (hachage SHA-256, matching serveur, déblocage payant), les buckets
   Storage (`masked` public, `vault` privé) et le seed des 6 types de documents.
3. **Authentication → URL Configuration** :
   - Site URL : `https://votre-projet.vercel.app` (à ajuster après l'étape 3)
   - Redirect URLs : ajouter `http://localhost:5173` (dev)
4. **Authentication → Providers → Email** : désactiver **Confirm email**
   (l'inscription téléphone-first crée un email synthétique `<tel>@phone.docfinder.cm`).

## Étape 2 — Brancher l'application en local

1. **Project Settings → API** : copier *Project URL* et *anon public key*.
2. Créer `.env.local` à la racine :

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

3. `npm run dev` → le pied de page affiche « Connecté à la base de données
   PostgreSQL Supabase ». ⚠️ Ne jamais utiliser la clé `service_role` côté frontend.

## Étape 3 — GitHub (via le site web, sans CLI)

1. Créer un repo **vide** (sans README) sur [github.com/new](https://github.com/new),
   ex. `docfinder-cameroun`, visibilité au choix (privé recommandé).
2. Dans un terminal à la racine du projet :

   ```bash
   git remote add origin https://github.com/VOTRE-COMPTE/docfinder-cameroun.git
   git branch -M main
   git push -u origin main
   ```

   (GitHub demandera une connexion navigateur ou un Personal Access Token.)

## Étape 4 — Vercel (via le dashboard)

1. [vercel.com](https://vercel.com) → Sign in with GitHub.
2. **Add New… → Project** → Import le repo `docfinder-cameroun`.
3. Vercel détecte Vite automatiquement (build `npm run build`, output `dist`).
4. **Environment Variables** — ajouter les DEUX variables (Production + Preview) :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy** → URL HTTPS finale (ex. `https://docfinder-cameroun.vercel.app`).
6. Mettre à jour le **Site URL** Supabase (étape 1.3) avec cette URL.

## Étape 5 — Vérifications post-déploiement

- [ ] Inscription d'un compte test depuis le site déployé (notification email OFF)
- [ ] Déclaration de perte + signalement trouvé → correspondance visible
- [ ] Preuve de propriété correcte → validation instantanée (hash serveur)
- [ ] Paiement simulé → contact trouveur débloqué dans le Dashboard
- [ ] Promouvoir le premier modérateur :

  ```sql
  UPDATE public.profiles SET role = 'moderator' WHERE phone = '+2376XXXXXXXX';
  ```

## Phase suivante (paiements réels)

Edge Functions + webhook MTN MoMo / Orange Money (clés secrètes côté serveur
uniquement), puis supprimer la politique INSERT de `payments` (écriture
service_role seulement). Voir notes en bas de `supabase/schema.sql`.
