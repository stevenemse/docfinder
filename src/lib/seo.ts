/**
 * seo.ts — Gestion des balises d'indexation pour la SPA.
 *
 * DocFinder est une application monopage : le crawlers ne voient que le HTML
 * initial. Ce module met à jour title, description, canonical et Open Graph
 * à chaque changement de vue, et passe les vues privées en noindex.
 */

export const SITE_URL = 'https://docfinder-cm.vercel.app';

export const DEFAULT_TITLE =
  'DocFinder Cameroun — Retrouvez vos documents perdus en toute sécurité';
export const DEFAULT_DESCRIPTION =
  'DocFinder Cameroun : plateforme sécurisée pour retrouver vos pièces officielles égarées (CNI, passeport, permis) sans compromettre vos données personnelles.';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export interface SeoData {
  title: string;
  description: string;
  /** Vue privée (espace citoyen, admin, pages légales) : exclure de l'index. */
  noindex?: boolean;
}

export function setSeo(data: SeoData): void {
  const url = `${SITE_URL}/`;
  document.title = data.title;
  upsertMeta('name', 'description', data.description);
  upsertMeta('name', 'robots', data.noindex ? 'noindex, nofollow' : 'index, follow');
  upsertLink('canonical', url);
  upsertMeta('property', 'og:title', data.title);
  upsertMeta('property', 'og:description', data.description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('name', 'twitter:title', data.title);
  upsertMeta('name', 'twitter:description', data.description);
}
