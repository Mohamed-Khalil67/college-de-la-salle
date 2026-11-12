import {
  type CalendarDayDto,
  type CalendarDayType,
  type PlannerChangeDto,
  type PlannerClassCoverageDto,
  type PlannerRoomsNowDto,
  type PlannerTimetablesDto,
  type PlannerTodayDto,
  type SchoolYearDto,
  TIMETABLE_WARNING_LABELS,
  type TimetableWarningDto,
} from '@cdls/shared';

/**
 * What each block of the planner's page shows, from the API's data: plain functions (Vitest checks them).
 * Each returns null when the block has nothing to show (its empty state).
 */

/** How far ahead « À régler » looks (days). */
export const FIX_DAYS = 14;
export const FIX_SHOWN = 4;
export const CHANGES_SHOWN = 5;
export const ROOMS_SHOWN = 6;
export const KEY_DATES_SHOWN = 4;

/* À régler ----------------------------------------------------------------------------------------- */

export interface FixItem {
  readonly label: string;
  readonly message: string;
}

export interface FixView {
  /** Warnings of the next two weeks, the first few. */
  readonly warnings: readonly FixItem[];
  readonly warningCount: number;
  /** Warnings not shown. */
  readonly more: number;
  /** Classes whose timetable still misses hours, the most behind first. */
  readonly incomplete: readonly PlannerClassCoverageDto[];
  readonly incompleteCount: number;
}

/** What needs the planner: the stored timetable's warnings and the classes with hours still to place. */
export function fixView(
  warnings: readonly TimetableWarningDto[],
  timetables: PlannerTimetablesDto | null,
): FixView | null {
  const incomplete = (timetables?.classes ?? [])
    .filter((c) => !c.complete)
    .sort((a, b) => missingTotal(b) - missingTotal(a) || a.label.localeCompare(b.label, 'fr'));
  if (!warnings.length && !incomplete.length) return null;
  const shown = warnings
    .slice(0, FIX_SHOWN)
    .map((w) => ({ label: TIMETABLE_WARNING_LABELS[w.code], message: w.message }));
  return {
    warnings: shown,
    warningCount: warnings.length,
    more: warnings.length - shown.length,
    incomplete: incomplete.slice(0, 3),
    incompleteCount: incomplete.length,
  };
}

export function missingTotal(c: PlannerClassCoverageDto): number {
  return c.missing.reduce((sum, m) => sum + m.missingHours, 0);
}

/* Changements aujourd'hui ----------------------------------------------------------------------------- */

export interface ChangesView {
  /** Lessons cancelled and not covered. */
  readonly toCover: number;
  readonly covered: number;
  readonly study: number;
  readonly roomChanges: number;
  readonly moved: number;
  /** Changes the students were not told about. */
  readonly untold: number;
  readonly shown: readonly PlannerChangeDto[];
  readonly more: number;
}

export function changesView(today: PlannerTodayDto): ChangesView | null {
  const all = today.changes;
  if (!all.length) return null;
  const count = (kind: PlannerChangeDto['kind']) => all.filter((c) => c.kind === kind).length;
  const shown = all.slice(0, CHANGES_SHOWN);
  return {
    toCover: count('cancelled'),
    covered: count('substitute'),
    study: count('study'),
    roomChanges: count('room_change'),
    moved: count('moved'),
    untold: all.filter((c) => !c.notified).length,
    shown,
    more: all.length - shown.length,
  };
}

/** « Annulée », « Remplacée par … », « Étude surveillée par … », « Salle B12 », « Déplacée ». */
export function changeSummary(c: PlannerChangeDto): string {
  switch (c.kind) {
    case 'cancelled':
      return 'Annulée, personne ne la couvre';
    case 'substitute':
      return `Remplacée par ${c.coverName ?? 'un autre enseignant'}`;
    case 'study':
      return `Étude surveillée${c.coverName ? ` par ${c.coverName}` : ''}`;
    case 'room_change':
      return `Salle changée${c.roomName ? `, ${c.roomName}` : ''}`;
    case 'moved':
      return 'Déplacée';
  }
}

/* Salles maintenant ------------------------------------------------------------------------------------ */

export interface RoomsView {
  readonly free: number;
  readonly total: number;
  readonly shown: PlannerRoomsNowDto['free'];
  readonly more: number;
}

export function roomsView(rooms: PlannerRoomsNowDto): RoomsView | null {
  if (!rooms.total) return null;
  const shown = rooms.free.slice(0, ROOMS_SHOWN);
  return {
    free: rooms.free.length,
    total: rooms.total,
    shown,
    more: rooms.free.length - shown.length,
  };
}

/** « jusqu’à 11 h 15 », or « jusqu’à la fin de la journée ». */
export function freeUntilText(freeUntil: string | null): string {
  if (!freeUntil) return 'libre jusqu’à la fin de la journée';
  const [h, m] = freeUntil.split(':');
  return `libre jusqu’à ${Number(h)} h${m === '00' ? '' : ` ${m}`}`;
}

/* L'année ------------------------------------------------------------------------------------------------ */

export type TermState = 'past' | 'current' | 'next';

export interface TermView {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly state: TermState;
}

export interface KeyDate {
  readonly id: string;
  readonly type: CalendarDayType;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface YearView {
  readonly label: string;
  readonly terms: readonly TermView[];
  /** Exam weeks and holidays still to come (or under way), soonest first. */
  readonly keyDates: readonly KeyDate[];
  readonly next: KeyDate | null;
}

/** The key days of the planner's calendar: exams and holidays. */
export const KEY_DAY_TYPES: readonly CalendarDayType[] = ['exam_week', 'holiday'];

export function yearView(
  year: SchoolYearDto | null,
  days: readonly CalendarDayDto[],
  today: string,
): YearView | null {
  if (!year) return null;
  const terms = [...year.periods]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((p): TermView => ({
      id: p.id,
      label: p.label,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      state: p.endsOn < today ? 'past' : p.startsOn <= today ? 'current' : 'next',
    }));
  const keyDates = days
    .filter((d) => KEY_DAY_TYPES.includes(d.type) && d.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id))
    .map((d): KeyDate => ({
      id: d.id,
      type: d.type,
      label: d.label,
      startsOn: d.startsOn,
      endsOn: d.endsOn,
    }));
  // One list per kind of period of the year (every section's term): the strip shows each term once by label.
  const unique = terms.filter(
    (t, i) => terms.findIndex((o) => o.label === t.label && o.startsOn === t.startsOn) === i,
  );
  return {
    label: year.label,
    terms: unique,
    keyDates: keyDates.slice(0, KEY_DATES_SHOWN),
    next: keyDates[0] ?? null,
  };
}

/** « du 12 au 16 janvier », « le 3 février » for a key date. */
export function dateRangeText(startsOn: string, endsOn: string): string {
  const fmt = (day: string, year: boolean) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
  if (startsOn === endsOn) return `le ${fmt(startsOn, false)}`;
  return `du ${fmt(startsOn, false)} au ${fmt(endsOn, false)}`;
}

/* Emplois du temps ------------------------------------------------------------------------------------ */

export interface TimetablesView {
  readonly complete: number;
  readonly incomplete: number;
  readonly total: number;
  readonly teachersPlaced: number;
  readonly teachersTotal: number;
  readonly percent: number;
}

export function timetablesView(t: PlannerTimetablesDto): TimetablesView | null {
  if (!t.classes.length) return null;
  const complete = t.classes.filter((c) => c.complete).length;
  return {
    complete,
    incomplete: t.classes.length - complete,
    total: t.classes.length,
    teachersPlaced: t.teachersPlaced,
    teachersTotal: t.teachersTotal,
    percent: Math.round((complete / t.classes.length) * 100),
  };
}
