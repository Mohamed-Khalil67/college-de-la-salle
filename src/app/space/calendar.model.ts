import { audienceMatches, isHttpsUrl, type SectionId, type Target } from './space.model';

/**
 * The calendar is the backbone of the school space: classes (cours, TD, TP), exams, homework deadlines,
 * revision sessions, activities and meetings are all events. Teachers edit it; students read what
 * concerns their class. Pure functions, easy to test.
 */

export type EventKind = 'cours' | 'td' | 'tp' | 'examen' | 'controle' | 'devoir' | 'revision' | 'activite' | 'reunion';

export interface EventKindInfo {
  readonly id: EventKind;
  readonly label: string;
  /** Can be repeated every week (a timetable slot). */
  readonly repeatable: boolean;
  /** Teachers can enter grades for it. */
  readonly gradable: boolean;
}

export const EVENT_KINDS: readonly EventKindInfo[] = [
  { id: 'cours', label: 'Cours', repeatable: true, gradable: false },
  { id: 'td', label: 'TD', repeatable: true, gradable: false },
  { id: 'tp', label: 'TP', repeatable: true, gradable: true },
  { id: 'examen', label: 'Examen', repeatable: false, gradable: true },
  { id: 'controle', label: 'Contrôle', repeatable: false, gradable: true },
  { id: 'devoir', label: 'Devoir à rendre', repeatable: false, gradable: true },
  { id: 'revision', label: 'Révision', repeatable: true, gradable: false },
  { id: 'activite', label: 'Activité', repeatable: true, gradable: false },
  { id: 'reunion', label: 'Réunion', repeatable: false, gradable: false },
];

const KIND_BY_ID = new Map(EVENT_KINDS.map((k) => [k.id, k]));

export function kindInfo(kind: EventKind): EventKindInfo {
  return KIND_BY_ID.get(kind) ?? EVENT_KINDS[0]!;
}

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === 'string' && KIND_BY_ID.has(value as EventKind);
}

export interface Attachment {
  readonly label: string;
  /** https only. */
  readonly url: string;
}

export interface CalendarEvent {
  readonly id: string;
  readonly kind: EventKind;
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
  /** Weight of the grades given for it (gradable kinds), 1 by default. */
  readonly coefficient: number;
  readonly authorUid: string;
  readonly authorName: string;
  readonly createdAt: number;
}

export const EVENT_LIMITS = { title: 120, place: 120, description: 2000, attachments: 10, label: 80 } as const;

export function isClockTime(value: string): boolean {
  return value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/* ------------------------------------------------------------------------------------------------
 * Days
 * ---------------------------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');
const toDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
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

export function shiftMonth(year: number, month: number, delta: number): { readonly year: number; readonly month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const monthTitle = (year: number, month: number) => MONTH_FORMAT.format(new Date(Date.UTC(year, month - 1, 1)));
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

/** Every occurrence of the events between `from` and `to` (both included), sorted by day then time. */
export function occurrences(events: readonly CalendarEvent[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const event of events) {
    const weekly = !!event.repeatUntil && kindInfo(event.kind).repeatable;
    if (!weekly) {
      if (event.date >= from && event.date <= to) out.push({ event, day: event.date, key: `${event.id}@${event.date}` });
      continue;
    }
    // First weekly occurrence on or after `from`.
    let day = event.date < from ? addDays(event.date, Math.ceil(daysBetween(event.date, from) / 7) * 7) : event.date;
    for (; day <= event.repeatUntil && day <= to; day = addDays(day, 7)) out.push({ event, day, key: `${event.id}@${day}` });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || byTime(a.event, b.event));
}

function byTime(a: CalendarEvent, b: CalendarEvent): number {
  // All-day items first, then by start time.
  return (a.start || '00:00').localeCompare(b.start || '00:00') || a.title.localeCompare(b.title, 'fr');
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
export function eventsFor(events: readonly CalendarEvent[], section: SectionId, classe: string): CalendarEvent[] {
  return events.filter((e) => audienceMatches(e.target, section, classe));
}

/** A teacher's audience filter (`all` = everything): events that concern that audience. */
export function eventsForTarget(events: readonly CalendarEvent[], target: Target): CalendarEvent[] {
  if (target === 'all') return [...events];
  // A class filter also shows its section's events; a section filter also shows its classes' events.
  return events.filter((e) => e.target === 'all' || e.target === target || target.startsWith(`${e.target}-`) || e.target.startsWith(`${target}-`));
}

/** The next exam-like event (examen, contrôle) from `today` on, if any. */
export function nextExam(list: readonly Occurrence[], today: string): Occurrence | null {
  return list.find((o) => o.day >= today && (o.event.kind === 'examen' || o.event.kind === 'controle')) ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * Attachments: links and explanation videos
 * ---------------------------------------------------------------------------------------------- */

/** Keeps only well-formed https attachments (what other teachers wrote is not trusted blindly). */
export function safeAttachments(list: readonly Attachment[]): Attachment[] {
  return list.filter((a) => typeof a?.url === 'string' && isHttpsUrl(a.url)).slice(0, EVENT_LIMITS.attachments);
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
  const id = (value: string | null | undefined) => (value && /^[\w-]{6,64}$/.test(value) ? value : null);
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

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (day: string) => day.replace(/-/g, '');

/** An .ics file for the event (weekly events keep their repetition). Times are local (floating). */
export function toIcs(event: CalendarEvent, kindLabel = kindInfo(event.kind).label): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//College de la Salle Daher//Espace eleve//FR', 'BEGIN:VEVENT', `UID:${event.id}@college-de-la-salle-daher`];
  if (event.start) {
    const t = (hhmm: string) => `${hhmm.replace(':', '')}00`;
    lines.push(`DTSTART:${icsDate(event.date)}T${t(event.start)}`);
    lines.push(`DTEND:${icsDate(event.date)}T${t(event.end || event.start)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(event.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(event.date, 1))}`);
  }
  if (event.repeatUntil && kindInfo(event.kind).repeatable) lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${icsDate(event.repeatUntil)}T235959`);
  lines.push(`SUMMARY:${icsText(`${kindLabel} — ${event.title}`)}`);
  if (event.place) lines.push(`LOCATION:${icsText(event.place)}`);
  if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
