import {
  classTarget,
  type Closure,
  expandTimetable,
  type SectionId,
  type SlotExceptionRule,
  type SlotRule,
  type TimetableOccurrence,
} from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { toDay } from '../common/dates.js';

/** What the timetable needs of a slot row: the class, subject, people and room for names and rules. */
export const slotInclude = {
  classSubject: {
    include: {
      subject: true,
      schoolClass: { include: { section: true, schoolYear: true } },
    },
  },
  teacher: { include: { user: true } },
  room: true,
  activityType: true,
  exceptions: true,
} satisfies Prisma.TimetableSlotInclude;

export type SlotRow = Prisma.TimetableSlotGetPayload<{ include: typeof slotInclude }>;
export type ExceptionRow = SlotRow['exceptions'][number];

/** A slot as the engine reads it, with the row it came from. */
export interface SlotData extends SlotRule {
  readonly classId: string;
  readonly division: string | null;
  /** First day of the school year: its week is week A. */
  readonly parityAnchor: string;
  readonly row: SlotRow;
}

export function toSlotData(row: SlotRow): SlotData {
  const c = row.classSubject.schoolClass;
  return {
    id: row.id,
    target: classTarget(c.section.code as SectionId, c.code),
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    validFrom: toDay(row.validFrom),
    validTo: toDay(row.validTo),
    weekParity: row.weekParity,
    roomId: row.roomId,
    teacherId: row.teacherId,
    classId: c.id,
    division: row.division,
    parityAnchor: toDay(c.schoolYear.startsOn),
    row,
  };
}

export function toExceptionRule(row: ExceptionRow): SlotExceptionRule {
  return {
    id: row.id,
    slotId: row.slotId,
    date: toDay(row.date),
    kind: row.kind,
    newDate: row.newDate ? toDay(row.newDate) : null,
    newStart: row.newStart,
    newEnd: row.newEnd,
    newRoomId: row.newRoomId,
    newTeacherId: row.newTeacherId,
    reason: row.reason,
  };
}

/**
 * The sessions of slots between two days. Week A is relative to each class's school year, so slots are
 * expanded one year at a time.
 */
export function expandSlots(
  slots: readonly SlotData[],
  from: string,
  to: string,
  closures: readonly Closure[],
): TimetableOccurrence<SlotData>[] {
  const byAnchor = new Map<string, SlotData[]>();
  for (const s of slots) byAnchor.set(s.parityAnchor, [...(byAnchor.get(s.parityAnchor) ?? []), s]);
  const out: TimetableOccurrence<SlotData>[] = [];
  for (const [parityAnchor, group] of byAnchor) {
    const exceptions = group.flatMap((s) => s.row.exceptions.map(toExceptionRule));
    out.push(...expandTimetable(group, exceptions, from, to, { closures, parityAnchor }));
  }
  return out.sort(
    (a, b) =>
      a.current.date.localeCompare(b.current.date) ||
      a.current.startTime.localeCompare(b.current.startTime) ||
      a.key.localeCompare(b.key),
  );
}
