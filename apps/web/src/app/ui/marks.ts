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
