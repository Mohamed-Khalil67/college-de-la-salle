import { type CalendarDayDto, CLOSED_DAY_TYPES, type TimetableOccurrenceDto } from '@cdls/shared';

/**
 * Where the sessions of a day stand against the clock, shared by the student's « Maintenant » and the
 * teacher's « Mes cours aujourd’hui ». Plain functions (Vitest checks them through `now-next.spec.ts`).
 */

/** Where a session of today stands against the clock. */
export const SESSION_PHASES = ['past', 'current', 'upcoming'] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

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

/** The closed day (holiday, no classes) of today, if any: the API already gives only those concerning the user. */
export function closedDayOf(days: readonly CalendarDayDto[], today: string): CalendarDayDto | null {
  return days.find((d) => CLOSED_DAY_TYPES.includes(d.type) && d.startsOn <= today && today <= d.endsOn) ?? null;
}

/** Past, current or upcoming: a session is current from its start up to (not including) its end. */
export function phaseOf(session: TimetableOccurrenceDto, now: string): SessionPhase {
  const values = session.status === 'moved_from' ? session.original : session.current;
  if (now >= values.endTime) return 'past';
  if (now >= values.startTime) return 'current';
  return 'upcoming';
}
