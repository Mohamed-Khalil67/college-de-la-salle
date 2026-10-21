/**
 * Next school year (rollover): the pure date arithmetic shared by the API (the plan) and the web (default
 * dates of the wizard). Dates are `YYYY-MM-DD` strings; nothing here reads the clock.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 ? (isLeap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * The same calendar day `years` years later. 29 February moves to 28 February in a year that is not a leap
 * year (and stays 29 February in one that is): 2028-02-29 + 1 year = 2029-02-28.
 */
export function shiftYear(day: string, years = 1): string {
  const match = DAY.exec(day);
  if (!match) throw new Error(`Not a date: ${day}`);
  const year = Number(match[1]) + years;
  const month = Number(match[2]);
  const dayOfMonth = Math.min(Number(match[3]), daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${match[2]}-${String(dayOfMonth).padStart(2, '0')}`;
}

/** « 2026-2027 » → « 2027-2028 »; null when the label is not two consecutive years. */
export function nextYearLabel(label: string): string | null {
  const match = /^(\d{4})-(\d{4})$/.exec(label);
  if (!match) return null;
  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`;
}

/**
 * A date range moved by `years` (one by default) and held inside the new school year; the plan warns when it
 * was cut. `outside` is true when nothing of the range is left inside the year (it cannot be created).
 */
export function shiftRange(
  range: { readonly startsOn: string; readonly endsOn: string },
  year: { readonly startsOn: string; readonly endsOn: string },
  years = 1,
): {
  readonly startsOn: string;
  readonly endsOn: string;
  readonly clamped: boolean;
  readonly outside: boolean;
} {
  const startsOn = shiftYear(range.startsOn, years);
  const endsOn = shiftYear(range.endsOn, years);
  const from = startsOn < year.startsOn ? year.startsOn : startsOn;
  const to = endsOn > year.endsOn ? year.endsOn : endsOn;
  return { startsOn: from, endsOn: to, clamped: from !== startsOn || to !== endsOn, outside: from > to };
}

/** Whole years between two school years' first days (at least one): how far the plan moves every date. */
export function yearsBetween(sourceStartsOn: string, newStartsOn: string): number {
  return Math.max(1, Number(newStartsOn.slice(0, 4)) - Number(sourceStartsOn.slice(0, 4)));
}

/** Holiday and « pas de cours » dates move with the lunar and civil calendars: the plan flags them for a check. */
export const SHIFTED_DAY_TYPES_TO_CHECK: readonly string[] = ['holiday', 'no_classes'];
