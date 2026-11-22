import { PROFILE } from '../core/school/school-profile';

/**
 * The public site's language: French only, the school's decision (docs/i18n.md). No language prefix in the URL,
 * no switcher. The spaces (élève, enseignant, administration) are French too.
 * Pure data, no Angular: read by the routes, the head service and the unit tests.
 */

export const LANGS = ['fr'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'fr';

export interface LangMeta {
  readonly dir: 'ltr';
  /** For og:locale. */
  readonly ogLocale: string;
}

export const LANG_META: Readonly<Record<Lang, LangMeta>> = {
  fr: { dir: 'ltr', ogLocale: 'fr_FR' },
};

/** Appended to every page title: « Collège de la Salle — Daher ». */
export function siteTitle(lang: Lang): string {
  const names = PROFILE.names[lang];
  return `${names.full} — ${names.place}`;
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}
