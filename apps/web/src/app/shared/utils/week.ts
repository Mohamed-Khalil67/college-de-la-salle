import {
  addDays,
  type CalendarEvent,
  type EventDto,
  type OccurrenceDto,
  toIcs,
  weekday,
  weekDays,
} from '@cdls/shared';

/** One column of the week view. */
export interface DayColumn {
  readonly day: string;
  readonly items: readonly OccurrenceDto[];
}

/**
 * The days to draw for the week containing `day`: Sunday to Thursday (the Egyptian school week) always,
 * Friday and Saturday only when something happens on them.
 */
export function weekColumns(day: string, list: readonly OccurrenceDto[]): DayColumn[] {
  return weekDays(day)
    .map((d) => ({ day: d, items: list.filter((o) => o.day === d) }))
    .filter((c) => c.items.length > 0 || (weekday(c.day) !== 5 && weekday(c.day) !== 6));
}

/** First and last day of the week containing `day` (the range sent to the API). */
export function weekRange(day: string): { readonly from: string; readonly to: string } {
  const days = weekDays(day);
  return { from: days[0]!, to: days[6]! };
}

/** `day` moved by whole weeks. */
export function shiftWeek(day: string, weeks: number): string {
  return addDays(day, weeks * 7);
}

const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const at = (d: string) => new Date(`${d}T12:00:00Z`);

/** « Semaine du 18 au 22 octobre 2026 » (school days), across months when needed. */
export function weekLabel(day: string): string {
  const days = weekDays(day);
  const first = days[0]!;
  const last = days[4]!;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const dayNumber = Number(first.slice(8));
  const start = sameMonth ? (dayNumber === 1 ? '1er' : String(dayNumber)) : DAY_MONTH.format(at(first));
  return `Semaine du ${start} au ${DAY_MONTH_YEAR.format(at(last))}`;
}

/** The calendar model the shared .ics writer expects. */
export function toCalendarEvent(e: EventDto): CalendarEvent {
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    subject: e.subjectId ?? '',
    target: 'all',
    date: e.date,
    start: e.startTime ?? '',
    end: e.endTime ?? '',
    repeatUntil: e.repeatUntil ?? '',
    place: e.place,
    description: e.description,
    attachments: e.attachments,
    coefficient: e.coefficient,
    authorUid: e.authorId,
    authorName: e.authorName,
    createdAt: Date.parse(e.createdAt),
  };
}

/** « Ajouter à mon agenda »: the event as an iCalendar file. */
export function eventIcs(e: EventDto): string {
  return toIcs(toCalendarEvent(e));
}

/** A safe file name from a title: « controle-n-3-fonctions.ics ». */
export function fileName(title: string, extension: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'fichier'}.${extension}`;
}
