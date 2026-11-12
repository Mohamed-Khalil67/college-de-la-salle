import { type CalendarDayDto, type TimetableOccurrenceDto, weekday } from '@cdls/shared';
import { clock } from '../../../shared/utils/format';
import { closedDayOf, minutesOf, phaseOf, type SessionPhase, sessionsOfDay } from '../../timetable/day-sessions';
import { isStruck } from '../../timetable/timetable-format';

export {
  closedDayOf,
  minutesOf,
  phaseOf,
  SESSION_PHASES,
  type SessionPhase,
  sessionsOfDay,
} from '../../timetable/day-sessions';

/**
 * What the « Maintenant » block says, from today's sessions and the time (both in Cairo). Plain functions,
 * so Vitest checks every case; the component only renders the result.
 */

/** Why there is no class to show. */
export const QUIET_REASONS = ['weekend', 'closed', 'free', 'over', 'cancelled'] as const;
export type QuietReason = (typeof QUIET_REASONS)[number];

export type NowState =
  | { readonly kind: 'current'; readonly session: TimetableOccurrenceDto }
  | { readonly kind: 'next'; readonly session: TimetableOccurrenceDto; readonly minutesUntil: number }
  | { readonly kind: 'quiet'; readonly reason: QuietReason; readonly label: string };

export interface DaySession {
  readonly session: TimetableOccurrenceDto;
  readonly phase: SessionPhase;
}

/** The row of today's sessions with their phase. */
export function dayStrip(list: readonly TimetableOccurrenceDto[], today: string, now: string): DaySession[] {
  return sessionsOfDay(list, today).map((session) => ({ session, phase: phaseOf(session, now) }));
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
  // Classes exist today but none takes place: say so, the row below shows them struck through.
  if (sessionsOfDay(list, today).length) return { kind: 'quiet', reason: 'cancelled', label: '' };
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
  cancelled: 'Cours annulés aujourd’hui',
  closed: 'Pas de cours aujourd’hui',
  weekend: 'C’est le week-end',
  free: 'Pas de cours aujourd’hui',
};

/** The calm sentence under the title when there is no class. */
export function quietText(reason: QuietReason, label: string): string {
  switch (reason) {
    case 'over':
      return 'Les cours d’aujourd’hui sont finis. Pensez à jeter un œil à vos devoirs.';
    case 'cancelled':
      return 'Les cours de la journée n’ont pas lieu. Le détail est ci-dessous.';
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

export interface NowView {
  readonly state: NowState;
  /** « En cours · fin à 10 h 00 », « Prochain cours · dans 12 min », « Journée terminée »… */
  readonly lead: string;
  /** The calm sentence when there is no class to show; '' otherwise. */
  readonly quiet: string;
  /** Today's sessions in a row; empty on a closed day (the holiday says it all). */
  readonly strip: readonly DaySession[];
}

/** Everything the « Maintenant » block shows. */
export function nowView(
  list: readonly TimetableOccurrenceDto[],
  days: readonly CalendarDayDto[],
  today: string,
  now: string,
): NowView {
  const state = nowState(list, today, now, closedDayOf(days, today));
  const quiet = state.kind === 'quiet' ? quietText(state.reason, state.label) : '';
  const closed = state.kind === 'quiet' && state.reason === 'closed';
  return { state, lead: nowLead(state), quiet, strip: closed ? [] : dayStrip(list, today, now) };
}
