import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export const forbidden = () => new ForbiddenException('Action non autorisée.');
export const notFound = (what = 'Élément') => new NotFoundException(`${what} introuvable.`);

/** Does the error (or its cause) come from this Postgres constraint, or carry this SQLSTATE code? */
function mentions(error: unknown, constraint: string, sqlState: string, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > 4) return false;
  const e = error as { code?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
  if (e.code === sqlState) return true;
  if (typeof e.message === 'string' && e.message.includes(constraint)) return true;
  if (
    e.meta !== undefined &&
    JSON.stringify(e.meta, (_, v: unknown) => (typeof v === 'bigint' ? 0 : v)).includes(constraint)
  )
    return true;
  return mentions(e.cause, constraint, sqlState, depth + 1);
}

/** Postgres EXCLUDE constraint violation (SQLSTATE 23P01) of the named constraint. */
export function isExclusionViolation(error: unknown, constraint: string): boolean {
  return mentions(error, constraint, '23P01');
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
