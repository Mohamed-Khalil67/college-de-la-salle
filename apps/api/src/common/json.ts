/**
 * Reading a Prisma `Json` column without a cast. The column holds whatever was last written, so the shape
 * is checked item by item: an item that is not of the expected shape is dropped, never trusted.
 */

export type JsonGuard<T> = (value: unknown) => value is T;

/** The items of a JSON array that satisfy `guard`; `[]` when the column is not an array. */
export function readJsonList<T>(value: unknown, guard: JsonGuard<T>): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

export function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

export function hasNullableNumber(value: Record<string, unknown>, key: string): boolean {
  return value[key] === null || hasNumber(value, key);
}
