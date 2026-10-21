import { addDays, closureCovers, type Closure, daysBetween, weekday } from './calendar.js';
import type { Target } from './space.js';

/**
 * The timetable: a weekly rule (a slot) plus one-off changes (exceptions) is the source of truth; this
 * module expands them into dated sessions (« occurrences »), skipping holidays and days without classes
 * and marking every session with its original and its current values (« avant / maintenant »).
 *
 * Pure functions on `YYYY-MM-DD` days and `HH:MM` clock times. Nothing here uses a time zone: a session
 * happens at a wall-clock time of the school, so daylight saving time never moves it.
 */

/* ------------------------------------------------------------------------------------------------
 * Vocabulary
 * ---------------------------------------------------------------------------------------------- */

/** Weeks of a fortnightly rhythm: a slot with a parity only runs every other week. */
export type WeekParity = 'A' | 'B';
export const WEEK_PARITIES: readonly WeekParity[] = ['A', 'B'];

export type SlotExceptionKind = 'cancelled' | 'moved' | 'substitute' | 'room_change';
export const SLOT_EXCEPTION_KINDS: readonly SlotExceptionKind[] = [
  'cancelled',
  'moved',
  'substitute',
  'room_change',
];
export const SLOT_EXCEPTION_LABELS: Readonly<Record<SlotExceptionKind, string>> = {
  cancelled: 'Annulée',
  moved: 'Déplacée',
  substitute: 'Remplacement',
  room_change: 'Salle changée',
};

/** « Cette séance / Celle-ci et les suivantes / Toute la série ». */
export type SlotScope = 'this' | 'following' | 'all';
export const SLOT_SCOPES: readonly SlotScope[] = ['this', 'following', 'all'];
export const SLOT_SCOPE_LABELS: Readonly<Record<SlotScope, string>> = {
  this: 'Cette séance',
  following: 'Celle-ci et les suivantes',
  all: 'Toute la série',
};

/** What a session is, once its exception (if any) is applied. `moved_from` is the struck-through trace of a moved session. */
export type OccurrenceStatus =
  | 'normal'
  | 'cancelled'
  | 'moved'
  | 'moved_from'
  | 'substitute'
  | 'room_change';

/** Days run Sunday (0) to Saturday (6), as in `weekday()`; the school week is Sunday to Thursday. */
export const WEEKDAY_LABELS: readonly string[] = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];
/** The days a timetable normally uses (Sunday to Thursday). */
export const SCHOOL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];

export const TIMETABLE_LIMITS = {
  division: 40,
  reason: 500,
  /** A slot rule never spans more than this many days (a school year). */
  maxSpanDays: 400,
  /** Occurrences are listed for at most this many days at once. */
  maxRangeDays: 62,
} as const;

/** More than this many assessments for a class the same day raises a warning. */
export const MAX_ASSESSMENTS_PER_DAY = 2;

/* ------------------------------------------------------------------------------------------------
 * Clock times
 * ---------------------------------------------------------------------------------------------- */

/** `HH:MM` to minutes after midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/** Length of a session in hours (1.5 for 08:30 to 10:00). */
export function hoursBetween(start: string, end: string): number {
  return (minutesOf(end) - minutesOf(start)) / 60;
}

/** `[start, end)` overlap of two sessions of the same day. */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return minutesOf(aStart) < minutesOf(bEnd) && minutesOf(bStart) < minutesOf(aEnd);
}

/** The same `HH:MM` shifted by whole minutes (clamped to the day). */
export function shiftTime(time: string, minutes: number): string {
  const total = Math.min(23 * 60 + 59, Math.max(0, minutesOf(time) + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------------------------------------
 * Week parity
 * ---------------------------------------------------------------------------------------------- */

const SUNDAY_EPOCH = '2000-01-02';

/** The Sunday-first week containing `day` starts on this day. */
function weekStartOf(day: string): string {
  return addDays(day, -weekday(day));
}

/**
 * Week A or B of `day`. The week containing `anchorDay` (the first week of the school year) is week A,
 * the next one week B, and so on. Without an anchor the count starts at a fixed Sunday of the year 2000.
 */
export function weekParityOf(day: string, anchorDay: string = SUNDAY_EPOCH): WeekParity {
  const weeks = Math.round(daysBetween(weekStartOf(anchorDay), weekStartOf(day)) / 7);
  return ((weeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

/* ------------------------------------------------------------------------------------------------
 * Rules and exceptions
 * ---------------------------------------------------------------------------------------------- */

/** The part of a slot the engine needs. The API's rows carry more (names, ids) and pass through untouched. */
export interface SlotRule {
  readonly id: string;
  /** The class as an audience (`bac-premiere`), to find the holidays that cover it. */
  readonly target: Target;
  /** 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  /** Included. */
  readonly validFrom: string;
  /** Included. */
  readonly validTo: string;
  readonly weekParity: WeekParity | null;
  readonly roomId: string | null;
  readonly teacherId: string;
}

export interface SlotExceptionRule {
  readonly id: string;
  readonly slotId: string;
  /** The ORIGINAL day of the session this exception changes. */
  readonly date: string;
  readonly kind: SlotExceptionKind;
  readonly newDate: string | null;
  readonly newStart: string | null;
  readonly newEnd: string | null;
  readonly newRoomId: string | null;
  readonly newTeacherId: string | null;
  readonly reason: string;
}

/** The values of a session: what the rule says (« avant ») or what it is now (« maintenant »). */
export interface SessionValues {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly roomId: string | null;
  readonly teacherId: string;
}

export type SessionChange = 'date' | 'time' | 'room' | 'teacher';

export interface TimetableOccurrence<S extends SlotRule = SlotRule> {
  /** `slotId@originalDay`, plus `:from` on the trace of a moved session. Unique per entry. */
  readonly key: string;
  readonly slot: S;
  /** The day the rule puts it on. */
  readonly originalDate: string;
  readonly status: OccurrenceStatus;
  readonly exception: SlotExceptionRule | null;
  /** The current values (the rule's for `cancelled` and `moved_from`). */
  readonly current: SessionValues;
  /** What the rule says. */
  readonly original: SessionValues;
  /** The fields that differ now, to write « avant / maintenant » only where it matters. */
  readonly changes: readonly SessionChange[];
  /** For `moved_from`: where the session went. */
  readonly movedTo: SessionValues | null;
}

export interface ExpandOptions {
  /** Holidays and days without classes: no session on them. */
  readonly closures?: readonly Closure[];
  /** A day of the week that counts as week A (usually the school year's first day). */
  readonly parityAnchor?: string;
}

function closedOn(day: string, target: Target, closures: readonly Closure[]): boolean {
  return closures.some((c) => c.startsOn <= day && day <= c.endsOn && closureCovers(c, target));
}

/** Does the rule, ignoring exceptions, put a session on this day? */
export function slotRunsOn(slot: SlotRule, day: string, options: ExpandOptions = {}): boolean {
  if (day < slot.validFrom || day > slot.validTo) return false;
  if (weekday(day) !== slot.weekday) return false;
  if (slot.weekParity && weekParityOf(day, options.parityAnchor) !== slot.weekParity) return false;
  return !closedOn(day, slot.target, options.closures ?? []);
}

/** Every day the rule puts a session on, between `from` and `to` (both included), holidays removed. */
export function slotDays(
  slot: SlotRule,
  from: string,
  to: string,
  options: ExpandOptions = {},
): string[] {
  const start = from > slot.validFrom ? from : slot.validFrom;
  const end = to < slot.validTo ? to : slot.validTo;
  if (start > end) return [];
  // First matching weekday on or after `start`.
  let day = addDays(start, (slot.weekday - weekday(start) + 7) % 7);
  const out: string[] = [];
  for (; day <= end; day = addDays(day, 7)) if (slotRunsOn(slot, day, options)) out.push(day);
  return out;
}

function baseValues(slot: SlotRule, date: string): SessionValues {
  return {
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    roomId: slot.roomId,
    teacherId: slot.teacherId,
  };
}

/** What a session becomes under an exception. A start without an end keeps the duration. */
export function applyException(slot: SlotRule, ex: SlotExceptionRule): SessionValues {
  const original = baseValues(slot, ex.date);
  if (ex.kind === 'cancelled') return original;
  const startTime = ex.newStart ?? original.startTime;
  const endTime =
    ex.newEnd ??
    (ex.newStart
      ? shiftTime(original.endTime, minutesOf(ex.newStart) - minutesOf(original.startTime))
      : original.endTime);
  return {
    date: ex.newDate ?? original.date,
    startTime,
    endTime,
    roomId: ex.newRoomId ?? original.roomId,
    teacherId: ex.newTeacherId ?? original.teacherId,
  };
}

function differences(a: SessionValues, b: SessionValues): SessionChange[] {
  const out: SessionChange[] = [];
  if (a.date !== b.date) out.push('date');
  if (a.startTime !== b.startTime || a.endTime !== b.endTime) out.push('time');
  if (a.roomId !== b.roomId) out.push('room');
  if (a.teacherId !== b.teacherId) out.push('teacher');
  return out;
}

const inRange = (day: string, from: string, to: string) => from <= day && day <= to;

/**
 * The sessions of the slots between `from` and `to` (both included), sorted by day, start time and id.
 *
 * - A session whose day is a holiday or a « pas de cours » day for its class does not exist.
 * - A cancelled session stays, as `cancelled`, on its original day.
 * - A moved session appears on its new day as `moved`; when the day changed, its original day also shows
 *   a `moved_from` trace, so « avant » stays visible. Either one is listed when its day is in the range.
 * - A substitute or a room change keeps the day and time and changes the teacher or the room.
 * Exceptions that match no session of the rule (an old date, a holiday added since) are ignored.
 */
export function expandTimetable<S extends SlotRule>(
  slots: readonly S[],
  exceptions: readonly SlotExceptionRule[],
  from: string,
  to: string,
  options: ExpandOptions = {},
): TimetableOccurrence<S>[] {
  const bySlot = new Map<string, Map<string, SlotExceptionRule>>();
  for (const ex of exceptions) {
    const map = bySlot.get(ex.slotId) ?? new Map<string, SlotExceptionRule>();
    map.set(ex.date, ex);
    bySlot.set(ex.slotId, map);
  }
  const out: TimetableOccurrence<S>[] = [];
  for (const slot of slots) {
    const exs = bySlot.get(slot.id) ?? new Map<string, SlotExceptionRule>();
    const days = new Set(slotDays(slot, from, to, options));
    // A session of another week moved into the range: its original day is outside it.
    for (const ex of exs.values()) {
      if (ex.newDate && inRange(ex.newDate, from, to) && slotRunsOn(slot, ex.date, options))
        days.add(ex.date);
    }
    for (const date of [...days].sort()) {
      const original = baseValues(slot, date);
      const ex = exs.get(date) ?? null;
      if (!ex) {
        out.push({
          key: `${slot.id}@${date}`,
          slot,
          originalDate: date,
          status: 'normal',
          exception: null,
          current: original,
          original,
          changes: [],
          movedTo: null,
        });
        continue;
      }
      const current = applyException(slot, ex);
      const changes = ex.kind === 'cancelled' ? [] : differences(original, current);
      if (ex.kind === 'cancelled') {
        if (inRange(date, from, to))
          out.push({
            key: `${slot.id}@${date}`,
            slot,
            originalDate: date,
            status: 'cancelled',
            exception: ex,
            current,
            original,
            changes,
            movedTo: null,
          });
        continue;
      }
      const status: OccurrenceStatus =
        ex.kind === 'moved' ? 'moved' : ex.kind === 'substitute' ? 'substitute' : 'room_change';
      if (inRange(current.date, from, to))
        out.push({
          key: `${slot.id}@${date}`,
          slot,
          originalDate: date,
          status,
          exception: ex,
          current,
          original,
          changes,
          movedTo: null,
        });
      if (ex.kind === 'moved' && current.date !== date && inRange(date, from, to))
        out.push({
          key: `${slot.id}@${date}:from`,
          slot,
          originalDate: date,
          status: 'moved_from',
          exception: ex,
          current: original,
          original,
          changes: [],
          movedTo: current,
        });
    }
  }
  return out.sort(
    (a, b) =>
      a.current.date.localeCompare(b.current.date) ||
      a.current.startTime.localeCompare(b.current.startTime) ||
      a.key.localeCompare(b.key),
  );
}

/** A session still takes its room, teacher and class (not cancelled, not the trace of a moved one). */
export function occupiesResources(o: Pick<TimetableOccurrence, 'status'>): boolean {
  return o.status !== 'cancelled' && o.status !== 'moved_from';
}

/* ------------------------------------------------------------------------------------------------
 * The occupancy index
 * ---------------------------------------------------------------------------------------------- */

/** Where an occupancy row comes from. */
export type OccupancySource = 'slot' | 'exception' | 'event';

/**
 * One row of the occupancy index: a room, a teacher and a class held during a time range. The database
 * refuses two rows that hold the same room, the same teacher or the same class at the same time, except
 * two rows of one class that carry the same non-null division key (groups of one division run in parallel).
 */
export interface OccupancyEntry {
  readonly source: OccupancySource;
  /** The session's original day for slot rows; the event's day for events. */
  readonly day: string;
  readonly roomId: string | null;
  readonly teacherId: string | null;
  readonly classId: string | null;
  readonly divisionKey: string | null;
  /** `YYYY-MM-DD HH:MM`, wall-clock time. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** For `exception` rows: the exception that produced them. */
  readonly exceptionId: string | null;
}

export const stamp = (day: string, time: string) => `${day} ${time}`;

/** The index rows of the sessions of one slot (cancelled sessions and traces hold nothing). */
export function occupancyEntries(
  occurrences: readonly TimetableOccurrence[],
  classId: string,
  divisionKey: string | null,
): OccupancyEntry[] {
  return occurrences.filter(occupiesResources).map((o) => ({
    source: o.exception ? 'exception' : 'slot',
    day: o.originalDate,
    roomId: o.current.roomId,
    teacherId: o.current.teacherId,
    classId,
    divisionKey,
    startsAt: stamp(o.current.date, o.current.startTime),
    endsAt: stamp(o.current.date, o.current.endTime),
    exceptionId: o.exception?.id ?? null,
  }));
}

/** Do two index rows clash? (The rule the exclusion constraints enforce, for tests and previews.) */
export function entriesClash(a: OccupancyEntry, b: OccupancyEntry): ('room' | 'teacher' | 'class')[] {
  if (!(a.startsAt < b.endsAt && b.startsAt < a.endsAt)) return [];
  const kinds: ('room' | 'teacher' | 'class')[] = [];
  if (a.roomId && a.roomId === b.roomId) kinds.push('room');
  if (a.teacherId && a.teacherId === b.teacherId) kinds.push('teacher');
  if (a.classId && a.classId === b.classId) {
    const sameDivision = a.divisionKey !== null && a.divisionKey === b.divisionKey;
    if (!sameDivision) kinds.push('class');
  }
  return kinds;
}

/* ------------------------------------------------------------------------------------------------
 * Hours per week
 * ---------------------------------------------------------------------------------------------- */

/** Hours a slot gives in an average week: a fortnightly slot counts half. */
export function weeklyHours(slot: Pick<SlotRule, 'startTime' | 'endTime' | 'weekParity'>): number {
  const hours = hoursBetween(slot.startTime, slot.endTime);
  return slot.weekParity ? hours / 2 : hours;
}

/* ------------------------------------------------------------------------------------------------
 * Validation shared by the form and the API
 * ---------------------------------------------------------------------------------------------- */

/** Problems with the fields of a slot (French messages), empty when it is fine. */
export function slotProblems(
  slot: Pick<SlotRule, 'weekday' | 'startTime' | 'endTime' | 'validFrom' | 'validTo'>,
): string[] {
  const out: string[] = [];
  if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6)
    out.push('Le jour doit être compris entre dimanche et samedi.');
  if (slot.endTime <= slot.startTime) out.push('La fin doit suivre le début.');
  if (slot.validTo < slot.validFrom) out.push('La fin de validité ne peut pas précéder le début.');
  else if (daysBetween(slot.validFrom, slot.validTo) > TIMETABLE_LIMITS.maxSpanDays)
    out.push('Une série ne peut pas dépasser une année.');
  return out;
}

/** « Dimanche 08:30 – 10:00 » */
export function slotLabel(slot: Pick<SlotRule, 'weekday' | 'startTime' | 'endTime'>): string {
  return `${WEEKDAY_LABELS[slot.weekday]} ${slot.startTime} – ${slot.endTime}`;
}

/**
 * Does this activity type belong in a laboratory? The TP of the platform does: the one rule about a named
 * type (everything else relies on flags), kept here so the API and the screens agree. Teachers' own types
 * never count.
 */
export function needsLab(type: { readonly isSystem: boolean; readonly code: string }): boolean {
  return type.isSystem && type.code === 'tp';
}

/** Problems with an exception's fields for its kind (French messages), empty when it is fine. */
export function exceptionProblems(e: {
  readonly kind: SlotExceptionKind;
  readonly newDate?: string | null;
  readonly newStart?: string | null;
  readonly newEnd?: string | null;
  readonly newRoomId?: string | null;
  readonly newTeacherId?: string | null;
}): string[] {
  const out: string[] = [];
  const time = !!e.newStart || !!e.newEnd;
  switch (e.kind) {
    case 'cancelled':
      if (e.newDate || time || e.newRoomId || e.newTeacherId)
        out.push('Une annulation ne change rien d’autre.');
      break;
    case 'moved':
      if (e.newTeacherId) out.push('Un déplacement ne change pas l’enseignant : choisissez un remplacement.');
      if (!e.newDate && !time) out.push('Indiquez le nouveau jour ou la nouvelle heure.');
      if (!!e.newStart !== !!e.newEnd) out.push('Indiquez l’heure de début et l’heure de fin.');
      else if (e.newStart && e.newEnd && e.newEnd <= e.newStart)
        out.push('La fin doit suivre le début.');
      break;
    case 'substitute':
      if (!e.newTeacherId) out.push('Choisissez l’enseignant qui remplace.');
      if (e.newDate || time || e.newRoomId) out.push('Un remplacement ne change que l’enseignant.');
      break;
    case 'room_change':
      if (!e.newRoomId) out.push('Choisissez la nouvelle salle.');
      if (e.newDate || time || e.newTeacherId) out.push('Un changement de salle ne change que la salle.');
      break;
  }
  return out;
}

/** The school's time zone: « today » for the timetable, whatever the browser's or the server's own zone. */
export const SCHOOL_TIME_ZONE = 'Africa/Cairo';

/** Today's date in Cairo as `YYYY-MM-DD` (sessions already held are never rewritten). */
export function schoolToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: SCHOOL_TIME_ZONE }).format(now);
}
