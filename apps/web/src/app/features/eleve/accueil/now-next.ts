import { type CalendarDayDto, CLOSED_DAY_TYPES, type TimetableOccurrenceDto, weekday } from '@cdls/shared';
import { clock } from '../../../shared/utils/format';
import { isStruck } from '../../timetable/timetable-format';

/**
 * What the « Maintenant » block says, from today's sessions and the time (both in Cairo). Plain functions,
 * so Vitest checks every case; the component only renders the result.
 */

/** Where a session of today stands against the clock. */
export const SESSION_PHASES = ['past', 'current', 'upcoming'] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

/** Why there is no class to show. */
export const QUIET_REASONS = ['weekend', 'closed', 'free', 'over'] as const;
export type QuietReason = (typeof QUIET_REASONS)[number];

export type NowState =
  | { readonly kind: 'current'; readonly session: TimetableOccurrenceDto }
  | { readonly kind: 'next'; readonly session: TimetableOccurrenceDto; readonly minutesUntil: number }
  | { readonly kind: 'quiet'; readonly reason: QuietReason; readonly label: string };

export interface DaySession {
  readonly session: TimetableOccurrenceDto;
  readonly phase: SessionPhase;
}

/** « 08:30 » → 510. */
export function minutesOf(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** The day's sessions by their current start time (a moved-away session keeps its old place in the row). */
export function sessionsOfDay(list: readonly TimetableOccurrenceDto[], today: string): TimetableOccurrenceDto[] {
  const timeOf = (o: TimetableOccurrenceDto) => (o.status === 'moved_from' ? o.original : o.current);
  return list
    .filter((o) => timeOf(o).date === today)
    .sort((a, b) => timeOf(a).startTime.localeCompare(timeOf(b).startTime) || a.key.localeCompare(b.key));
}

/** Past, current or upcoming: a session is current from its start up to (not including) its end. */
export function phaseOf(session: TimetableOccurrenceDto, now: string): SessionPhase {
  const values = session.status === 'moved_from' ? session.original : session.current;
  if (now >= values.endTime) return 'past';
  if (now >= values.startTime) return 'current';
  return 'upcoming';
}

/** The row of today's sessions with their phase. */
export function dayStrip(list: readonly TimetableOccurrenceDto[], today: string, now: string): DaySession[] {
  return sessionsOfDay(list, today).map((session) => ({ session, phase: phaseOf(session, now) }));
}

/** The closed day (holiday, no classes) of today, if any: the API already gives only those concerning the student. */
export function closedDayOf(days: readonly CalendarDayDto[], today: string): CalendarDayDto | null {
  return days.find((d) => CLOSED_DAY_TYPES.includes(d.type) && d.startsOn <= today && today <= d.endsOn) ?? null;
}

/**
 * The current class, else the next one today, else why there is none. Cancelled and moved-away sessions
 * never count as current or next (they stay in the row, struck through).
 */
export function nowState(
  list: readonly TimetableOccurrenceDto[],
  today: string,
  now: string,
  closed: CalendarDayDto | null = null,
): NowState {
  const held = sessionsOfDay(list, today).filter((o) => !isStruck(o));
  const current = held.find((o) => phaseOf(o, now) === 'current');
  if (current) return { kind: 'current', session: current };
  const next = held.find((o) => phaseOf(o, now) === 'upcoming');
  if (next) return { kind: 'next', session: next, minutesUntil: minutesOf(next.current.startTime) - minutesOf(now) };
  if (held.length) return { kind: 'quiet', reason: 'over', label: '' };
  if (closed) return { kind: 'quiet', reason: 'closed', label: closed.label };
  // Friday and Saturday: the school week runs Sunday to Thursday.
  const wd = weekday(today);
  if (wd === 5 || wd === 6) return { kind: 'quiet', reason: 'weekend', label: '' };
  return { kind: 'quiet', reason: 'free', label: '' };
}

/** « dans 12 min », « dans 1 h 05 », « dans 2 h ». */
export function untilLabel(minutes: number): string {
  if (minutes <= 0) return 'maintenant';
  if (minutes < 60) return `dans ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `dans ${h} h ${String(m).padStart(2, '0')}` : `dans ${h} h`;
}

/** The line above the subject: « En cours · fin à 10 h 00 », « Prochain cours · dans 12 min ». */
export function nowLead(state: NowState): string {
  switch (state.kind) {
    case 'current':
      return `En cours · fin à ${clock(state.session.current.endTime)}`;
    case 'next':
      return `Prochain cours · ${untilLabel(state.minutesUntil)}`;
    case 'quiet':
      return QUIET_TITLES[state.reason];
  }
}

const QUIET_TITLES: Readonly<Record<QuietReason, string>> = {
  over: 'Journée terminée',
  closed: 'Pas de cours aujourd’hui',
  weekend: 'C’est le week-end',
  free: 'Pas de cours aujourd’hui',
};

/** The calm sentence under the title when there is no class. */
export function quietText(reason: QuietReason, label: string): string {
  switch (reason) {
    case 'over':
      return 'Les cours d’aujourd’hui sont finis. Pensez à jeter un œil à vos devoirs.';
    case 'closed':
      return label ? `${label}. Bon repos.` : 'L’école est fermée aujourd’hui. Bon repos.';
    case 'weekend':
      return 'Les cours reprennent dimanche. Bon repos.';
    case 'free':
      return 'Aucun cours prévu pour votre classe aujourd’hui.';
  }
}

/** « Salle 12, Hany Mansour » for the class shown big (its room and teacher as they are now). */
export function placeLine(session: TimetableOccurrenceDto): string {
  return [session.current.roomName ?? '', session.current.teacherName].filter(Boolean).join(', ');
}
