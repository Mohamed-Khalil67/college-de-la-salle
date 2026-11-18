import { PROFILE } from '../core/school/school-profile';

/**
 * The public site's languages. French is the source and the default (no prefix in the URL); English and
 * Arabic live under /en and /ar. The spaces (élève, enseignant, administration) stay in French.
 * Pure data, no Angular: read by the routes, the head service and the unit tests.
 */

export const LANGS = ['fr', 'en', 'ar'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'fr';

/** The languages this school's site is published in (`profile.languages`): routes, prerendering, switcher, hreflang. */
export const ENABLED_LANGS: readonly Lang[] = LANGS.filter((lang) => PROFILE.languages.includes(lang));

export interface LangMeta {
  /** The language's own name, shown in the switcher (with `lang` set to the language). */
  readonly endonym: string;
  readonly dir: 'ltr' | 'rtl';
  /** For og:locale. */
  readonly ogLocale: string;
}

export const LANG_META: Readonly<Record<Lang, LangMeta>> = {
  fr: { endonym: 'Français', dir: 'ltr', ogLocale: 'fr_FR' },
  en: { endonym: 'English', dir: 'ltr', ogLocale: 'en_GB' },
  ar: { endonym: 'العربية', dir: 'rtl', ogLocale: 'ar_EG' },
};

/** Appended to every page title: « Collège de la Salle — Daher ». */
export function siteTitle(lang: Lang): string {
  const names = PROFILE.names[lang];
  return `${names.full} — ${names.place}`;
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}
