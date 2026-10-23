/**
 * The public site's languages. French is the source and the default (no prefix in the URL); English and
 * Arabic live under /en and /ar. The spaces (élève, enseignant, administration) stay in French.
 * Pure data, no Angular: read by the routes, the head service and the unit tests.
 */

export const LANGS = ['fr', 'en', 'ar'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'fr';

export interface LangMeta {
  /** The language's own name, shown in the switcher (with `lang` set to the language). */
  readonly endonym: string;
  readonly dir: 'ltr' | 'rtl';
  /** For og:locale. */
  readonly ogLocale: string;
  /** Appended to every page title, and the home page's whole title. */
  readonly siteTitle: string;
  readonly homeTitle: string;
}

export const LANG_META: Readonly<Record<Lang, LangMeta>> = {
  fr: {
    endonym: 'Français',
    dir: 'ltr',
    ogLocale: 'fr_FR',
    siteTitle: 'Collège de la Salle — Daher',
    homeTitle: 'Collège de la Salle — Daher · Bac nationale et Bac français',
  },
  en: {
    endonym: 'English',
    dir: 'ltr',
    ogLocale: 'en_GB',
    siteTitle: 'Collège de la Salle — Daher',
    homeTitle: 'Collège de la Salle — Daher · Egyptian and French baccalaureates',
  },
  ar: {
    endonym: 'العربية',
    dir: 'rtl',
    ogLocale: 'ar_EG',
    siteTitle: 'كلية دي لا سال — الظاهر',
    homeTitle: 'كلية دي لا سال — الظاهر · الثانوية العامة والبكالوريا الفرنسية',
  },
};

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}
