import { parseNumber } from '@cdls/shared';

/** Parses a typed mark ("12,5", "12.5", ""). Returns null when empty, NaN when it is not a number. */
export function parseMark(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return parseNumber(trimmed);
}

/** True when `mark` is empty or a number between 0 and `outOf` (inclusive). */
export function isValidMark(mark: number | null, outOf = 20): boolean {
  return mark === null || (Number.isFinite(mark) && mark >= 0 && mark <= outOf);
}

/**
 * The text a grade cell shows for `value`. Keeps `typed` (what is in the cell now) when it already stands
 * for that value, including half-typed marks like "12," that are not a number yet.
 */
export function markText(value: number | null, typed: string | undefined, format: (n: number) => string): string {
  if (typed !== undefined && Object.is(parseMark(typed), value)) return typed;
  return value === null || Number.isNaN(value) ? '' : format(value);
}
