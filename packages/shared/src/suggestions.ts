import type {
  RoomKind,
  TimetableRoomSuggestionDto,
  TimetableSuggestionTarget,
  TimetableTimeSuggestionDto,
} from './api.js';
import { addDays, longDay, weekday } from './calendar.js';
import { minutesOf, shiftTime, WEEKDAY_LABELS } from './timetable.js';

/**
 * Ways out of a hard timetable conflict: the candidates (rooms, times) and their order. Pure: the API
 * finds which candidates are free with one query over the occupancy index, then ranks them here.
 */

/** At most this many suggestions of each kind. */
export const TIMETABLE_SUGGESTION_LIMITS = { rooms: 3, times: 3 } as const;

/** The school day: no suggestion starts before or ends after it. */
export const SCHOOL_DAY_HOURS = { start: '07:30', end: '17:00' } as const;

/** Step of the candidate times when the year has no timetable yet to learn its periods from. */
const FALLBACK_STEP_MINUTES = 30;

export interface TimeRange {
  readonly startTime: string;
  readonly endTime: string;
}

export interface DayHours {
  readonly start: string;
  readonly end: string;
}

/**
 * Times a session of `minutes` may take: it starts where a period of the year's timetable starts and ends
 * where one ends (so a two-hour block never straddles the break), inside the school day. When the length
 * fits no pair of periods, any period start will do; with no timetable at all, every half hour.
 */
export function periodTimes(
  slots: readonly TimeRange[],
  minutes: number,
  hours: DayHours = SCHOOL_DAY_HOURS,
): TimeRange[] {
  const inDay = (start: number) =>
    start >= minutesOf(hours.start) && start + minutes <= minutesOf(hours.end);
  const starts = [...new Set(slots.map((s) => minutesOf(s.startTime)))]
    .filter(inDay)
    .sort((a, b) => a - b);
  const ends = new Set(slots.map((s) => minutesOf(s.endTime)));
  const range = (start: number): TimeRange => {
    const startTime = shiftTime('00:00', start);
    return { startTime, endTime: shiftTime(startTime, minutes) };
  };
  const aligned = starts.filter((s) => ends.has(s + minutes));
  if (aligned.length) return aligned.map(range);
  if (starts.length) return starts.map(range);
  const out: TimeRange[] = [];
  for (let s = minutesOf(hours.start); inDay(s); s += FALLBACK_STEP_MINUTES) out.push(range(s));
  return out;
}

export interface SessionPlace extends TimeRange {
  readonly date: string;
}

export interface SessionCandidateOptions {
  /** School days of the week (0 = Sunday). */
  readonly weekdays: readonly number[];
  readonly times: readonly TimeRange[];
  /** Today and the time now, in the school's zone: nothing is suggested before them. */
  readonly today: string;
  readonly now: string;
  /** False on a holiday or a day without classes for the class. */
  readonly isOpen: (day: string) => boolean;
}

/**
 * Other places for one session in the week (Sunday first) of `wanted`, nearest first: same day before
 * other days, then the smallest shift. The wanted place itself is left out.
 */
export function sessionCandidates(
  wanted: SessionPlace,
  options: SessionCandidateOptions,
): SessionPlace[] {
  const sunday = addDays(wanted.date, -weekday(wanted.date));
  const out: SessionPlace[] = [];
  for (const wd of options.weekdays) {
    const date = addDays(sunday, wd);
    if (date < options.today || !options.isOpen(date)) continue;
    for (const t of options.times) {
      if (date === options.today && t.startTime < options.now) continue;
      if (date === wanted.date && t.startTime === wanted.startTime && t.endTime === wanted.endTime)
        continue;
      out.push({ date, ...t });
    }
  }
  // One week, Sunday first: the weekday is the day's place in it.
  const day = weekday(wanted.date);
  return out.sort((a, b) => compareByDistance(wanted, day, a, weekday(a.date), b, weekday(b.date)));
}

export interface SeriesPlace extends TimeRange {
  readonly weekday: number;
}

/** Other places for a weekly rule on the week grid, nearest first; the wanted place itself is left out. */
export function seriesCandidates(
  wanted: SeriesPlace,
  options: Pick<SessionCandidateOptions, 'weekdays' | 'times'>,
): SeriesPlace[] {
  const out: SeriesPlace[] = [];
  for (const wd of options.weekdays)
    for (const t of options.times)
      if (wd !== wanted.weekday || t.startTime !== wanted.startTime || t.endTime !== wanted.endTime)
        out.push({ weekday: wd, ...t });
  return out.sort((a, b) => compareByDistance(wanted, wanted.weekday, a, a.weekday, b, b.weekday));
}

/** Minutes between two places of one week: a whole day counts more than any shift inside a day. */
function distance(wanted: TimeRange, wantedDay: number, p: TimeRange, day: number): number {
  return (
    Math.abs(day - wantedDay) * 24 * 60 +
    Math.abs(minutesOf(p.startTime) - minutesOf(wanted.startTime))
  );
}

function compareByDistance(
  wanted: TimeRange,
  wantedDay: number,
  a: TimeRange,
  aDay: number,
  b: TimeRange,
  bDay: number,
): number {
  return (
    distance(wanted, wantedDay, a, aDay) - distance(wanted, wantedDay, b, bDay) ||
    aDay - bDay ||
    a.startTime.localeCompare(b.startTime)
  );
}

export interface RoomCandidate {
  readonly id: string;
  readonly name: string;
  readonly capacity: number | null;
  readonly kind: RoomKind;
}

/**
 * The room kinds that suit the session: a laboratory for a TP, else the kind of the room asked for (a
 * gym stays a gym), else a classroom.
 */
export function compatibleRoomKinds(need: {
  readonly lab: boolean;
  readonly requestedKind: RoomKind | null;
}): RoomKind[] {
  if (need.lab) return ['lab'];
  return [need.requestedKind ?? 'classroom'];
}

/**
 * Free rooms that suit the session, best first: of a compatible kind, seating `seats` (a room of unknown
 * capacity is kept, after the others), the smallest that fits first, then by name.
 */
export function rankRooms(
  rooms: readonly RoomCandidate[],
  need: { readonly seats: number | null; readonly kinds: readonly RoomKind[] },
): RoomCandidate[] {
  const seats = need.seats ?? 0;
  return rooms
    .filter((r) => need.kinds.includes(r.kind) && (r.capacity === null || r.capacity >= seats))
    .sort(
      (a, b) =>
        Number(a.capacity === null) - Number(b.capacity === null) ||
        (a.capacity ?? 0) - (b.capacity ?? 0) ||
        a.name.localeCompare(b.name, 'fr'),
    );
}

/** « Salle 14 (32 places) » */
export function roomSuggestion(
  target: TimetableSuggestionTarget,
  room: RoomCandidate,
): TimetableRoomSuggestionDto {
  return {
    kind: 'room',
    target,
    roomId: room.id,
    roomName: room.name,
    capacity: room.capacity,
    roomKind: room.kind,
    label: room.capacity === null ? room.name : `${room.name} (${room.capacity} places)`,
  };
}

/** « mardi 3 novembre, 10:15 – 11:15 » for a session, « le mardi, 10:15 – 11:15 » for a series. */
export function timeSuggestion(place: SessionPlace | SeriesPlace): TimetableTimeSuggestionDto {
  const hours = `${place.startTime} – ${place.endTime}`;
  if ('date' in place)
    return {
      kind: 'time',
      target: 'session',
      date: place.date,
      weekday: weekday(place.date),
      startTime: place.startTime,
      endTime: place.endTime,
      label: `${longDay(place.date)}, ${hours}`,
    };
  return {
    kind: 'time',
    target: 'series',
    date: null,
    weekday: place.weekday,
    startTime: place.startTime,
    endTime: place.endTime,
    label: `le ${(WEEKDAY_LABELS[place.weekday] ?? '').toLowerCase()}, ${hours}`,
  };
}
