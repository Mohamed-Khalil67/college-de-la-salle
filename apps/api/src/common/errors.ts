import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export const forbidden = () => new ForbiddenException('Action non autorisée.');
export const notFound = (what = 'Élément') => new NotFoundException(`${what} introuvable.`);

/** Does the error (or its cause) name this Postgres constraint? */
function mentions(error: unknown, constraint: string, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > 4) return false;
  const e = error as { message?: unknown; cause?: unknown; meta?: unknown };
  if (typeof e.message === 'string' && e.message.includes(constraint)) return true;
  if (
    e.meta !== undefined &&
    JSON.stringify(e.meta, (_, v: unknown) => (typeof v === 'bigint' ? 0 : v)).includes(constraint)
  )
    return true;
  return mentions(e.cause, constraint, depth + 1);
}

/** A violation of the named Postgres EXCLUDE constraint (the error message carries its name). */
export function isExclusionViolation(error: unknown, constraint: string): boolean {
  return mentions(error, constraint);
}

/** Prisma's unique-constraint violation: a row with the same key was added meanwhile. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/** Awaits a create; if the same key was taken between the check and the write, answers 409 with `message`. */
export async function conflictOnUnique<T>(work: Promise<T>, message: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictException(message);
    throw error;
  }
}

/** Prisma's foreign-key violation: another row still points at the one being deleted. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2003'
  );
}

/**
 * Awaits a delete; if a row added meanwhile still points at it (a restrict foreign key), answers 409
 * with `message` instead of a 500.
 */
export async function conflictOnReference<T>(work: Promise<T>, message: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new ConflictException(message);
    throw error;
  }
}
