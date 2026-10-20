/**
 * Framework-free helpers for the administration: labels, dates, averages, CSV and passwords.
 * No Angular here, so they are unit-tested with Vitest (admin-format.spec.ts).
 */
import {
  type ClassDto,
  type ImportUsersError,
  type ImportUsersResponse,
  type Role,
  SECTION_LABELS,
  type SectionId,
  type UserDto,
} from '@cdls/shared';
import type { BadgeTone } from '../../ui';

export const ROLE_LABELS: Readonly<Record<Role, { readonly one: string; readonly tab: string; readonly noun: string }>> = {
  student: { one: 'Élève', tab: 'Élèves', noun: 'élèves' },
  teacher: { one: 'Enseignant', tab: 'Enseignants', noun: 'enseignants' },
  admin: { one: 'Administration', tab: 'Administration', noun: 'comptes' },
};

/** Tab order on the users page. */
export const ROLE_TABS: readonly Role[] = ['student', 'teacher', 'admin'];

export function isRole(value: string): value is Role {
  return value === 'student' || value === 'teacher' || value === 'admin';
}

export function fullName(person: { readonly firstName: string; readonly lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export interface UserStatus {
  readonly label: string;
  readonly tone: BadgeTone;
}

export function userStatus(user: Pick<UserDto, 'isActive' | 'lastLoginAt'>): UserStatus {
  if (!user.isActive) return { label: 'Désactivé', tone: 'neutral' };
  if (!user.lastLoginAt) return { label: 'Jamais connecté', tone: 'info' };
  return { label: 'Actif', tone: 'success' };
}

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Cairo',
});
const CAIRO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });
const UTC_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** « 9 h 14 » rather than « 09:14 ». */
function frenchTime(date: Date): string {
  const [h, m] = TIME.format(date).split(':');
  return `${Number(h)} h ${m}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** « Aujourd’hui, 9 h 14 », « Hier », « 18 octobre », « 2 juin 2025 » or « Jamais » (Cairo time). */
export function formatLastLogin(iso: string | null, now: Date): string {
  if (!iso) return 'Jamais';
  const date = new Date(iso);
  const gap = daysBetween(CAIRO_DAY.format(date), CAIRO_DAY.format(now));
  if (gap <= 0) return `Aujourd’hui, ${frenchTime(date)}`;
  if (gap === 1) return 'Hier';
  return gap < 300 ? DAY_MONTH.format(date) : DAY_MONTH_YEAR.format(date);
}

/** `2026-09-01` → « 1 septembre 2026 ». */
export function formatDay(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(time) ? day : UTC_DAY.format(time);
}

/** « du 1 septembre 2026 au 20 décembre 2026 ». */
export function formatRange(startsOn: string, endsOn: string): string {
  return `du ${formatDay(startsOn)} au ${formatDay(endsOn)}`;
}

/** An average on 20 with a decimal comma and one decimal, or a dash. */
export function formatAverage(value: number | null): string {
  return value === null ? '—' : value.toFixed(1).replace('.', ',');
}

/** « 1 élève », « 3 élèves ». */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

export function sectionLabel(code: SectionId): string {
  return SECTION_LABELS[code] ?? code;
}

export interface SectionGroup<T> {
  readonly code: SectionId;
  readonly label: string;
  readonly items: readonly T[];
}

/** Classes grouped by section, in the order the API sends them (Bac nationale first). */
export function groupBySection<T extends Pick<ClassDto, 'sectionCode'>>(classes: readonly T[]): SectionGroup<T>[] {
  const groups = new Map<SectionId, T[]>();
  for (const item of classes) {
    const list = groups.get(item.sectionCode) ?? [];
    list.push(item);
    groups.set(item.sectionCode, list);
  }
  return [...groups].map(([code, items]) => ({ code, label: sectionLabel(code), items }));
}

/** « Seconde B (Bac français) » for selects that mix sections. */
export function classOptionLabel(item: Pick<ClassDto, 'label' | 'sectionCode'>): string {
  return `${item.label} (${sectionLabel(item.sectionCode)})`;
}

/** First error message of a Signal Forms field once the user has left it (or tried to submit). */
export function shownError(state: { touched(): boolean; errors(): readonly { message?: string }[] }): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

/** The per-line errors of a refused CSV import (400 with `errors` in the body), or null. */
export function importErrors(error: unknown): ImportUsersError[] | null {
  const body = (error as { error?: { errors?: unknown } } | null)?.error;
  const list = body?.errors;
  if (!Array.isArray(list)) return null;
  return list.filter(
    (item): item is ImportUsersError =>
      typeof item === 'object' && item !== null && typeof item.line === 'number' && typeof item.message === 'string',
  );
}

export const IMPORT_HEADER = 'email,firstName,lastName,role,studentNumber,section,class';

/** The template offered in the import dialog: one student, one teacher. */
export const IMPORT_TEMPLATE = [
  IMPORT_HEADER,
  'prenom.nom@lasalle-daher.eg,Prénom,Nom,student,2026-0001,bac,seconde',
  'enseignant.nom@lasalle-daher.eg,Prénom,Nom,teacher,,,',
  '',
].join('\n');

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The accounts created by an import, with their temporary passwords, as a CSV to hand out. */
export function createdAccountsCsv(created: ImportUsersResponse['created']): string {
  const rows = created.map((c) => [c.email, ROLE_LABELS[c.role].one, c.temporaryPassword].map(csvCell).join(','));
  return ['email,role,motDePasseTemporaire', ...rows, ''].join('\n');
}

/** No look-alike characters (0/O, 1/l/I), so a password read aloud or copied by hand works. */
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * A temporary password from a source of random bytes (crypto.getRandomValues in the app). Bytes are
 * drawn by rejection so every character is equally likely.
 */
export function generatePassword(randomBytes: (size: number) => Uint8Array, length = 14): string {
  const size = PASSWORD_ALPHABET.length;
  const limit = 256 - (256 % size);
  let result = '';
  while (result.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit) result += PASSWORD_ALPHABET[byte % size];
      if (result.length === length) break;
    }
  }
  return result;
}

/** Valid class code for the API (`seconde-b`). */
export const CLASS_CODE = /^[a-z0-9-]{1,40}$/;

/** Valid student number for the API. */
export const STUDENT_NUMBER = /^[\w-]{1,32}$/;

/** `2026-2027`, both years consecutive. */
export function isYearLabel(label: string): boolean {
  const match = /^(\d{4})-(\d{4})$/.exec(label);
  return !!match && Number(match[2]) === Number(match[1]) + 1;
}
