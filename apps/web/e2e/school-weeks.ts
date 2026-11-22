import { addDays, type PeriodDto, type SchoolYearDto, startOfWeek, type TimetableOccurrenceDto } from '@cdls/shared';
import { expect, type APIRequestContext } from '@playwright/test';
import { schoolToday } from './school';

/**
 * Dates for specs that need lessons: never « today + 28 », which lands in a holiday (the seeded winter break runs
 * 2026-12-20 to 2027-01-02) or after the year's end. The timetable of the running stack says which weeks have
 * lessons, so a spec passes on any day of the seeded year, the weekend and the holidays included.
 */

type Headers = { Authorization: string };

/** `value`, or a failed test that says what the stack lacks. */
function present<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`The stack has no ${what}.`);
  return value;
}

/** `teacherId=…`, `classId=…` or `roomId=…`: whose lessons count. */
export type Scope = `${'teacherId' | 'classId' | 'roomId'}=${string}`;

/** The occurrences endpoint answers at most 62 days at a time. */
const WINDOW = 56;
/** How far to look ahead (a school year is about 43 weeks). */
const HORIZON = 400;

async function occurrences(request: APIRequestContext, headers: Headers, scope: Scope, from: string, to: string) {
  const res = await request.get(`/api/timetable/occurrences?${scope}&from=${from}&to=${to}`, { headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as TimetableOccurrenceDto[];
}

/** The lessons that run as planned (no exception), by school week (its Sunday). */
async function weeksFrom(
  request: APIRequestContext,
  headers: Headers,
  scope: Scope,
  from: string,
  until: (weeks: Map<string, TimetableOccurrenceDto[]>) => boolean,
): Promise<Map<string, TimetableOccurrenceDto[]>> {
  const weeks = new Map<string, TimetableOccurrenceDto[]>();
  for (let start = from; start < addDays(from, HORIZON); start = addDays(start, WINDOW + 1)) {
    for (const o of await occurrences(request, headers, scope, start, addDays(start, WINDOW))) {
      if (o.status !== 'normal' || o.exceptionId) continue;
      const week = startOfWeek(o.originalDate);
      weeks.set(week, [...(weeks.get(week) ?? []), o]);
    }
    if (until(weeks)) break;
  }
  return weeks;
}

/**
 * The Sunday of the first school week after the week of `after` (default today: next week at the earliest, so
 * nothing changes in the week people are living) with at least `minLessons` planned lessons for `scope`. Only
 * the last week of the school year has no such week.
 */
export async function firstTeachingWeek(
  request: APIRequestContext,
  headers: Headers,
  scope: Scope,
  { after = schoolToday(), minLessons = 3 }: { after?: string; minLessons?: number } = {},
): Promise<string> {
  const from = addDays(startOfWeek(after), 7);
  const ok = (weeks: Map<string, TimetableOccurrenceDto[]>) => [...weeks].some(([w, l]) => w >= from && l.length >= minLessons);
  const weeks = await weeksFrom(request, headers, scope, from, ok);
  const found = [...weeks].filter(([w, l]) => w >= from && l.length >= minLessons).map(([w]) => w).sort()[0];
  return present(found, `a school week with ${minLessons} lessons for ${scope} after ${after}`);
}

/** Two school weeks that follow each other, both with lessons for `scope` (a weekly event shows on both). */
export async function twoTeachingWeeks(
  request: APIRequestContext,
  headers: Headers,
  scope: Scope,
  after = schoolToday(),
): Promise<[string, string]> {
  const from = addDays(startOfWeek(after), 7);
  const pair = (weeks: Map<string, TimetableOccurrenceDto[]>) =>
    [...weeks.keys()].sort().find((w) => w >= from && weeks.has(addDays(w, 7)));
  const weeks = await weeksFrom(request, headers, scope, from, (w) => !!pair(w));
  const first = present(pair(weeks), `two school weeks in a row with lessons for ${scope} after ${after}`);
  return [first, addDays(first, 7)];
}

/** A day of `week` with planned lessons for `scope` (the first one). */
export async function teachingDayOf(request: APIRequestContext, headers: Headers, scope: Scope, week: string): Promise<string> {
  const days = (await occurrences(request, headers, scope, week, addDays(week, 6)))
    .filter((o) => o.status === 'normal' && !o.exceptionId)
    .map((o) => o.originalDate)
    .sort();
  return present(days[0], `a day with lessons in the week of ${week}`);
}

/** The most recent school day with lessons for `scope`, today included; the first one ahead when the year has not started. */
export async function latestTeachingDay(request: APIRequestContext, headers: Headers, scope: Scope): Promise<string> {
  const today = schoolToday();
  for (let end = today; end > addDays(today, -HORIZON); end = addDays(end, -(WINDOW + 1))) {
    const days = (await occurrences(request, headers, scope, addDays(end, -WINDOW), end))
      .filter((o) => o.status === 'normal' && !o.exceptionId)
      .map((o) => o.originalDate)
      .sort();
    const last = days.at(-1);
    if (last) return last;
  }
  return teachingDayOf(request, headers, scope, await firstTeachingWeek(request, headers, scope, { after: addDays(today, -7), minLessons: 1 }));
}

/** Number of « Semaine suivante » clicks from the browser's week of today to the week of `day`. */
export function weeksAhead(day: string, today = schoolToday()): number {
  return Math.round((Date.parse(startOfWeek(day)) - Date.parse(startOfWeek(today))) / (7 * 86_400_000));
}

/** The open periods of the current year that every section shares (the seed's trimesters), by start. */
async function openPeriods(request: APIRequestContext, headers: Headers): Promise<PeriodDto[]> {
  const res = await request.get('/api/school-years', { headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  const current = ((await res.json()) as SchoolYearDto[]).find((y) => y.isCurrent);
  return (current?.periods ?? []).filter((p) => !p.closedAt && p.sectionId === null).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/**
 * Today when an open period covers it, else the first day of the next open period: the date of a test's graded
 * work (a gradable event needs a period, and the seeded terms leave the holidays between them out).
 */
export async function gradableDay(request: APIRequestContext, headers: Headers): Promise<string> {
  const today = schoolToday();
  const next = present((await openPeriods(request, headers)).find((p) => p.endsOn >= today), `an open period on or after ${today}`);
  return next.startsOn > today ? next.startsOn : today;
}

/** « Noter » dates its note today: true when an open period covers today (false in the holidays between terms). */
export async function todayIsGradable(request: APIRequestContext, headers: Headers): Promise<boolean> {
  return (await gradableDay(request, headers).catch(() => '')) === schoolToday();
}
