/**
 * Pure rules of the teacher summary (GET /teacher/summary): which homework and tests the home page lists, which
 * students count as « often absent », and whether a session's roll call was taken. Decorator-free: the API
 * computes with it and the web shows the result.
 */
import type { OccurrenceDto } from './api.js';
import { addDays, isAssessment } from './calendar.js';

/** How far ahead the homework given and the tests planned are read. */
export const TEACHER_HOMEWORK_DAYS = 14;
export const TEACHER_TESTS_DAYS = 14;
/** How many of each the home page lists. */
export const TEACHER_HOMEWORK_SHOWN = 4;
export const TEACHER_TESTS_SHOWN = 3;

/**
 * A student is « often absent » with this many distinct days of unexcused absence in the last
 * REPEATED_ABSENCE_WINDOW_DAYS days (today included). Excused absences and late arrivals do not count.
 */
export const REPEATED_ABSENCE_MIN_DAYS = 3;
export const REPEATED_ABSENCE_WINDOW_DAYS = 30;
/** The most students the summary lists (worst first). */
export const REPEATED_ABSENCE_MAX = 10;

/** The homework the teacher gave that falls due from today on, soonest first. */
export function givenHomework(
  list: readonly OccurrenceDto[],
  teacherId: string,
  today: string,
  count: number = TEACHER_HOMEWORK_SHOWN,
): OccurrenceDto[] {
  return list
    .filter(
      (o) =>
        o.event.type.homework &&
        o.event.authorId === teacherId &&
        o.day >= today &&
        o.day <= addDays(today, TEACHER_HOMEWORK_DAYS),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.key.localeCompare(b.key))
    .slice(0, count);
}

/** Exams and tests of the given classes in the next two weeks (planned by anyone), soonest first. */
export function upcomingTests(
  list: readonly OccurrenceDto[],
  classIds: ReadonlySet<string>,
  today: string,
  count: number = TEACHER_TESTS_SHOWN,
): OccurrenceDto[] {
  return list
    .filter(
      (o) =>
        isAssessment(o.event.type) &&
        o.day >= today &&
        o.day <= addDays(today, TEACHER_TESTS_DAYS) &&
        o.event.classId !== null &&
        classIds.has(o.event.classId),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.key.localeCompare(b.key))
    .slice(0, count);
}

/** One recorded unexcused absence of a student in a class, on a day. */
export interface AbsenceRecord {
  readonly studentId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly classId: string;
  readonly day: string;
}

export interface AbsenceTally {
  readonly studentId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly classId: string;
  readonly days: number;
  readonly lastDay: string;
}

/** The first day the absence window covers (the window ends today). */
export function absenceWindowStart(today: string): string {
  return addDays(today, -(REPEATED_ABSENCE_WINDOW_DAYS - 1));
}

/**
 * The students with REPEATED_ABSENCE_MIN_DAYS or more distinct days of absence in the window, most days first,
 * then the most recent, then by name. Several lessons missed on one day are one day.
 */
export function repeatedAbsences(
  records: readonly AbsenceRecord[],
  today: string,
  count: number = REPEATED_ABSENCE_MAX,
): AbsenceTally[] {
  const from = absenceWindowStart(today);
  const byStudent = new Map<string, { record: AbsenceRecord; days: Set<string> }>();
  for (const r of records) {
    if (r.day < from || r.day > today) continue;
    const seen = byStudent.get(r.studentId);
    if (seen) seen.days.add(r.day);
    else byStudent.set(r.studentId, { record: r, days: new Set([r.day]) });
  }
  return [...byStudent.values()]
    .filter(({ days }) => days.size >= REPEATED_ABSENCE_MIN_DAYS)
    .map(({ record, days }) => ({
      studentId: record.studentId,
      firstName: record.firstName,
      lastName: record.lastName,
      classId: record.classId,
      days: days.size,
      lastDay: [...days].sort().at(-1) ?? record.day,
    }))
    .sort(
      (a, b) =>
        b.days - a.days ||
        b.lastDay.localeCompare(a.lastDay) ||
        a.lastName.localeCompare(b.lastName, 'fr') ||
        a.firstName.localeCompare(b.firstName, 'fr'),
    )
    .slice(0, count);
}

/** A session, or a class's timed event on which a roll call was saved: a class and a time span. */
export interface TimedClassSlot {
  readonly classId: string;
  /** HH:MM. */
  readonly startTime: string;
  readonly endTime: string;
}

/** True when the two spans share some time (touching ends do not). */
function overlaps(a: TimedClassSlot, b: TimedClassSlot): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/** The roll of a session was taken when a roll call exists for an event of its class that overlaps its time. */
export function rollCallDone(session: TimedClassSlot, taken: readonly TimedClassSlot[]): boolean {
  return taken.some((t) => t.classId === session.classId && overlaps(session, t));
}

/** At most this many class-and-subject lookups run at once for a teacher's « Noter » section of the summary. */
export const SUMMARY_PENDING_CONCURRENCY = 4;

/**
 * `items.map(work)` with at most `limit` calls in flight, results in the order of the items. The first failure
 * rejects the whole call; no new call starts after it. A `limit` below 1 runs one at a time.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const done: Array<readonly [number, R]> = [];
  // One iterator shared by the lanes: each item is handed out once.
  const queue = items.entries();
  let failed = false;
  const lane = async (): Promise<void> => {
    for (const [index, item] of queue) {
      if (failed) return;
      try {
        done.push([index, await work(item, index)]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const lanes = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  return done.sort((a, b) => a[0] - b[0]).map(([, result]) => result);
}
