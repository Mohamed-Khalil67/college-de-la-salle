import type { Prisma } from '../generated/prisma/client.js';

/**
 * The query form of « the work concerns this student today », for lists that filter in the database
 * (a student's calendar, homework, the dashboard). It is the same rule as `targetedStudentIds` in
 * @cdls/shared, which the sheets use in memory; `test/targets.e2e-spec.ts` checks that both agree.
 * Combine it with the class condition (`classId`) of the student's enrolment.
 *
 * - no group or student row (the whole class, the default, or an event with no target at all);
 * - or the student is named;
 * - or the student is a current member (not left) of a targeted group.
 */
export function concernsStudentNow(studentId: string): Prisma.EventWhereInput {
  return {
    OR: [
      { targets: { none: { scope: { in: ['group', 'student'] } } } },
      { targets: { some: { scope: 'student', studentId } } },
      {
        targets: {
          some: {
            scope: 'group',
            group: { members: { some: { studentId, leftOn: null } } },
          },
        },
      },
    ],
  };
}
