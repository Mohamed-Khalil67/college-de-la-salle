import { Injectable } from '@nestjs/common';
import {
  type RoomKind,
  occupiesResources,
  type TimetableOccurrence,
  type TimetableWarningDto,
} from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { loadClosures } from '../calendar-days/closures.js';
import { fromDay, toDay } from '../common/dates.js';
import type { SlotData } from '../occupancy/slot-data.js';
import { hoursWarning, type RoomFacts, sessionWarnings } from './warnings.js';

type Db = Prisma.TransactionClient;

/** Loads the facts the soft rules need and applies them (see `warnings.ts` for the rules). */
@Injectable()
export class WarningsService {
  /**
   * Warnings for standing sessions. `series`: also check the weekly rule itself (hours per week), for the
   * slots these sessions belong to; leave it off when one session was changed.
   */
  async forSessions(
    db: Db,
    sessions: readonly TimetableOccurrence<SlotData>[],
    series: boolean,
  ): Promise<TimetableWarningDto[]> {
    const standing = sessions.filter(occupiesResources);
    if (!standing.length) return [];
    const dates = standing.map((o) => o.current.date).sort();
    const from = dates[0]!;
    const to = dates.at(-1)!;
    const classIds = [...new Set(standing.map((o) => o.slot.classId))];
    const roomIds = [
      ...new Set(standing.flatMap((o) => (o.current.roomId ? [o.current.roomId] : []))),
    ];

    const [examWeeks, sizes, rooms, assessments] = await Promise.all([
      loadClosures(db, ['exam_week'], from, to),
      db.enrollment.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds }, leftOn: null },
        _count: { _all: true },
      }),
      roomIds.length ? db.room.findMany({ where: { id: { in: roomIds } } }) : [],
      db.event.groupBy({
        by: ['classId', 'date'],
        where: {
          classId: { in: classIds },
          date: { gte: fromDay(from), lte: fromDay(to) },
          activityType: { gradable: true, homework: false, repeatable: false },
        },
        _count: { _all: true },
      }),
    ]);
    const facts = {
      examWeeks,
      classSize: new Map(sizes.map((s) => [s.classId, s._count._all])),
      rooms: new Map<string, RoomFacts>(
        rooms.map((r) => [r.id, { name: r.name, capacity: r.capacity, kind: r.kind as RoomKind }]),
      ),
      assessments: new Map(
        assessments.map((a) => [`${a.classId}|${toDay(a.date)}`, a._count._all] as const),
      ),
    };
    const out = sessionWarnings(standing, facts);
    if (series) out.push(...(await this.hours(db, standing)));
    return out;
  }

  /** Hours per week of each class subject whose slots these sessions belong to. */
  private async hours(
    db: Db,
    sessions: readonly TimetableOccurrence<SlotData>[],
  ): Promise<TimetableWarningDto[]> {
    const out: TimetableWarningDto[] = [];
    const seen = new Set<string>();
    for (const { slot } of sessions) {
      const classSubject = slot.row.classSubject;
      if (seen.has(classSubject.id)) continue;
      seen.add(classSubject.id);
      if (classSubject.hoursPerWeek === null) continue;
      // The slots that overlap this one in time add up; fortnightly ones count half.
      const siblings = await db.timetableSlot.findMany({
        where: {
          classSubjectId: classSubject.id,
          validFrom: { lte: fromDay(slot.validTo) },
          validTo: { gte: fromDay(slot.validFrom) },
        },
        select: { startTime: true, endTime: true, weekParity: true },
      });
      const warning = hoursWarning(slot, siblings, Number(classSubject.hoursPerWeek));
      if (warning) out.push(warning);
    }
    return out;
  }
}
