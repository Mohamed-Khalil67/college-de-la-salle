import {
  addDays,
  type HomeworkDto,
  isAssessment,
  type OccurrenceDto,
  type PostDto,
  type ReportCardDto,
  type StudentAttendanceDto,
  type StudentGradeDto,
  type StudentGradesDto,
} from '@cdls/shared';
import { latestGrades, overallAverage } from '../shared/grades';

/**
 * What each block of the student's home shows, from the API's data: plain functions (Vitest checks them).
 * Each returns null when the block has nothing to show (its empty state).
 */

/** How far ahead « À faire » looks. */
export const TODO_DAYS = 14;
export const TODO_HOMEWORK = 4;
export const TODO_TESTS = 3;

export interface TodoView {
  readonly homework: readonly HomeworkDto[];
  readonly tests: readonly OccurrenceDto[];
}

/**
 * The next homework (done or not, by due date: ticking one never moves it) and the tests and exams of the
 * next two weeks, soonest first.
 */
export function todoView(
  homework: readonly HomeworkDto[],
  events: readonly OccurrenceDto[],
  today: string,
): TodoView | null {
  const until = addDays(today, TODO_DAYS);
  const nextHomework = homework
    .filter((h) => h.event.date >= today && h.event.date <= until)
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''))
    .slice(0, TODO_HOMEWORK);
  const tests = events
    .filter((o) => isAssessment(o.event.type) && o.day >= today && o.day <= until)
    .sort((a, b) => a.day.localeCompare(b.day) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''))
    .slice(0, TODO_TESTS);
  return nextHomework.length || tests.length ? { homework: nextHomework, tests } : null;
}

export interface GradesView {
  /** Overall average of the term, as on the report card; null before the first grade. */
  readonly overall: number | null;
  readonly latest: readonly StudentGradeDto[];
  /** The term's report card has been published to the student. */
  readonly reportCardPublished: boolean;
}

export function gradesView(
  grades: StudentGradesDto,
  reportCards: readonly ReportCardDto[],
  periodId: string | null,
  count = 3,
): GradesView | null {
  const latest = latestGrades(grades, count);
  const reportCardPublished = reportCards.some((c) => c.publishedAt !== null && (periodId === null || c.periodId === periodId));
  if (!latest.length && !reportCardPublished) return null;
  return { overall: overallAverage(grades.subjects), latest, reportCardPublished };
}

export interface AbsencesView {
  /** Absences, excused or not. */
  readonly absences: number;
  readonly late: number;
  readonly latest: StudentAttendanceDto;
}

/** The term's absences and late arrivals (the API lists them newest first). */
export function absencesView(list: readonly StudentAttendanceDto[]): AbsencesView | null {
  const records = list.filter((a) => a.record.status !== 'present');
  const latest = [...records].sort((a, b) => b.record.date.localeCompare(a.record.date))[0];
  if (!latest) return null;
  return {
    absences: records.filter((a) => a.record.status === 'absent' || a.record.status === 'excused').length,
    late: records.filter((a) => a.record.status === 'late').length,
    latest,
  };
}

/** The latest announcements, newest first. */
export function newsView(posts: readonly PostDto[], count = 2): readonly PostDto[] | null {
  const latest = [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, count);
  return latest.length ? latest : null;
}
