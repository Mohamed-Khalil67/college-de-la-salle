import { audienceMatches, type SectionId, type Target } from './space.model';

/**
 * The shared calendar: exams, extracurricular activities and meetings. Teachers edit it; students only
 * read what concerns their section and class. Pure functions, easy to test.
 */

export type EventKind = 'exam' | 'activity' | 'meeting';

export const EVENT_KINDS: readonly { readonly id: EventKind; readonly label: string; readonly plural: string }[] = [
  { id: 'exam', label: 'Examen', plural: 'Examens' },
  { id: 'activity', label: 'Activité extrascolaire', plural: 'Activités extrascolaires' },
  { id: 'meeting', label: 'Réunion', plural: 'Réunions' },
];

export interface CalendarEvent {
  readonly id: string;
  readonly kind: EventKind;
  readonly title: string;
  /** YYYY-MM-DD */
  readonly date: string;
  /** HH:MM, or '' for all day. */
  readonly time: string;
  readonly target: Target;
  /** A catalogue subject id, or ''. */
  readonly subject: string;
  readonly note: string;
  readonly authorUid: string;
  readonly authorName: string;
  readonly createdAt: number;
}

export function eventKindLabel(kind: EventKind): string {
  return EVENT_KINDS.find((k) => k.id === kind)?.label ?? '';
}

export function isClockTime(value: string): boolean {
  return value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Events of a day: all-day first, then by time. */
export function eventsOn(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((e) => e.date === day).sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'fr'));
}

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

export interface CalendarCell {
  /** YYYY-MM-DD */
  readonly day: string;
  readonly inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The weeks of a month (`month` is 1–12), Monday first, padded with the neighbouring days. */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const total = Math.ceil((offset + new Date(Date.UTC(year, month, 0)).getUTCDate()) / 7) * 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    cells.push({ day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, inMonth: d.getUTCMonth() === month - 1 });
  }
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year: number, month: number, delta: number): { readonly year: number; readonly month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function monthTitle(year: number, month: number): string {
  return MONTH_FORMAT.format(new Date(Date.UTC(year, month - 1, 1)));
}
