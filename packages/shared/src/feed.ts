import {
  addDays,
  type CalendarEvent,
  type Closure,
  icsText,
  longDay,
  occurrences,
  isWeekly,
} from './calendar.js';
import { SCHOOL_TIME_ZONE, type TimetableOccurrence } from './timetable.js';

/**
 * « Synchroniser mon agenda »: a personal iCalendar feed that Google Agenda, Apple Calendrier and Outlook
 * subscribe to. The feed is rebuilt on every request from the real sessions (exceptions applied), the
 * one-off events, exams and homework that concern the user, and the school's closed days. Each entry
 * keeps the same UID from one request to the next and a SEQUENCE that grows when it changes, so calendar
 * apps update an entry instead of adding a second one.
 *
 * Pure functions: the API gathers the rows, this module turns them into text.
 */

/** Days before and after today that the feed covers (a rolling window). */
export const FEED_WINDOW = { pastDays: 30, futureDays: 180 } as const;

/** The first and last day (both included) the feed covers on `today`. */
export function feedWindow(today: string): { readonly from: string; readonly to: string } {
  return {
    from: addDays(today, -FEED_WINDOW.pastDays),
    to: addDays(today, FEED_WINDOW.futureDays),
  };
}

/** What an entry is, for the CATEGORIES line and the tests. */
export type FeedItemKind = 'session' | 'event' | 'exam' | 'homework' | 'closure';
export const FEED_ITEM_KINDS: readonly FeedItemKind[] = [
  'session',
  'event',
  'exam',
  'homework',
  'closure',
];
export const FEED_ITEM_LABELS: Readonly<Record<FeedItemKind, string>> = {
  session: 'Cours',
  event: 'Événement',
  exam: 'Évaluation',
  homework: 'Devoir à rendre',
  closure: 'Jour sans cours',
};

/** One entry of the feed. */
export interface FeedItem {
  /** Stable across requests (the domain is added when written). */
  readonly uid: string;
  readonly kind: FeedItemKind;
  /** YYYY-MM-DD. */
  readonly day: string;
  /** All-day entries over several days: the last day, included. */
  readonly lastDay?: string;
  /** HH:MM wall-clock time in Cairo; null for an all-day entry. */
  readonly start: string | null;
  /** HH:MM; null: same as `start` (a deadline). */
  readonly end: string | null;
  readonly summary: string;
  readonly location: string;
  readonly description: string;
  /** ISO instant of the last change of what the entry shows (SEQUENCE and LAST-MODIFIED). */
  readonly updatedAt: string;
}

const DOMAIN = 'college-de-la-salle-daher';
/**
 * SEQUENCE counts seconds from this instant: it grows with every change saved a second apart and fits
 * RFC 5545’s signed 32-bit integer until 2094.
 */
const SEQUENCE_EPOCH = Date.UTC(2026, 0, 1);

/** The SEQUENCE of an entry last changed at `updatedAt` (seconds since 2026, never negative). */
export function feedSequence(updatedAt: string): number {
  const ms = Date.parse(updatedAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((ms - SEQUENCE_EPOCH) / 1000));
}

/** The latest of several ISO instants (nulls ignored). */
export function latestInstant(...instants: readonly (string | null | undefined)[]): string {
  return instants
    .filter((i): i is string => !!i)
    .reduce(
      (a, b) => (Date.parse(b) > Date.parse(a) ? b : a),
      new Date(SEQUENCE_EPOCH).toISOString(),
    );
}

/* ------------------------------------------------------------------------------------------------
 * From the domain to entries
 * ---------------------------------------------------------------------------------------------- */

/** What the API knows of a session beyond the engine's ids. */
export interface SessionFeedInfo {
  readonly subject: string;
  readonly activity: string;
  /** Room of the session now; null: none. */
  readonly room: string | null;
  /** Room the rule gives (to say « avant »). */
  readonly originalRoom: string | null;
  readonly teacher: string;
  readonly className: string;
  readonly group: string | null;
  readonly updatedAt: string;
}

/**
 * The entry of a session, or null when it does not take place: a cancelled session leaves the feed, and so
 * does the trace of a moved one. A moved session keeps the UID of its original day, so the calendar
 * moves the entry. Holidays were removed by the engine already.
 */
export function sessionFeedItem(o: TimetableOccurrence, info: SessionFeedInfo): FeedItem | null {
  if (o.status === 'cancelled' || o.status === 'moved_from') return null;
  const lines = [
    `${info.activity} — ${info.className}${info.group ? ` (${info.group})` : ''}`,
    `Enseignant : ${info.teacher}`,
  ];
  if (o.changes.includes('date') || o.changes.includes('time'))
    lines.push(
      `Séance déplacée : prévue initialement le ${longDay(o.original.date)} à ${o.original.startTime}.`,
    );
  if (o.changes.includes('room'))
    lines.push(`Salle changée (avant : ${info.originalRoom ?? 'aucune'}).`);
  if (o.status === 'substitute') lines.push('Séance assurée par un remplaçant.');
  if (o.exception?.reason) lines.push(`Motif : ${o.exception.reason}`);
  return {
    uid: `slot-${o.slot.id}-${o.originalDate}`,
    kind: 'session',
    day: o.current.date,
    start: o.current.startTime,
    end: o.current.endTime,
    summary: info.subject,
    location: info.room ?? '',
    description: lines.join('\n'),
    updatedAt: info.updatedAt,
  };
}

/** What the API knows of an event beyond the shared model. */
export interface EventFeedInfo {
  readonly homework: boolean;
  /** An exam or a test (see `isAssessment`). */
  readonly assessment: boolean;
  readonly updatedAt: string;
}

/**
 * The entries of events between `from` and `to`: one per day for a weekly series (the sessions a closure
 * cancels are left out), one for anything else, whose UID survives a change of day.
 */
export function eventFeedItems(
  events: readonly CalendarEvent[],
  info: ReadonlyMap<string, EventFeedInfo>,
  from: string,
  to: string,
  closures: readonly Closure[] = [],
): FeedItem[] {
  return occurrences(events, from, to, closures).map((o) => {
    const e = o.event;
    const meta = info.get(e.id);
    const kind: FeedItemKind = meta?.homework ? 'homework' : meta?.assessment ? 'exam' : 'event';
    return {
      uid: isWeekly(e) ? `event-${e.id}-${o.day}` : `event-${e.id}`,
      kind,
      day: o.day,
      start: e.start || null,
      end: e.end || null,
      summary: kind === 'homework' ? `À rendre — ${e.title}` : `${e.type.label} — ${e.title}`,
      location: e.place,
      description: e.description,
      updatedAt: meta?.updatedAt ?? new Date(e.createdAt).toISOString(),
    };
  });
}

/** A day (or days) without classes, or any day of the school calendar. */
export interface CalendarDayFeedInfo {
  readonly id: string;
  readonly label: string;
  /** « Vacances », « Semaine d’examens »… */
  readonly typeLabel: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly updatedAt: string;
}

export function calendarDayFeedItem(d: CalendarDayFeedInfo): FeedItem {
  return {
    uid: `day-${d.id}`,
    kind: 'closure',
    day: d.startsOn,
    lastDay: d.endsOn,
    start: null,
    end: null,
    summary: d.label,
    location: '',
    description: d.typeLabel,
    updatedAt: d.updatedAt,
  };
}

/** Entries by day, then time (all-day first), then UID: the same input always gives the same file. */
export function sortFeedItems(items: readonly FeedItem[]): FeedItem[] {
  return [...items].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.start ?? '').localeCompare(b.start ?? '') ||
      a.uid.localeCompare(b.uid),
  );
}

/* ------------------------------------------------------------------------------------------------
 * Writing the file
 * ---------------------------------------------------------------------------------------------- */

/**
 * Cairo's rules since 2023: summer time from the last Friday of April at 00:00 to the last Thursday of
 * October at midnight (written 23:59:59, as DTSTART cannot say 24:00). Clients that know the zone by its
 * name use their own rules; this block serves the others.
 */
export const CAIRO_VTIMEZONE: readonly string[] = [
  'BEGIN:VTIMEZONE',
  `TZID:${SCHOOL_TIME_ZONE}`,
  `X-LIC-LOCATION:${SCHOOL_TIME_ZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:EEST',
  'DTSTART:20230428T000000',
  'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-1FR',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:EET',
  'DTSTART:20231026T235959',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1TH',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const day = (d: string) => d.replace(/-/g, '');
const time = (hhmm: string) => `${hhmm.replace(':', '')}00`;
/** An instant in UTC, `YYYYMMDDTHHMMSSZ`. */
const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;

/**
 * Folds a content line at 75 octets (RFC 5545 §3.1), never inside a UTF-8 character: the next part starts
 * with a space.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // The first line holds 75 octets; the next ones 74 after their leading space.
    if (size + bytes > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export interface FeedOptions {
  /** Name shown by the calendar app (« Collège de la Salle — Nadia Saleh »). */
  readonly name: string;
  /** Instant the file is built (DTSTAMP). */
  readonly now: string;
}

/** The whole feed as an iCalendar file (CRLF line ends, folded lines). */
export function toFeedIcs(items: readonly FeedItem[], options: FeedOptions): string {
  const stamp = utc(options.now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//College de la Salle Daher//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(options.name)}`,
    `X-WR-TIMEZONE:${SCHOOL_TIME_ZONE}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...CAIRO_VTIMEZONE,
  ];
  for (const item of sortFeedItems(items)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.uid}@${DOMAIN}`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${utc(item.updatedAt)}`,
      `SEQUENCE:${feedSequence(item.updatedAt)}`,
    );
    if (item.start) {
      lines.push(
        `DTSTART;TZID=${SCHOOL_TIME_ZONE}:${day(item.day)}T${time(item.start)}`,
        `DTEND;TZID=${SCHOOL_TIME_ZONE}:${day(item.day)}T${time(item.end ?? item.start)}`,
      );
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${day(item.day)}`,
        `DTEND;VALUE=DATE:${day(addDays(item.lastDay ?? item.day, 1))}`,
        'TRANSP:TRANSPARENT',
      );
    }
    lines.push(`SUMMARY:${icsText(item.summary)}`);
    if (item.location) lines.push(`LOCATION:${icsText(item.location)}`);
    if (item.description) lines.push(`DESCRIPTION:${icsText(item.description)}`);
    lines.push(`CATEGORIES:${icsText(FEED_ITEM_LABELS[item.kind])}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------------------------------------
 * The secret link
 * ---------------------------------------------------------------------------------------------- */

/**
 * A feed token is the feed's id (32 hex digits, no dashes) followed by a 43-character base64url secret:
 * the API finds the row by id and compares the secret's HMAC in constant time.
 */
export const FEED_TOKEN_PATTERN = /^([0-9a-f]{32})([A-Za-z0-9_-]{43})$/;

/** The id and the secret of a token, or null when it is malformed. */
export function parseFeedToken(
  token: string,
): { readonly id: string; readonly secret: string } | null {
  const match = FEED_TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const hex = match[1]!;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { id, secret: match[2]! };
}

/** The token of a feed row and its secret. */
export function feedToken(id: string, secret: string): string {
  return `${id.replace(/-/g, '').toLowerCase()}${secret}`;
}

/** `webcal://` form of an https feed address (Apple Calendrier, Outlook on the desktop). */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:\/\//, 'webcal://');
}
