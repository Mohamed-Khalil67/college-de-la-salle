import { ConflictException } from '@nestjs/common';
import { YEAR_ARCHIVED } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

/** The 409 of a write into an archived school year (code `YEAR_ARCHIVED`, a French message). */
export function yearArchived(label: string): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: YEAR_ARCHIVED,
    message: `L’année ${label} est archivée : elle est en lecture seule (plus de notes, d’événements, d’appel, d’inscriptions, de matières, de périodes ni de modification de l’emploi du temps).`,
  });
}

/** 409 when the school year is archived. */
export function assertYearWritable(year: { label: string; archivedAt: Date | null }): void {
  if (year.archivedAt) throw yearArchived(year.label);
}

/** 409 when the school year is archived; takes the same SHARE lock as `assertClassWritable`. */
export async function assertYearIdWritable(db: Db, schoolYearId: string): Promise<void> {
  const rows = await db.$queryRaw<{ label: string; archived_at: Date | null }[]>`
    SELECT label, archived_at FROM school_years WHERE id = ${schoolYearId}::uuid FOR SHARE`;
  if (rows[0]) assertYearWritable({ label: rows[0].label, archivedAt: rows[0].archived_at });
}

/**
 * 409 when the class belongs to an archived school year. Call it inside the write's transaction: it takes a
 * SHARE lock on the year row, and archiving takes the exclusive one, so a write already under way finishes
 * before the year is archived and any later write sees it archived.
 */
export async function assertClassWritable(db: Db, classId: string | null | undefined): Promise<void> {
  if (!classId) return;
  const rows = await db.$queryRaw<{ label: string; archived_at: Date | null }[]>`
    SELECT y.label, y.archived_at
      FROM school_years y JOIN school_classes c ON c.school_year_id = y.id
     WHERE c.id = ${classId}::uuid
       FOR SHARE OF y`;
  if (rows[0]) assertYearWritable({ label: rows[0].label, archivedAt: rows[0].archived_at });
}
