/**
 * Accounts: school login e-mails built from names, password rules and roster dates.
 * Pure functions shared by the API (import, creation) and the web app (forms, previews).
 */

/** Diacritics left by NFD normalisation (é → e + U+0301). */
const COMBINING_MARKS = /[̀-ͯ]/g;
/** Spaces and apostrophes (straight, typographic, modifier letter) become hyphens. */
const SEPARATORS = /[\s'’ʼ‘`]+/g;

/**
 * One name as it appears in a login e-mail: lower-case, accents removed, spaces and apostrophes turned
 * into hyphens, other characters dropped. « Marie-Hélène » → `marie-helene`, « d'Artagnan » → `d-artagnan`.
 * Empty when nothing usable is left (for instance a name written only in Arabic letters).
 */
export function emailNamePart(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ı/g, 'i')
    .replace(SEPARATORS, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `prenom.nom`, or null when the first or last name has no usable letter. */
export function schoolEmailLocalPart(firstName: string, lastName: string): string | null {
  const first = emailNamePart(firstName);
  const last = emailNamePart(lastName);
  return first && last ? `${first}.${last}` : null;
}

/**
 * Longest local part we generate: the sign-in form accepts at most 64 characters before the @, and a
 * collision number (`2`…`99999`) is added after it.
 */
export const EMAIL_LOCAL_MAX = 58;

function cappedLocal(local: string): string {
  return local.length <= EMAIL_LOCAL_MAX ? local : local.slice(0, EMAIL_LOCAL_MAX).replace(/[-.]+$/, '');
}

/**
 * The start every generated address of this name shares (`prenom.nom`, capped like the addresses are):
 * `prenom.nom@d`, `prenom.nom2@d`… all begin with it. Null when the name has no usable letter.
 */
export function schoolEmailPrefix(firstName: string, lastName: string): string | null {
  const full = schoolEmailLocalPart(firstName, lastName);
  return full ? cappedLocal(full) : null;
}

/** A generated address and which number it got: 1 is `prenom.nom`, 2 is `prenom.nom2`… */
export interface SchoolEmail {
  readonly email: string;
  /** 1 when the plain address was free; n when n - 1 homonyms already hold the earlier ones. */
  readonly number: number;
}

/**
 * The school login e-mails of a list of people, in order: `prenom.nom@domain`, then `prenom.nom2@domain`,
 * `prenom.nom3@domain`… when the address is already `taken` or given earlier in the list. Names are
 * compared as written in the address, so « Adèle Ben Youssef » and « adele ben-youssef » are homonyms;
 * `taken` is compared case-insensitively. Null for a person whose name gives no usable local part.
 * Existing accounts are never renumbered: pass their addresses in `taken`; only new people get one.
 */
export function describeSchoolEmails(
  people: readonly { readonly firstName: string; readonly lastName: string }[],
  domain: string,
  taken: Iterable<string> = [],
): (SchoolEmail | null)[] {
  const used = new Set([...taken].map((email) => email.toLowerCase()));
  const host = domain.trim().toLowerCase();
  return people.map(({ firstName, lastName }) => {
    const full = schoolEmailLocalPart(firstName, lastName);
    if (!full) return null;
    const local = cappedLocal(full);
    let number = 1;
    let email = `${local}@${host}`;
    while (used.has(email)) email = `${local}${++number}@${host}`;
    used.add(email);
    return { email, number };
  });
}

/** Same as describeSchoolEmails, keeping only the addresses. */
export function assignSchoolEmails(
  people: readonly { readonly firstName: string; readonly lastName: string }[],
  domain: string,
  taken: Iterable<string> = [],
): (string | null)[] {
  return describeSchoolEmails(people, domain, taken).map((e) => e?.email ?? null);
}

/** Why an address carries a number, for the preview: « car 1 homonyme », « car 2 homonymes » (null for number 1). */
export function emailNumberReason(number: number): string | null {
  if (number <= 1) return null;
  const homonyms = number - 1;
  return `car ${homonyms} homonyme${homonyms > 1 ? 's' : ''}`;
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * What is wrong with a new password, as sentences to show (empty when it is acceptable):
 * at least 10 characters, and not the account's e-mail (nor its part before the @).
 */
export function passwordProblems(password: string, email: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH)
    problems.push(`Le mot de passe doit compter au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  if (password.length > PASSWORD_MAX_LENGTH)
    problems.push(`Le mot de passe compte ${PASSWORD_MAX_LENGTH} caractères au plus.`);
  const candidate = password.trim().toLowerCase();
  const address = email.trim().toLowerCase();
  const local = address.split('@')[0] ?? '';
  if (candidate && (candidate === address || candidate === local))
    problems.push('Le mot de passe ne doit pas être votre adresse e-mail.');
  return problems;
}

/**
 * A birth date from a roster: `2010-03-15` or the French spreadsheet form `15/03/2010`, as `YYYY-MM-DD`.
 * Null when it is not a real calendar day.
 */
export function parseRosterDate(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const parts = iso
    ? [iso[1], iso[2], iso[3]]
    : french
      ? [french[3], french[2]?.padStart(2, '0'), french[1]?.padStart(2, '0')]
      : null;
  if (!parts) return null;
  const [y, m, d] = parts.map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
