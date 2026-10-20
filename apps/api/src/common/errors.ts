import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export const forbidden = () => new ForbiddenException('Action non autorisée.');
export const notFound = (what = 'Élément') => new NotFoundException(`${what} introuvable.`);

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
