import type { Prisma } from '../generated/prisma/client.js';

/**
 * Closes the open group memberships of students (soft: `leftOn` is set, the row stays as history). Called
 * in the SAME transaction as every change that takes a student out of a class: moving to another class,
 * unenrolling, a section change, graduation. `classId` limits it to the groups of that class.
 * A membership that began after `on` ends the day it began (the database refuses a negative span).
 */
export async function closeGroupMemberships(
  db: Prisma.TransactionClient,
  studentIds: readonly string[],
  on: Date,
  classId?: string,
): Promise<number> {
  if (!studentIds.length) return 0;
  const ids = [...studentIds];
  return classId
    ? db.$executeRaw`
        UPDATE group_members SET left_on = GREATEST(joined_on, ${on}::date)
         WHERE left_on IS NULL AND student_id = ANY(${ids}::uuid[]) AND class_id = ${classId}::uuid`
    : db.$executeRaw`
        UPDATE group_members SET left_on = GREATEST(joined_on, ${on}::date)
         WHERE left_on IS NULL AND student_id = ANY(${ids}::uuid[])`;
}
