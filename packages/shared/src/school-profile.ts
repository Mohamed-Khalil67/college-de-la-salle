import { SECTION_IDS, type SectionId } from './space.js';

/**
 * The school an install serves (« school pack », `schools/<id>/profile.json`). One install per school: the API
 * reads the profile named by `SCHOOL` when it starts, the web app is built with it (prerendered pages). Pure
 * types and a validator, no I/O: the callers read the file.
 */

/** The languages the platform can show its public site in. Spaces (élève, enseignant, administration) are French. */
export const SCHOOL_LANGS = ['fr', 'en', 'ar'] as const;
export type SchoolLang = (typeof SCHOOL_LANGS)[number];

export function isSchoolLang(value: unknown): value is SchoolLang {
  return typeof value === 'string' && (SCHOOL_LANGS as readonly string[]).includes(value);
}

/** The school's name in one language. */
export interface SchoolNames {
  /** « Collège de la Salle ». */
  readonly full: string;
  /** « CDLS ». */
  readonly short: string;
  /** The district or campus, second line of the wordmark: « Daher ». */
  readonly place: string;
  readonly city: string;
  /**
   * The name after « de » in a sentence (« votre compte du Collège de la Salle », « de l’École Exemple »);
   * « of Collège de la Salle » in English.
   */
  readonly of: string;
}

/** A department's telephone lines (switchboard, a cycle, a section office), and its e-mail if it has one. */
export interface SchoolDepartment {
  /** Lower-case code (`standard`, `bac`); its name in each language comes from the site content. */
  readonly id: string;
  readonly phones: readonly [string, ...string[]];
  readonly email?: string;
}

export interface SchoolContacts {
  /** Postal address, per language. */
  readonly address: Readonly<Record<SchoolLang, string>>;
  /** What the « Voir sur la carte » link searches for (OpenStreetMap / Google Maps query). */
  readonly mapQuery: string;
  /** The secretariat's address: contact form fallback, accessibility statement, footer. */
  readonly email: string;
  /** The number shown in the site's top strip and footer. */
  readonly switchboard: string;
  readonly departments: readonly SchoolDepartment[];
}

/** A website of the school or its network (official site, a section's site, the network's archive). */
export interface SchoolWebsite {
  readonly id: string;
  readonly url: string;
}

/** A section (track) of the school, with its name in each language. */
export interface SchoolSection {
  readonly code: SectionId;
  readonly labels: Readonly<Record<SchoolLang, string>>;
}

/** A `<link rel="icon">` of the site's head. */
export interface SchoolIcon {
  readonly rel: 'icon' | 'apple-touch-icon';
  readonly href: string;
  readonly type?: string;
  readonly sizes?: string;
}

export interface SchoolBrand {
  /** `<use href>` of the crest on light backgrounds, served from the pack's `public/` folder (`/crest.svg#crest`). */
  readonly crest: string;
  /** The same on navy backgrounds (`/crest.svg#crest-on-dark`). */
  readonly crestOnDark: string;
  readonly icons: readonly SchoolIcon[];
  /** `<meta name="theme-color">`. */
  readonly themeColor: string;
  /**
   * Overrides of the theme's colour tokens (`--color-navy-900` → `#13294b`), written into the build's
   * `brand.css`. Only tokens listed in BRAND_COLOR_TOKENS; empty keeps the platform's palette.
   */
  readonly colors: Readonly<Record<string, string>>;
}

/** Ids written into calendar files (`UID:…@<uidDomain>`, `PRODID:-//<productName>//…`). Never change them once live. */
export interface SchoolCalendarIds {
  readonly uidDomain: string;
  /** ASCII only (`College de la Salle Daher`). */
  readonly productName: string;
}

export interface SchoolProfile {
  /** The pack's folder name (`cdls-daher`), the value of `SCHOOL`. */
  readonly id: string;
  /** True for a demonstration pack whose text is made up (`schools/example`). */
  readonly placeholder: boolean;
  readonly names: Readonly<Record<SchoolLang, SchoolNames>>;
  /** The language the name is written in, for `lang` on the wordmark (the CDLS name is French on every page). */
  readonly nameLang: SchoolLang;
  readonly foundingYear: number | null;
  /** Network or affiliation line (« Frères des Écoles chrétiennes »), per language. */
  readonly affiliation: Readonly<Record<SchoolLang, string>>;
  readonly contacts: SchoolContacts;
  readonly websites: readonly SchoolWebsite[];
  /**
   * The domain shown in help texts as an example of a login (`prenom.nom@<domain>`). The real domain of
   * generated logins is the API's `SCHOOL_EMAIL_DOMAIN`; the API warns in production when they differ.
   */
  readonly loginEmailDomain: string;
  /** IANA time zone (`Africa/Cairo`): « today », the clocks of the spaces, calendar files. */
  readonly timeZone: string;
  /** The language of the unprefixed public pages. Only `fr` for now (the spaces are French). */
  readonly defaultLanguage: SchoolLang;
  /** Languages of the public site, the default one included. */
  readonly languages: readonly SchoolLang[];
  /** The sections, in display order. For now exactly the platform's SECTION_IDS (docs/new-school.md). */
  readonly sections: readonly SchoolSection[];
  readonly calendar: SchoolCalendarIds;
  readonly brand: SchoolBrand;
}

/** Colour tokens a pack may override (styles.css). Others stay the platform's, so contrast is not left to chance. */
export const BRAND_COLOR_TOKENS = [
  '--color-navy-900',
  '--color-navy-800',
  '--color-navy-700',
  '--color-gold-500',
  '--color-gold-700',
] as const;

/* ------------------------------------------------------------------------------------------------
 * Validation
 * ---------------------------------------------------------------------------------------------- */

const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX = /^#[0-9a-f]{6}$/i;
const ASCII = /^[\x20-\x7e]+$/;

/** True when the runtime knows the IANA zone (`Intl` throws a RangeError for an unknown one). */
export function isTimeZone(zone: string): boolean {
  if (!zone.includes('/') && zone !== 'UTC') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

type Json = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collects the problems of one profile, each naming its field. */
class Checker {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  object(value: unknown, path: string): Json {
    if (isObject(value)) return value;
    this.fail(path, 'objet attendu');
    return {};
  }

  text(value: unknown, path: string, pattern?: RegExp, hint = 'format invalide'): string {
    if (typeof value !== 'string' || value.trim() === '') {
      this.fail(path, 'texte non vide attendu');
      return '';
    }
    if (pattern && !pattern.test(value)) this.fail(path, hint);
    return value;
  }

  list(value: unknown, path: string): readonly unknown[] {
    if (Array.isArray(value)) return value;
    this.fail(path, 'liste attendue');
    return [];
  }

  perLang(value: unknown, path: string): Record<SchoolLang, string> {
    const o = this.object(value, path);
    return {
      fr: this.text(o['fr'], `${path}.fr`),
      en: this.text(o['en'], `${path}.en`),
      ar: this.text(o['ar'], `${path}.ar`),
    };
  }

  url(value: unknown, path: string): string {
    const text = this.text(value, path);
    if (text && !/^https?:\/\/[^\s]+$/.test(text)) this.fail(path, 'adresse http(s) attendue');
    return text;
  }

  sitePath(value: unknown, path: string): string {
    return this.text(value, path, /^\/[^\s]*$/, 'chemin du site attendu, commençant par /');
  }
}

/** Every problem of a profile read from JSON; empty when it is a valid SchoolProfile. */
export function schoolProfileProblems(value: unknown): string[] {
  const c = new Checker();
  const p = c.object(value, 'profile');
  c.text(p['id'], 'id', PACK_ID, 'minuscules, chiffres et tirets (cdls-daher)');
  if (typeof p['placeholder'] !== 'boolean') c.fail('placeholder', 'true ou false attendu');

  const names = c.object(p['names'], 'names');
  for (const lang of SCHOOL_LANGS) {
    const n = c.object(names[lang], `names.${lang}`);
    for (const key of ['full', 'short', 'place', 'city', 'of'] as const) c.text(n[key], `names.${lang}.${key}`);
  }
  if (!isSchoolLang(p['nameLang'])) c.fail('nameLang', `une langue parmi ${SCHOOL_LANGS.join(', ')}`);
  const year = p['foundingYear'];
  if (year !== null && !(typeof year === 'number' && Number.isInteger(year) && year > 1000 && year < 3000)) {
    c.fail('foundingYear', 'année (1898) ou null attendue');
  }
  c.perLang(p['affiliation'], 'affiliation');

  const contacts = c.object(p['contacts'], 'contacts');
  c.perLang(contacts['address'], 'contacts.address');
  c.text(contacts['mapQuery'], 'contacts.mapQuery');
  c.text(contacts['email'], 'contacts.email', EMAIL, 'adresse e-mail attendue');
  c.text(contacts['switchboard'], 'contacts.switchboard');
  const ids = new Set<string>();
  c.list(contacts['departments'], 'contacts.departments').forEach((item, i) => {
    const path = `contacts.departments[${i}]`;
    const d = c.object(item, path);
    const id = c.text(d['id'], `${path}.id`, PACK_ID, 'code en minuscules (standard, bac)');
    if (ids.has(id)) c.fail(`${path}.id`, `« ${id} » est déjà utilisé`);
    ids.add(id);
    const phones = c.list(d['phones'], `${path}.phones`);
    if (phones.length === 0) c.fail(`${path}.phones`, 'au moins un numéro');
    phones.forEach((phone, j) => c.text(phone, `${path}.phones[${j}]`, /^\+?[\d ]+$/, 'chiffres, espaces et + seulement'));
    if (d['email'] !== undefined) c.text(d['email'], `${path}.email`, EMAIL, 'adresse e-mail attendue');
  });

  const sites = new Set<string>();
  c.list(p['websites'], 'websites').forEach((item, i) => {
    const w = c.object(item, `websites[${i}]`);
    const id = c.text(w['id'], `websites[${i}].id`, PACK_ID, 'code en minuscules');
    if (sites.has(id)) c.fail(`websites[${i}].id`, `« ${id} » est déjà utilisé`);
    sites.add(id);
    c.url(w['url'], `websites[${i}].url`);
  });

  c.text(p['loginEmailDomain'], 'loginEmailDomain', DOMAIN, 'nom de domaine attendu (lasalle-daher.eg)');
  const zone = c.text(p['timeZone'], 'timeZone');
  if (zone && !isTimeZone(zone)) c.fail('timeZone', `fuseau IANA inconnu « ${zone} » (Africa/Cairo)`);

  if (p['defaultLanguage'] !== 'fr') c.fail('defaultLanguage', 'seul « fr » est possible pour l’instant');
  const langs = c.list(p['languages'], 'languages');
  if (!langs.every(isSchoolLang)) c.fail('languages', `langues parmi ${SCHOOL_LANGS.join(', ')}`);
  if (new Set(langs).size !== langs.length) c.fail('languages', 'une langue apparaît deux fois');
  if (!langs.includes(p['defaultLanguage'])) c.fail('languages', 'doit contenir defaultLanguage');

  const codes = c.list(p['sections'], 'sections').map((item, i) => {
    const s = c.object(item, `sections[${i}]`);
    c.perLang(s['labels'], `sections[${i}].labels`);
    return s['code'];
  });
  const expected = [...SECTION_IDS].sort().join(', ');
  if ([...codes].map(String).sort().join(', ') !== expected) {
    c.fail('sections', `les codes doivent être exactement ${expected} (docs/new-school.md, « Sections »)`);
  }

  const calendar = c.object(p['calendar'], 'calendar');
  c.text(calendar['uidDomain'], 'calendar.uidDomain', /^[a-z0-9.-]+$/, 'minuscules, chiffres, points et tirets');
  c.text(calendar['productName'], 'calendar.productName', ASCII, 'caractères ASCII seulement');

  const brand = c.object(p['brand'], 'brand');
  c.sitePath(brand['crest'], 'brand.crest');
  c.sitePath(brand['crestOnDark'], 'brand.crestOnDark');
  c.text(brand['themeColor'], 'brand.themeColor', HEX, 'couleur #rrggbb attendue');
  c.list(brand['icons'], 'brand.icons').forEach((item, i) => {
    const icon = c.object(item, `brand.icons[${i}]`);
    if (icon['rel'] !== 'icon' && icon['rel'] !== 'apple-touch-icon') c.fail(`brand.icons[${i}].rel`, 'icon ou apple-touch-icon');
    c.text(icon['href'], `brand.icons[${i}].href`, /^\/?[\w./?=-]+$/, 'fichier du site attendu (favicon.ico)');
    for (const key of ['type', 'sizes'] as const) {
      if (icon[key] !== undefined) c.text(icon[key], `brand.icons[${i}].${key}`);
    }
  });
  const colors = c.object(brand['colors'], 'brand.colors');
  for (const [token, color] of Object.entries(colors)) {
    if (!(BRAND_COLOR_TOKENS as readonly string[]).includes(token)) {
      c.fail(`brand.colors.${token}`, `jeton inconnu (${BRAND_COLOR_TOKENS.join(', ')})`);
    }
    c.text(color, `brand.colors.${token}`, HEX, 'couleur #rrggbb attendue');
  }
  return c.problems;
}

function isSchoolProfile(value: unknown): value is SchoolProfile {
  return schoolProfileProblems(value).length === 0;
}

/** The profile, or an Error that lists every problem (the API and the web build stop on it). */
export function parseSchoolProfile(value: unknown, source = 'profile.json'): SchoolProfile {
  if (isSchoolProfile(value)) return value;
  throw new Error(`Profil d’établissement invalide (${source}) :\n- ${schoolProfileProblems(value).join('\n- ')}`);
}

/* ------------------------------------------------------------------------------------------------
 * Reading a profile
 * ---------------------------------------------------------------------------------------------- */

/** The name of each section in one language (`{ nationale: 'Bac nationale', bac: 'Bac français' }`). */
export function sectionLabels(profile: SchoolProfile, lang: SchoolLang = 'fr'): Readonly<Record<SectionId, string>> {
  const label = (code: SectionId) => profile.sections.find((s) => s.code === code)?.labels[lang] ?? code;
  return { nationale: label('nationale'), bac: label('bac') } satisfies Record<SectionId, string>;
}

/** « Collège de la Salle — Daher »: report cards, page titles. */
export function schoolTitle(profile: SchoolProfile, lang: SchoolLang = 'fr'): string {
  const names = profile.names[lang];
  return `${names.full} — ${names.place}`;
}

/** The example login shown in help texts: `prenom.nom@lasalle-daher.eg`. */
export function loginExample(profile: SchoolProfile): string {
  return `prenom.nom@${profile.loginEmailDomain}`;
}
