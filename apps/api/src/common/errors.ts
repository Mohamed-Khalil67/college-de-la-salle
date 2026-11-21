import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export const forbidden = (message = 'Action non autorisée.') => new ForbiddenException(message);
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

/** Postgres SQLSTATEs of a transaction that lost a race and may simply be run again. */
export const TRANSIENT_SQLSTATES = ['40001', '40P01'] as const; // serialization_failure, deadlock_detected

const TRANSIENT = new Set<string>(TRANSIENT_SQLSTATES);

/**
 * A serialization failure or a deadlock, however it arrives: Prisma's P2034 (a query of the client), a P2010
 * raw-query error (`meta.driverAdapterError.cause.originalCode`, also in the message as « Code: `40P01` »),
 * or the `pg` error itself (`code`). Looks in the error, its `meta` and its `cause`, a few levels deep.
 */
export function isTransientConflict(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > 5) return false;
  const e = error as {
    code?: unknown;
    originalCode?: unknown;
    kind?: unknown;
    message?: unknown;
    meta?: unknown;
    cause?: unknown;
    driverAdapterError?: unknown;
  };
  if (e.code === 'P2034' || e.kind === 'TransactionWriteConflict') return true;
  for (const code of [e.code, e.originalCode])
    if (typeof code === 'string' && TRANSIENT.has(code)) return true;
  const message = e.code === 'P2010' && typeof e.message === 'string' ? e.message : '';
  if (TRANSIENT_SQLSTATES.some((s) => message.includes(`Code: \`${s}\``))) return true;
  return [e.meta, e.driverAdapterError, e.cause].some((next) => isTransientConflict(next, depth + 1));
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
