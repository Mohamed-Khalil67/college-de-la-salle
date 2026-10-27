import {
  addDays,
  type OccurrenceStatus,
  type SessionValuesDto,
  type TimetableOccurrenceDto,
  weekday,
  weekDays,
  WEEKDAY_LABELS,
} from '@cdls/shared';
import { capitalize, dayTitle, timeSpan } from '../../shared/utils/format';
import type { BadgeTone } from '../../shared/ui';

/**
 * Display helpers for the timetable screens (student, teacher, administration). Plain functions, so Vitest
 * can test them; the components call them from their templates.
 */

/** The label of a status; '' when nothing changed. The words carry the meaning, colour only supports it. */
export const STATUS_LABELS: Readonly<Record<OccurrenceStatus, string>> = {
  normal: '',
  cancelled: 'Annulée',
  moved: 'Déplacée',
  moved_from: 'Déplacée',
  substitute: 'Remplacement',
  room_change: 'Salle changée',
};

export const STATUS_TONES: Readonly<Record<OccurrenceStatus, BadgeTone>> = {
  normal: 'neutral',
  cancelled: 'danger',
  moved: 'warning',
  moved_from: 'warning',
  substitute: 'info',
  room_change: 'info',
};

/** A session that no longer takes place where the rule puts it: shown struck through. */
export const isStruck = (o: Pick<TimetableOccurrenceDto, 'status'>): boolean =>
  o.status === 'cancelled' || o.status === 'moved_from';

/** « 8 h 30 – 10 h 00 » */
export const rangeOf = (v: Pick<SessionValuesDto, 'startTime' | 'endTime'>): string =>
  timeSpan(v.startTime, v.endTime);

/** « Mar. 3 nov. » short day, with a capital. */
const SHORT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const shortDate = (day: string): string => capitalize(SHORT.format(new Date(`${day}T12:00:00Z`)));

const whenOf = (v: SessionValuesDto): string => `${shortDate(v.date)}, ${rangeOf(v)}`;

/**
 * The « avant / maintenant » sentences of a changed session, written out (never colour alone):
 * « Avant : Mar. 3 nov., 8 h 30 – 10 h 00. Maintenant : Jeu. 5 nov., 14 h 00 – 15 h 30. »
 */
export function changeLines(o: TimetableOccurrenceDto): string[] {
  const lines: string[] = [];
  if (o.status === 'cancelled') lines.push('Cette séance n’a pas lieu.');
  if (o.status === 'moved_from' && o.movedTo)
    lines.push(`Déplacée au ${shortDate(o.movedTo.date)}, ${rangeOf(o.movedTo)}.`);
  if (o.status !== 'moved_from' && (o.changes.includes('date') || o.changes.includes('time'))) {
    lines.push(`Avant : ${whenOf(o.original)}. Maintenant : ${whenOf(o.current)}.`);
  }
  if (o.status !== 'cancelled' && o.status !== 'moved_from') {
    if (o.changes.includes('room'))
      lines.push(`Salle : avant ${o.original.roomName ?? 'aucune'}, maintenant ${o.current.roomName ?? 'aucune'}.`);
    if (o.changes.includes('teacher'))
      lines.push(`Enseignant : avant ${o.original.teacherName}, maintenant ${o.current.teacherName}.`);
  }
  if (o.reason) lines.push(`Motif : ${o.reason}`);
  return lines;
}

/** « Mathématiques », or « Mathématiques (TP) » when it is not a plain lesson. */
export function sessionTitle(o: Pick<TimetableOccurrenceDto, 'subjectName' | 'activityType'>): string {
  return o.activityType.code === 'cours' ? o.subjectName : `${o.subjectName} (${o.activityType.label})`;
}

/** One line for assistive technology and tooltips: « Dimanche 8 h 30 – 10 h 00, Mathématiques, Salle 12, Hany Mansour, annulée ». */
export function sessionSummary(o: TimetableOccurrenceDto, withClass = false): string {
  return [
    `${dayTitle(o.current.date)} ${rangeOf(o.current)}`,
    sessionTitle(o),
    withClass ? o.classLabel : '',
    o.current.roomName ?? '',
    o.current.teacherName,
    STATUS_LABELS[o.status].toLowerCase(),
  ]
    .filter(Boolean)
    .join(', ');
}

export interface DaySessions {
  readonly day: string;
  readonly items: readonly TimetableOccurrenceDto[];
}

/** Sessions of the week by day (their current day), Sunday to Thursday always, other days when they have some. */
export function byDayOfWeek(day: string, list: readonly TimetableOccurrenceDto[]): DaySessions[] {
  return weekDays(day)
    .map((d) => ({
      day: d,
      items: list
        .filter((o) => o.current.date === d)
        .sort((a, b) => a.current.startTime.localeCompare(b.current.startTime) || a.key.localeCompare(b.key)),
    }))
    .filter((c) => c.items.length > 0 || (weekday(c.day) !== 5 && weekday(c.day) !== 6));
}

export interface TimeBand {
  readonly start: string;
  readonly end: string;
}

/** The distinct time ranges of the sessions, earliest first (rows of the read-only table). */
export function timeBands(list: readonly TimetableOccurrenceDto[]): TimeBand[] {
  const seen = new Map<string, TimeBand>();
  for (const o of list)
    seen.set(`${o.current.startTime}-${o.current.endTime}`, { start: o.current.startTime, end: o.current.endTime });
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** The standard hours of the school day, as the grid's empty rows (start and end). */
export const SCHOOL_PERIODS: readonly TimeBand[] = [
  { start: '08:00', end: '09:00' },
  { start: '09:00', end: '10:00' },
  { start: '10:15', end: '11:15' },
  { start: '11:15', end: '12:15' },
  { start: '12:45', end: '13:45' },
  { start: '13:45', end: '14:45' },
  { start: '14:45', end: '15:45' },
];

/** The grid rows: the standard hours plus any other start time that has a session, by start time. */
export function gridRows(list: readonly TimetableOccurrenceDto[]): TimeBand[] {
  const rows = new Map(SCHOOL_PERIODS.map((p) => [p.start, p]));
  for (const o of list) if (!rows.has(o.current.startTime)) rows.set(o.current.startTime, { start: o.current.startTime, end: o.current.endTime });
  return [...rows.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** The school week's days for the grid: Sunday to Thursday. */
export function schoolDays(day: string): string[] {
  return weekDays(day).slice(0, 5);
}

/** « Dimanche » */
export const weekdayName = (wd: number): string => WEEKDAY_LABELS[wd] ?? '';

/** The Sunday-first week containing `day`, as the range the API takes. */
export function weekWindow(day: string): { readonly from: string; readonly to: string } {
  const days = weekDays(day);
  return { from: days[0]!, to: days[6]! };
}

export const shiftDays = addDays;
