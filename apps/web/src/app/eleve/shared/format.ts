import {
  type AttendanceStatus,
  type DueState,
  dueState,
  FORMAT_MARK,
  type ActivityTypeSummary,
  type EventDto,
  isAssessment,
  longDay,
  matiereName,
  type PeriodDto,
  type SchoolYearDto,
} from '@cdls/shared';
import type { BadgeTone } from '../../ui';

/**
 * Display helpers for the student and teacher spaces. Plain functions (no Angular) so Vitest can
 * test them; components call them from templates through small wrappers.
 */

const ONE_DECIMAL = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const CLOCK = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit' });

/** « Mardi 20 octobre » */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « Mardi 20 octobre » for a YYYY-MM-DD day. */
export function dayTitle(day: string): string {
  return capitalize(longDay(day));
}

/** « 20 octobre 2026 » for a YYYY-MM-DD day. */
export function longDate(day: string): string {
  return LONG_DATE.format(new Date(`${day}T12:00:00Z`));
}

/** « 08:30 » → « 8 h 30 »; '' for none. */
export function clock(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':');
  return `${Number(h)} h ${m}`;
}

/** « 8 h 30 – 10 h 00 », « 8 h 30 » or « Toute la journée ». */
export function timeSpan(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return 'Toute la journée';
  return end ? `${clock(start)} – ${clock(end)}` : clock(start);
}

/** « 10 h 42 » for a Date (the save status of the grade grid). */
export function clockOf(date: Date): string {
  return CLOCK.format(date).replace(':', ' h ');
}

/** A mark as typed by teachers: « 12,5 », « 16 ». */
export function mark(value: number): string {
  return FORMAT_MARK.format(value);
}

/** An average with one decimal (« 14,0 »), or « – » when there is none. */
export function average(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '–' : ONE_DECIMAL.format(value);
}

/** Subject name for a stored id; '' for none. */
export function subjectName(id: string | null | undefined): string {
  return id ? matiereName(id) : '';
}

export function kindLabel(type: Pick<ActivityTypeSummary, 'label'>): string {
  return type.label;
}

/** Exams and tests stand out in the week view (the shared flag rule: graded, not homework, not weekly). */
export { isAssessment };

/** Where an event takes place: its room of the school, else the free-text place. */
export function whereOf(event: Pick<EventDto, 'roomName' | 'place'>): string {
  return event.roomName ?? event.place;
}

export interface DueBadge {
  readonly label: string;
  readonly tone: BadgeTone;
}

/** The badge next to a homework item, or null when the due date is far enough. */
export function dueBadge(due: string, today: string, done: boolean): DueBadge | null {
  if (done) return null;
  const labels: Record<DueState, DueBadge | null> = {
    overdue: { label: 'En retard', tone: 'danger' },
    today: { label: 'Aujourd’hui', tone: 'warning' },
    soon: { label: dueSoonLabel(due, today), tone: 'info' },
    later: null,
  };
  return labels[dueState(due, today)];
}

function dueSoonLabel(due: string, today: string): string {
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return days === 1 ? 'Demain' : `Dans ${days} jours`;
}

export const ATTENDANCE_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  present: 'Présent',
  absent: 'Absent',
  late: 'En retard',
  excused: 'Excusé',
};

export const ATTENDANCE_TONES: Readonly<Record<AttendanceStatus, BadgeTone>> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'neutral',
};

/** « 1 absence », « 3 absences » */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** The current school year, or the latest one. */
export function currentYear(years: readonly SchoolYearDto[]): SchoolYearDto | null {
  return years.find((y) => y.isCurrent) ?? years.at(-1) ?? null;
}

/** The term containing `day`, else the last term that started before it, else the first one. */
export function termOf(terms: readonly PeriodDto[], day: string): PeriodDto | null {
  const sorted = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return (
    sorted.find((t) => t.startsOn <= day && day <= t.endsOn) ??
    sorted.filter((t) => t.startsOn <= day).at(-1) ??
    sorted[0] ??
    null
  );
}
