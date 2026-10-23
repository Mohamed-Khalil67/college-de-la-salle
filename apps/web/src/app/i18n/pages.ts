import { DEFAULT_LANG, type Lang, LANGS } from './lang';

/**
 * The public pages and their address in each language. French keeps the site's historic addresses; English
 * and Arabic use the same Latin slugs under their prefix (readable, and stable when the wording changes).
 * The language switcher and the hreflang links go from one language to another through the page id.
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
  en: {
    home: 'en',
    history: 'en/history',
    nationale: 'en/egyptian-bac',
    bac: 'en/french-bac',
    contact: 'en/contact',
    accessibility: 'en/accessibility',
    login: 'en/login',
  },
  ar: {
    home: 'ar',
    history: 'ar/history',
    nationale: 'ar/egyptian-bac',
    bac: 'ar/french-bac',
    contact: 'ar/contact',
    accessibility: 'ar/accessibility',
    login: 'ar/login',
  },
};

/** The route path of a page, without the leading slash ('' for the French home page). */
export function routePath(lang: Lang, page: PublicPageId): string {
  return PATHS[lang][page];
}

/** The page path relative to its language's prefix, for the child routes ('history', '' for home). */
export function childPath(lang: Lang, page: PublicPageId): string {
  const full = PATHS[lang][page];
  return lang === DEFAULT_LANG ? full : full.slice(lang.length).replace(/^\//, '');
}

/** The link to a page: '/', '/histoire', '/en', '/ar/history'. */
export function pageUrl(lang: Lang, page: PublicPageId): string {
  return '/' + routePath(lang, page);
}

/** Every page in every language, for the hreflang links and the prerender list. */
export function alternates(page: PublicPageId): readonly { readonly lang: Lang; readonly url: string }[] {
  return LANGS.map((lang) => ({ lang, url: pageUrl(lang, page) }));
}
