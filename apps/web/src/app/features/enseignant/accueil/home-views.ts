import {
  addDays,
  type CalendarDayDto,
  type OccurrenceDto,
  type PendingGradingDto,
  type RepeatedAbsenceDto,
  REPEATED_ABSENCE_WINDOW_DAYS,
  type TeacherSummaryDto,
  type TeacherSummaryHomeworkDto,
  type TeacherSummaryLessonDto,
  type TeacherSummaryPendingDto,
  type TeacherSummarySection,
  type TimetableOccurrenceDto,
  weekday,
} from '@cdls/shared';
import type { Snapshot } from '../../../shared/utils/block-state';
import { plural } from '../../../shared/utils/format';
import { closedDayOf, phaseOf, type SessionPhase, sessionsOfDay } from '../../timetable/day-sessions';
import { isStruck, shortDate } from '../../timetable/timetable-format';

/* ------------------------------------------------------------------------------------------------
 * The one summary call: what each block reads of it
 * ---------------------------------------------------------------------------------------------- */

/**
 * What a block reads of the page's one summary: the request's error (the whole answer failed), else an error
 * when any of the block's sections is named in `failed` (a half-read list would say « nothing to show »
 * wrongly), else its value while it is there.
 */
export function sectionSnapshot<T>(
  summary: Snapshot<TeacherSummaryDto>,
  sections: readonly TeacherSummarySection[],
  pick: (summary: TeacherSummaryDto) => T,
): Snapshot<T> {
  if (summary.error) return { error: summary.error, value: undefined };
  const value = summary.value;
  if (value === undefined) return { error: undefined, value: undefined };
  if (sections.some((s) => value.failed.includes(s))) return { error: new Error('Section failed'), value: undefined };
  return { error: undefined, value: pick(value) };
}

/**
 * What each block of the teacher's home shows, from the API's data: plain functions (Vitest checks them).
 * Each returns null when the block has nothing to show (its empty state).
 */

/* ------------------------------------------------------------------------------------------------
 * Mes cours aujourd'hui
 * ---------------------------------------------------------------------------------------------- */

export interface LessonItem {
  readonly session: TimetableOccurrenceDto;
  readonly phase: SessionPhase;
  /** Cancelled or moved away: written out, struck through, with no action. */
  readonly struck: boolean;
  /** The class in progress (highlighted). */
  readonly live: boolean;
  /** The teacher already saved the roll call for it (« Appel fait »). */
  readonly rollCallDone: boolean;
}

export interface LessonsView {
  readonly lessons: readonly LessonItem[];
  /** « 3 cours aujourd’hui ». */
  readonly lead: string;
}

/** Today's lessons of the teacher in time order, each with where it stands against the clock; null without any. */
export function lessonsView(list: readonly TeacherSummaryLessonDto[], today: string, now: string): LessonsView | null {
  const done = new Map(list.map((l) => [l.session.key, l.rollCallDone]));
  const lessons = sessionsOfDay(
    list.map((l) => l.session),
    today,
  ).map((session): LessonItem => {
    const struck = isStruck(session);
    const phase = phaseOf(session, now);
    return { session, phase, struck, live: !struck && phase === 'current', rollCallDone: !struck && (done.get(session.key) ?? false) };
  });
  if (!lessons.length) return null;
  const held = lessons.filter((l) => !l.struck).length;
  return { lessons, lead: held ? `${plural(held, 'cours', 'cours')} aujourd’hui` : 'Aucun cours n’a lieu aujourd’hui' };
}

/** What the empty block says: a holiday by its name, the week-end (Friday and Saturday), else a plain « no class ». */
export function lessonsEmptyText(days: readonly CalendarDayDto[], today: string): string {
  const closed = closedDayOf(days, today);
  if (closed) return `${closed.label}. Pas de cours aujourd’hui.`;
  const wd = weekday(today);
  if (wd === 5 || wd === 6) return 'C’est le week-end. Les cours reprennent dimanche.';
  return 'Pas de cours aujourd’hui dans votre emploi du temps.';
}

/* ------------------------------------------------------------------------------------------------
 * Notes à finir
 * ---------------------------------------------------------------------------------------------- */

export const GRADING_SHOWN = 4;

/** One class and subject the teacher grades, with its drafts, planned exams and half-entered marks. */
export interface PendingEntry {
  readonly choice: { readonly classId: string; readonly subjectId: string; readonly label: string };
  readonly pending: readonly PendingGradingDto[];
}

/** The summary's pending lists as the views read them. */
export function pendingEntries(list: readonly TeacherSummaryPendingDto[]): PendingEntry[] {
  return list.map((e) => ({ choice: { classId: e.classId, subjectId: e.subjectId, label: e.label }, pending: e.pending }));
}

export interface GradingItem {
  readonly eventId: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly title: string;
  /** « Première, Mathématiques · Jeu. 12 nov. » */
  readonly meta: string;
  /** « 18 / 27 » or « Aucune note saisie ». */
  readonly progress: string;
  /** « Brouillon », « Publiée en partie » or « Prévu ». */
  readonly state: string;
}

export interface GradingView {
  readonly items: readonly GradingItem[];
  /** All the notes to finish, shown or not. */
  readonly total: number;
  /** « et 3 autres », '' when everything is shown. */
  readonly more: string;
}

/** « 18 / 27 » while marks are being entered. */
export function progressText(p: Pick<PendingGradingDto, 'entered' | 'total'>): string {
  return p.entered === 0 ? 'Aucune note saisie' : `${p.entered} / ${p.total}`;
}

function stateOf(p: PendingGradingDto, today: string): string {
  if (p.published) return 'Publiée en partie';
  return p.entered === 0 && p.event.date > today ? 'Prévu' : 'Brouillon';
}

/** The notes to finish, newest first, with their progress; null when none is left. */
export function gradingView(entries: readonly PendingEntry[], today: string, count = GRADING_SHOWN): GradingView | null {
  const all = entries
    .flatMap(({ choice, pending }) => pending.map((p) => ({ choice, p })))
    .sort((a, b) => b.p.event.date.localeCompare(a.p.event.date) || a.p.event.id.localeCompare(b.p.event.id));
  if (!all.length) return null;
  const items = all.slice(0, count).map(
    ({ choice, p }): GradingItem => ({
      eventId: p.event.id,
      classId: choice.classId,
      subjectId: choice.subjectId,
      title: p.event.title,
      meta: `${choice.label} · ${shortDate(p.event.date)}`,
      progress: progressText(p),
      state: stateOf(p, today),
    }),
  );
  const hidden = all.length - items.length;
  return { items, total: all.length, more: hidden > 0 ? `et ${plural(hidden, 'autre')}` : '' };
}

/* ------------------------------------------------------------------------------------------------
 * Devoirs donnés
 * ---------------------------------------------------------------------------------------------- */

/** The homework the teacher gave that falls due soon, with the students who ticked it (chosen by the API). */
export type HomeworkRow = TeacherSummaryHomeworkDto;

/** « 12 élèves sur 27 l’ont fait » (or just the count when the class size is unknown). */
export function ticksLine(done: number, concerned: number | null): string {
  if (done === 0) return concerned ? `Aucun élève sur ${concerned} ne l’a fait` : 'Personne ne l’a encore fait';
  const who = plural(done, 'élève');
  return concerned ? `${who} sur ${concerned} l’${done > 1 ? 'ont' : 'a'} fait` : `${who} l’${done > 1 ? 'ont' : 'a'} fait`;
}

export function homeworkView(rows: readonly HomeworkRow[]): readonly HomeworkRow[] | null {
  return rows.length ? rows : null;
}

/** « Aujourd’hui », « Demain » or « Jeu. 12 nov. ». */
export function dueLabel(day: string, today: string): string {
  if (day === today) return 'Aujourd’hui';
  if (day === addDays(today, 1)) return 'Demain';
  return shortDate(day);
}

/* ------------------------------------------------------------------------------------------------
 * À surveiller
 * ---------------------------------------------------------------------------------------------- */

/** A note still unfinished after this many days is worth a look. */
export const LATE_AFTER_DAYS = 7;
export const LATE_SHOWN = 3;

export interface LateNote {
  readonly eventId: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly title: string;
  /** « Première, Mathématiques · Mar. 3 nov. » */
  readonly meta: string;
  /** « 18 / 27 » or « Aucune note saisie ». */
  readonly progress: string;
  /** Days since the work took place. */
  readonly daysAgo: number;
}

/** Whole days between two calendar days (`from` is not after `to`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Notes that took place at least a week ago and are still not finished, the oldest first. */
export function lateNotes(entries: readonly PendingEntry[], today: string, count = LATE_SHOWN): LateNote[] {
  return entries
    .flatMap(({ choice, pending }) => pending.map((p) => ({ choice, p })))
    .filter(({ p }) => p.event.date <= addDays(today, -LATE_AFTER_DAYS))
    .sort((a, b) => a.p.event.date.localeCompare(b.p.event.date) || a.p.event.id.localeCompare(b.p.event.id))
    .slice(0, count)
    .map(({ choice, p }) => ({
      eventId: p.event.id,
      classId: choice.classId,
      subjectId: choice.subjectId,
      title: p.event.title,
      meta: `${choice.label} · ${shortDate(p.event.date)}`,
      progress: progressText(p),
      daysAgo: daysBetween(p.event.date, today),
    }));
}

export interface WatchView {
  readonly late: readonly LateNote[];
  readonly tests: readonly OccurrenceDto[];
  readonly absences: readonly RepeatedAbsenceDto[];
}

/** Late notes, planned tests and students often absent; null when there is nothing to watch. */
export function watchView(
  late: readonly LateNote[],
  tests: readonly OccurrenceDto[],
  absences: readonly RepeatedAbsenceDto[] = [],
): WatchView | null {
  return late.length || tests.length || absences.length ? { late, tests, absences: absences.slice(0, ABSENCES_SHOWN) } : null;
}

export const ABSENCES_SHOWN = 3;

/** « 3 jours d’absence sur 30 jours, dernière le jeu. 12 nov. » */
export function absenceLine(a: Pick<RepeatedAbsenceDto, 'days' | 'lastDay'>): string {
  return `${plural(a.days, 'jour')} d’absence sur ${REPEATED_ABSENCE_WINDOW_DAYS} jours, dernière le ${shortDate(a.lastDay)}`;
}

/** « 18 / 27, donnée il y a 21 jours ». */
export function lateLine(note: Pick<LateNote, 'daysAgo' | 'progress'>): string {
  return `${note.progress}, donnée il y a ${plural(note.daysAgo, 'jour')}`;
}
