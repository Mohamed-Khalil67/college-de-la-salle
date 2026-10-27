/**
 * Calendar-day helpers on `YYYY-MM-DD` strings (UTC, no time zone surprises) and the typed French date
 * format `JJ/MM/AAAA` of the year screens. No Angular here: unit-tested in day-math.spec.ts.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** True for a real calendar day written `YYYY-MM-DD` (no 2026-02-30). */
export function isIsoDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Milliseconds at 00:00 UTC of an ISO day. */
export function dayTime(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Whole days from `from` to `to` (negative when `to` comes first). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayTime(to) - dayTime(from)) / MS_PER_DAY);
}

export function addDays(day: string, count: number): string {
  return new Date(dayTime(day) + count * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Both bounds included. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Number of days of a range, both bounds included. */
export function rangeLength(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/**
 * Reads a date typed by a person: `12/09/2026`, `12-9-2026`, `12.09.2026` or `2026-09-12`.
 * Returns the ISO day, or null when it is not a real date.
 */
export function parseTypedDate(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const iso = ISO_DAY.exec(value);
  if (iso) return isIsoDay(value) ? value : null;
  const match = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/.exec(value);
  if (!match) return null;
  const [, dd = '', mm = '', yyyy = ''] = match;
  const day = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  return isIsoDay(day) ? day : null;
}

/** `2026-09-12` → `12/09/2026`, the format people type. Anything else comes back unchanged. */
export function formatTypedDate(day: string): string {
  const match = ISO_DAY.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

/** What is wrong with a typed date, in French, or null when it is a real date. */
export function typedDateProblem(text: string): string | null {
  if (!text.trim()) return 'Saisissez la date au format JJ/MM/AAAA.';
  return parseTypedDate(text) ? null : 'Cette date n’existe pas : saisissez-la au format JJ/MM/AAAA, par exemple 12/09/2026.';
}

const MONTH_SHORT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const MONTH_LONG = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export interface MonthTick {
  /** First day of the month, `YYYY-MM-DD`. */
  readonly day: string;
  /** « sept. » */
  readonly label: string;
  /** « septembre 2026 », for screen readers. */
  readonly long: string;
  /** Position on the timeline, 0 to 100. */
  readonly left: number;
  /** Width on the timeline, in percent. */
  readonly width: number;
}

/** The months of a school year with their position on a horizontal timeline. */
export function monthTicks(startsOn: string, endsOn: string): MonthTick[] {
  const total = rangeLength(startsOn, endsOn);
  const ticks: MonthTick[] = [];
  const end = dayTime(endsOn);
  let cursor = new Date(dayTime(startsOn));
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  while (cursor.getTime() <= end) {
    const first = cursor.toISOString().slice(0, 10);
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const from = first < startsOn ? startsOn : first;
    const lastDay = addDays(next.toISOString().slice(0, 10), -1);
    const to = lastDay > endsOn ? endsOn : lastDay;
    ticks.push({
      day: first,
      label: MONTH_SHORT.format(cursor),
      long: MONTH_LONG.format(cursor),
      left: (daysBetween(startsOn, from) / total) * 100,
      width: (rangeLength(from, to) / total) * 100,
    });
    cursor = next;
  }
  return ticks;
}

/** Position and width (percent) of a range on the timeline of a year; clipped to the year. */
export function barGeometry(
  startsOn: string,
  endsOn: string,
  yearStart: string,
  yearEnd: string,
): { readonly left: number; readonly width: number } {
  const total = rangeLength(yearStart, yearEnd);
  const from = startsOn < yearStart ? yearStart : startsOn;
  const to = endsOn > yearEnd ? yearEnd : endsOn;
  if (to < from) return { left: 0, width: 0 };
  return { left: (daysBetween(yearStart, from) / total) * 100, width: (rangeLength(from, to) / total) * 100 };
}
