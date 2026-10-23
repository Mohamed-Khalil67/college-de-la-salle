import { audienceMatches, isHttpsUrl, type SectionId, type Target } from './space.js';

/**
 * The calendar is the backbone of the school space: classes (cours, TD, TP), exams, homework deadlines,
 * revision sessions, activities and meetings are all events. Teachers edit it; students read what
 * concerns their class. Pure functions, easy to test.
 */

/* ------------------------------------------------------------------------------------------------
 * Activity types: cours, TD, TP, examen… and the types teachers invent. They live in the database
 * (`activity_types`); what the code knows about a type is its flags, never its code.
 * ---------------------------------------------------------------------------------------------- */

/** Colour tokens of the accessible palette (the web maps each to a contrast-checked pair); never a free hex value. */
export const ACTIVITY_COLOURS = ['navy', 'green', 'gold', 'brick', 'red', 'stone'] as const;
export type ActivityColour = (typeof ACTIVITY_COLOURS)[number];

/** Icons of /icons.svg a type may use (always shown next to its label: colour is never the only cue). */
export const ACTIVITY_ICONS = [
  'book',
  'users',
  'edit',
  'file-text',
  'check',
  'clock',
  'calendar',
  'map-pin',
  'bell',
  'eye',
] as const;
export type ActivityIcon = (typeof ACTIVITY_ICONS)[number];

/** What the code may rely on about an activity type. */
export interface ActivityTypeFlags {
  /** Teachers can enter grades for it (it belongs to a period). */
  readonly gradable: boolean;
  /** Can be repeated every week (a timetable slot). */
  readonly repeatable: boolean;
  /** Homework: students tick it as done (« Devoirs »), not a session they attend. */
  readonly homework: boolean;
}

export interface ActivityTypeInfo extends ActivityTypeFlags {
  readonly code: string;
  readonly label: string;
  readonly colour: ActivityColour;
  readonly icon: ActivityIcon;
}

/**
 * The school-wide system types, created by the migration that replaced the `event_kind` enum (one per old
 * value, same flags) and kept by the seed. Their codes are the old enum values; nothing else may test them.
 */
export const SYSTEM_ACTIVITY_TYPES: readonly ActivityTypeInfo[] = [
  {
    code: 'cours',
    label: 'Cours',
    colour: 'navy',
    icon: 'book',
    repeatable: true,
    gradable: false,
    homework: false,
  },
  {
    code: 'td',
    label: 'TD',
    colour: 'green',
    icon: 'users',
    repeatable: true,
    gradable: false,
    homework: false,
  },
  {
    code: 'tp',
    label: 'TP',
    colour: 'green',
    icon: 'eye',
    repeatable: true,
    gradable: true,
    homework: false,
  },
  {
    code: 'examen',
    label: 'Examen',
    colour: 'red',
    icon: 'file-text',
    repeatable: false,
    gradable: true,
    homework: false,
  },
  {
    code: 'controle',
    label: 'Contrôle',
    colour: 'gold',
    icon: 'check',
    repeatable: false,
    gradable: true,
    homework: false,
  },
  {
    code: 'devoir',
    label: 'Devoir à rendre',
    colour: 'brick',
    icon: 'edit',
    repeatable: false,
    gradable: true,
    homework: true,
  },
  {
    code: 'revision',
    label: 'Révision',
    colour: 'stone',
    icon: 'clock',
    repeatable: true,
    gradable: false,
    homework: false,
  },
  {
    code: 'activite',
    label: 'Activité',
    colour: 'green',
    icon: 'map-pin',
    repeatable: true,
    gradable: false,
    homework: false,
  },
  {
    code: 'reunion',
    label: 'Réunion',
    colour: 'stone',
    icon: 'users',
    repeatable: false,
    gradable: false,
    homework: false,
  },
];

/** Exams and tests: graded sessions that are neither homework nor weekly (they stand out, « prochain examen »). */
export function isAssessment(type: ActivityTypeFlags): boolean {
  return type.gradable && !type.homework && !type.repeatable;
}

export const ACTIVITY_TYPE_LIMITS = { label: 60 } as const;

export interface Attachment {
  readonly label: string;
  /** https only. */
  readonly url: string;
}

export interface CalendarEvent {
  readonly id: string;
  /** Its activity type (label for display and .ics, flags for the rules). */
  readonly type: Pick<ActivityTypeInfo, 'label'> & ActivityTypeFlags;
  readonly title: string;
  /** A catalogue subject id, or ''. */
  readonly subject: string;
  readonly target: Target;
  /** YYYY-MM-DD: the day, or the first day of a weekly series. */
  readonly date: string;
  /** HH:MM, or '' for all day. */
  readonly start: string;
  /** HH:MM, or ''. */
  readonly end: string;
  /** YYYY-MM-DD: repeats every week until this day (included); '' for a single event. */
  readonly repeatUntil: string;
  readonly place: string;
  readonly description: string;
  readonly attachments: readonly Attachment[];
  /** Weight of the grades given for it (gradable types), 1 by default. */
  readonly coefficient: number;
  readonly authorUid: string;
  readonly authorName: string;
  readonly createdAt: number;
}

export const EVENT_LIMITS = {
  title: 120,
  place: 120,
  description: 2000,
  attachments: 10,
  label: 80,
} as const;

export function isClockTime(value: string): boolean {
  return value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/* ------------------------------------------------------------------------------------------------
 * Days
 * ---------------------------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');
const toDay = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromDay = (day: string) => new Date(`${day}T12:00:00Z`);

/** `day` plus `n` days. */
export function addDays(day: string, n: number): string {
  const d = fromDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string): number {
  return fromDay(day).getUTCDay();
}

/**
 * First day of the week. Egyptian schools run Sunday to Thursday, so weeks start on Sunday; change to
 * 1 for a Monday-first week.
 */
export const WEEK_START = 0;

export function startOfWeek(day: string): string {
  return addDays(day, -((weekday(day) - WEEK_START + 7) % 7));
}

/** The 7 days of the week containing `day`. */
export function weekDays(day: string): string[] {
  const first = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export interface CalendarCell {
  readonly day: string;
  readonly inMonth: boolean;
}

/** The weeks of a month (`month` is 1–12), padded with the neighbouring days. */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const first = `${year}-${pad(month)}-01`;
  const last = toDay(new Date(Date.UTC(year, month, 0, 12)));
  const end = addDays(startOfWeek(last), 6);
  const weeks: CalendarCell[][] = [];
  for (let day = startOfWeek(first); day <= end; day = addDays(day, 1)) {
    if (weekday(day) === WEEK_START) weeks.push([]);
    weeks.at(-1)!.push({ day, inMonth: day.slice(0, 7) === first.slice(0, 7) });
  }
  return weeks;
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { readonly year: number; readonly month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const monthTitle = (year: number, month: number) =>
  MONTH_FORMAT.format(new Date(Date.UTC(year, month - 1, 1)));
/** « mardi 3 novembre » */
export const longDay = (day: string) => DAY_FORMAT.format(fromDay(day));
/** « mar. 3 nov. » */
export const shortDay = (day: string) => SHORT_DAY.format(fromDay(day));

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------------------------------------
 * Occurrences: a weekly event happens on several days
 * ---------------------------------------------------------------------------------------------- */

export interface Occurrence {
  readonly event: CalendarEvent;
  readonly day: string;
  /** Unique per occurrence: `id@day`. */
  readonly key: string;
}

/**
 * Days without classes (holidays, « pas de cours ») for an audience: `all`, a section (`bac`) or classes
 * (`bac-premiere`), in the notation of Target. Built from the year's calendar days.
 */
export interface Closure {
  readonly startsOn: string;
  readonly endsOn: string;
  /** `['all']`, `['bac']`, or one target per class. */
  readonly targets: readonly Target[];
}

/**
 * Does a closure cancel the sessions of an event addressed to `target`? Only when it covers the event's
 * whole audience: a school-wide closure covers everything, a section closure its section and its classes,
 * a class closure that class. A school-wide event keeps running during a one-section holiday.
 */
export function closureCovers(closure: Closure, target: Target): boolean {
  return closure.targets.some((t) => t === 'all' || t === target || target.startsWith(`${t}-`));
}

function closedOn(day: string, target: Target, closures: readonly Closure[]): boolean {
  return closures.some((c) => c.startsOn <= day && day <= c.endsOn && closureCovers(c, target));
}

/** Is this a weekly series (a repeatable type with an end day)? */
export function isWeekly(event: Pick<CalendarEvent, 'repeatUntil' | 'type'>): boolean {
  return !!event.repeatUntil && event.type.repeatable;
}

/** The days of a weekly series from `from` to `to` (both included), holidays included. */
function seriesDays(event: CalendarEvent, from: string, to: string): string[] {
  const days: string[] = [];
  // First weekly occurrence on or after `from`.
  let day =
    event.date < from
      ? addDays(event.date, Math.ceil(daysBetween(event.date, from) / 7) * 7)
      : event.date;
  for (; day <= event.repeatUntil && day <= to; day = addDays(day, 7)) days.push(day);
  return days;
}

/** The sessions of a weekly series cancelled by closures (they become EXDATE lines in the .ics). */
export function skippedDays(event: CalendarEvent, closures: readonly Closure[]): string[] {
  if (!isWeekly(event)) return [];
  return seriesDays(event, event.date, event.repeatUntil).filter((day) =>
    closedOn(day, event.target, closures),
  );
}

/**
 * Every occurrence of the events between `from` and `to` (both included), sorted by day then time.
 * Weekly sessions that fall on a closure for their audience (holiday, no classes) are skipped; one-off
 * events are kept, since someone chose that day on purpose.
 */
export function occurrences(
  events: readonly CalendarEvent[],
  from: string,
  to: string,
  closures: readonly Closure[] = [],
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const event of events) {
    if (!isWeekly(event)) {
      if (event.date >= from && event.date <= to)
        out.push({ event, day: event.date, key: `${event.id}@${event.date}` });
      continue;
    }
    for (const day of seriesDays(event, from, to)) {
      if (!closedOn(day, event.target, closures))
        out.push({ event, day, key: `${event.id}@${day}` });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || byTime(a.event, b.event));
}

function byTime(a: CalendarEvent, b: CalendarEvent): number {
  // All-day items first, then by start time.
  return (
    (a.start || '00:00').localeCompare(b.start || '00:00') || a.title.localeCompare(b.title, 'fr')
  );
}

/** Occurrences grouped by day. */
export function byDay(list: readonly Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const o of list) map.set(o.day, [...(map.get(o.day) ?? []), o]);
  return map;
}

/** « 08:30 – 10:00 », « 08:30 » or « Toute la journée ». */
export function timeRange(event: Pick<CalendarEvent, 'start' | 'end'>): string {
  if (!event.start) return 'Toute la journée';
  return event.end ? `${event.start} – ${event.end}` : event.start;
}

/* ------------------------------------------------------------------------------------------------
 * Audiences
 * ---------------------------------------------------------------------------------------------- */

/** What a student sees: events addressed to their section and class. */
export function eventsFor(
  events: readonly CalendarEvent[],
  section: SectionId,
  classe: string,
): CalendarEvent[] {
  return events.filter((e) => audienceMatches(e.target, section, classe));
}

/** A teacher's audience filter (`all` = everything): events that concern that audience. */
export function eventsForTarget(events: readonly CalendarEvent[], target: Target): CalendarEvent[] {
  if (target === 'all') return [...events];
  // A class filter also shows its section's events; a section filter also shows its classes' events.
  return events.filter(
    (e) =>
      e.target === 'all' ||
      e.target === target ||
      target.startsWith(`${e.target}-`) ||
      e.target.startsWith(`${target}-`),
  );
}

/** The next assessment (an exam or test: see isAssessment) from `today` on, if any. */
export function nextExam(list: readonly Occurrence[], today: string): Occurrence | null {
  return list.find((o) => o.day >= today && isAssessment(o.event.type)) ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * Attachments: links and explanation videos
 * ---------------------------------------------------------------------------------------------- */

/** Keeps only well-formed https attachments (what other teachers wrote is not trusted blindly). */
export function safeAttachments(list: readonly Attachment[]): Attachment[] {
  return list
    .filter((a) => typeof a?.url === 'string' && isHttpsUrl(a.url))
    .slice(0, EVENT_LIMITS.attachments);
}

/**
 * An embeddable player URL for YouTube and Google Drive videos, built from a validated id (never the
 * raw link); null for anything else, which is shown as a plain link.
 */
export function videoEmbed(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const id = (value: string | null | undefined) =>
    value && /^[\w-]{6,64}$/.test(value) ? value : null;
  let video: string | null = null;
  if (host === 'youtu.be') video = id(u.pathname.slice(1));
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') video = id(u.searchParams.get('v'));
    else video = id(/^\/(?:embed|shorts|live)\/([\w-]+)/.exec(u.pathname)?.[1]);
  }
  if (video) return `https://www.youtube-nocookie.com/embed/${video}`;
  if (host === 'drive.google.com') {
    const file = id(/^\/file\/d\/([\w-]+)/.exec(u.pathname)?.[1]);
    if (file) return `https://drive.google.com/file/d/${file}/preview`;
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * « Ajouter à mon agenda »: an iCalendar file
 * ---------------------------------------------------------------------------------------------- */

/** A TEXT value of an iCalendar property, escaped (RFC 5545 §3.3.11). */
export const icsText = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
const icsDate = (day: string) => day.replace(/-/g, '');

/**
 * An .ics file for the event (weekly events keep their repetition, minus the sessions cancelled by
 * `closures`, as EXDATE lines). Times are local (floating).
 */
export function toIcs(event: CalendarEvent, closures: readonly Closure[] = []): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//College de la Salle Daher//Espace eleve//FR',
    'BEGIN:VEVENT',
    `UID:${event.id}@college-de-la-salle-daher`,
  ];
  if (event.start) {
    const t = (hhmm: string) => `${hhmm.replace(':', '')}00`;
    lines.push(`DTSTART:${icsDate(event.date)}T${t(event.start)}`);
    lines.push(`DTEND:${icsDate(event.date)}T${t(event.end || event.start)}`);
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${icsDate(event.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(event.date, 1))}`,
    );
  }
  if (isWeekly(event)) {
    // RFC 5545: UNTIL has the value type of DTSTART (a DATE for an all-day series).
    lines.push(
      `RRULE:FREQ=WEEKLY;UNTIL=${icsDate(event.repeatUntil)}${event.start ? 'T235959' : ''}`,
    );
    // One EXDATE per cancelled session (short lines), with the same value type as DTSTART.
    for (const day of skippedDays(event, closures)) {
      lines.push(
        event.start
          ? `EXDATE:${icsDate(day)}T${event.start.replace(':', '')}00`
          : `EXDATE;VALUE=DATE:${icsDate(day)}`,
      );
    }
  }
  lines.push(`SUMMARY:${icsText(`${event.type.label} — ${event.title}`)}`);
  if (event.place) lines.push(`LOCATION:${icsText(event.place)}`);
  if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
