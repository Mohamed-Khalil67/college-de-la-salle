import { DEFAULT_LANG, type Lang } from './lang';

/**
 * The public pages and their address. The site is French only (docs/i18n.md): the addresses are the site's historic
 * French ones. The route data carries the page id, so the head service and the spec can find each page.
 */

export const PUBLIC_PAGES = ['home', 'history', 'nationale', 'bac', 'contact', 'accessibility', 'login'] as const;
export type PublicPageId = (typeof PUBLIC_PAGES)[number];

/** Pages prerendered at build time (the login page depends on the session: client-rendered). */
export const PRERENDERED_PAGES: readonly PublicPageId[] = PUBLIC_PAGES.filter((p) => p !== 'login');

const PATHS: Readonly<Record<Lang, Readonly<Record<PublicPageId, string>>>> = {
  fr: {
    home: '',
    history: 'histoire',
    nationale: 'bac-nationale',
    bac: 'bac-francais',
    contact: 'contact',
    accessibility: 'accessibilite',
    login: 'connexion',
  },
};

/** The route path of a page, without the leading slash ('' for the home page). */
export function routePath(lang: Lang, page: PublicPageId): string {
  return PATHS[lang][page];
}

/** The link to a page: '/', '/histoire', '/bac-nationale'. */
export function pageUrl(lang: Lang, page: PublicPageId): string {
  return '/' + routePath(lang, page);
}

/** The canonical address of a page (the French site, no alternates). */
export function canonicalPageUrl(page: PublicPageId): string {
  return pageUrl(DEFAULT_LANG, page);
}
