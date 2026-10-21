import {
  type Closure,
  closureCovers,
  longDay,
  MAX_ASSESSMENTS_PER_DAY,
  needsLab,
  type RoomKind,
  type TimetableOccurrence,
  type TimetableWarningDto,
  weeklyHours,
  type WeekParity,
} from '@cdls/shared';
import type { SlotData } from '../occupancy/slot-data.js';

export interface RoomFacts {
  readonly name: string;
  readonly capacity: number | null;
  readonly kind: RoomKind;
}

export interface WarningFacts {
  /** Exam weeks (and nothing else) as audiences. */
  readonly examWeeks: readonly Closure[];
  /** Open enrolments per class. */
  readonly classSize: ReadonlyMap<string, number>;
  readonly rooms: ReadonlyMap<string, RoomFacts>;
  /** Assessments (exams, tests) per `classId|day`. */
  readonly assessments: ReadonlyMap<string, number>;
}

const sessionName = (slot: SlotData) =>
  `${slot.row.classSubject.subject.name}, ${slot.row.classSubject.schoolClass.label}`;

const more = (n: number) =>
  n > 1 ? ` (et ${n - 1} autre${n > 2 ? 's' : ''} séance${n > 2 ? 's' : ''})` : '';

/**
 * The soft warnings of standing sessions (cancelled ones and traces excluded by the caller), one entry per
 * kind and item with the first day it happens and how many sessions it covers. Pure.
 */
export function sessionWarnings(
  sessions: readonly TimetableOccurrence<SlotData>[],
  facts: WarningFacts,
): TimetableWarningDto[] {
  const out: TimetableWarningDto[] = [];
  const sorted = [...sessions].sort((a, b) => a.current.date.localeCompare(b.current.date));

  const exam = sorted.filter((o) =>
    facts.examWeeks.some(
      (c) =>
        c.startsOn <= o.current.date &&
        o.current.date <= c.endsOn &&
        closureCovers(c, o.slot.target),
    ),
  );
  // One warning per series (slot), with its first day.
  for (const [slotId, list] of groupBy(exam, (o) => o.slot.id)) {
    const first = list[0]!;
    out.push({
      code: 'exam_week',
      slotId: first.slot.id,
      date: first.current.date,
      message: `Le ${longDay(first.current.date)} est en semaine d’examens (${sessionName(first.slot)})${more(list.length)}.`,
    });
    void slotId;
  }

  for (const [key, list] of groupBy(
    sorted.filter((o) => o.slot.division === null && o.current.roomId),
    (o) => `${o.current.roomId}|${o.slot.classId}`,
  )) {
    const first = list[0]!;
    const room = facts.rooms.get(first.current.roomId!);
    const size = facts.classSize.get(first.slot.classId);
    if (!room || room.capacity === null || size === undefined || room.capacity >= size) continue;
    out.push({
      code: 'room_capacity',
      slotId: first.slot.id,
      date: first.current.date,
      message: `${room.name} compte ${room.capacity} places pour ${size} élèves (${sessionName(first.slot)})${more(list.length)}.`,
    });
    void key;
  }

  for (const [, list] of groupBy(
    sorted.filter((o) => needsLab(o.slot.row.activityType)),
    (o) => `${o.slot.id}|${o.current.roomId ?? ''}`,
  )) {
    const first = list[0]!;
    const room = first.current.roomId ? facts.rooms.get(first.current.roomId) : undefined;
    if (room?.kind === 'lab') continue;
    out.push({
      code: 'tp_outside_lab',
      slotId: first.slot.id,
      date: first.current.date,
      message: `Un TP est prévu ${room ? `en ${room.name}, qui n’est pas un laboratoire` : 'sans salle'} (${sessionName(first.slot)})${more(list.length)}.`,
    });
  }

  const days = new Set<string>();
  for (const o of sorted) {
    const key = `${o.slot.classId}|${o.current.date}`;
    const count = facts.assessments.get(key) ?? 0;
    if (count > MAX_ASSESSMENTS_PER_DAY && !days.has(key)) {
      days.add(key);
      out.push({
        code: 'assessments_overload',
        slotId: o.slot.id,
        date: o.current.date,
        message: `La classe ${o.slot.row.classSubject.schoolClass.label} a déjà ${count} évaluations le ${longDay(o.current.date)}.`,
      });
    }
  }
  return out;
}

/** Hours a week of a class subject, from its slots (a fortnightly slot counts half), against `hoursPerWeek`. */
export function hoursWarning(
  slot: SlotData,
  slots: readonly { startTime: string; endTime: string; weekParity: WeekParity | null }[],
  hoursPerWeek: number | null,
): TimetableWarningDto | null {
  if (hoursPerWeek === null) return null;
  const total = slots.reduce((sum, s) => sum + weeklyHours(s), 0);
  if (total <= hoursPerWeek + 1e-9) return null;
  const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  return {
    code: 'hours_exceeded',
    slotId: slot.id,
    date: null,
    message: `${sessionName(slot)} : ${fmt(total)} h par semaine pour ${fmt(hoursPerWeek)} h prévues.`,
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
