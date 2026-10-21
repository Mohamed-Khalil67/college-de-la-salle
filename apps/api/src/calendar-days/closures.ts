import { type CalendarDayType, classTarget, type Closure, type SectionId } from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { fromDay, toDay } from '../common/dates.js';

/**
 * The calendar days of these types that touch [from, to], as audiences in the shared model's notation
 * (`all`, `bac`, `bac-premiere`), for the occurrence engine. Shared by the calendar, the timetable and
 * the occupancy index.
 */
export async function loadClosures(
  db: Prisma.TransactionClient,
  types: readonly CalendarDayType[],
  from: string,
  to: string,
): Promise<Closure[]> {
  const rows = await db.calendarDay.findMany({
    where: {
      type: { in: [...types] },
      startsOn: { lte: fromDay(to) },
      endsOn: { gte: fromDay(from) },
    },
    include: {
      section: true,
      classes: { include: { schoolClass: { include: { section: true } } } },
    },
  });
  return rows.map((r) => ({
    startsOn: toDay(r.startsOn),
    endsOn: toDay(r.endsOn),
    targets: r.classes.length
      ? r.classes.map((c) =>
          classTarget(c.schoolClass.section.code as SectionId, c.schoolClass.code),
        )
      : [r.section?.code ?? 'all'],
  }));
}
