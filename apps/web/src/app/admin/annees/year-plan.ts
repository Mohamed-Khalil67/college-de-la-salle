/**
 * Pure logic of the « Année scolaire » screen: what applies to which section, how bars stack on the
 * timeline, which periods a new one would overlap, and the state of the setup checklist.
 * No Angular here: unit-tested in year-plan.spec.ts.
 */
import type {
  CalendarDayDto,
  CalendarDayType,
  ClassDto,
  PeriodDto,
  PeriodKind,
  SchoolYearDto,
  SectionDto,
} from '@cdls/shared';
import { formatRange } from '../shared/admin-format';
import { rangesOverlap } from '../shared/day-math';

/** Lanes of the timeline, top to bottom. */
export type Lane = 'periods' | 'closures' | 'exams';

export const LANES: readonly { readonly id: Lane; readonly label: string }[] = [
  { id: 'periods', label: 'Périodes' },
  { id: 'closures', label: 'Vacances et jours sans cours' },
  { id: 'exams', label: 'Examens et journées spéciales' },
];

export interface TimelineEntry {
  /** `period:<id>` or `day:<id>`. */
  readonly key: string;
  readonly source: 'period' | 'day';
  readonly id: string;
  readonly lane: Lane;
  /** `trimester`, `semester`, or the calendar day's type. */
  readonly type: PeriodKind | CalendarDayType;
  /** « Trimestre », « Vacances »… for the legend and the list. */
  readonly kindLabel: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  /** null: applies to every section. */
  readonly sectionId: string | null;
  readonly classIds: readonly string[];
  /** A closed period: no edit. */
  readonly locked: boolean;
}

const DAY_LANE: Readonly<Record<CalendarDayType, Lane>> = {
  holiday: 'closures',
  no_classes: 'closures',
  exam_week: 'exams',
  event_day: 'exams',
};

const DAY_KIND_LABEL: Readonly<Record<CalendarDayType, string>> = {
  holiday: 'Vacances',
  no_classes: 'Pas de cours',
  exam_week: 'Examens',
  event_day: 'Journée spéciale',
};

export const PERIOD_KIND_LABEL: Readonly<Record<PeriodKind, string>> = { trimester: 'Trimestre', semester: 'Semestre' };

export function toEntries(periods: readonly PeriodDto[], days: readonly CalendarDayDto[]): TimelineEntry[] {
  const fromPeriods = periods.map<TimelineEntry>((p) => ({
    key: `period:${p.id}`,
    source: 'period',
    id: p.id,
    lane: 'periods',
    type: p.kind,
    kindLabel: PERIOD_KIND_LABEL[p.kind],
    label: p.label,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    sectionId: p.sectionId,
    classIds: [],
    locked: !!p.closedAt,
  }));
  const fromDays = days.map<TimelineEntry>((d) => ({
    key: `day:${d.id}`,
    source: 'day',
    id: d.id,
    lane: DAY_LANE[d.type],
    type: d.type,
    kindLabel: DAY_KIND_LABEL[d.type],
    label: d.label,
    startsOn: d.startsOn,
    endsOn: d.endsOn,
    sectionId: d.sectionId,
    classIds: d.classIds,
    locked: false,
  }));
  return [...fromPeriods, ...fromDays].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn));
}

/**
 * The entries that concern a section: its own, the school-wide ones, and those aimed at classes of that
 * section (`sectionOfClass` maps a class id to its section id).
 */
export function entriesOfSection(
  entries: readonly TimelineEntry[],
  sectionId: string,
  sectionOfClass: ReadonlyMap<string, string>,
): TimelineEntry[] {
  return entries.filter((entry) => {
    if (entry.classIds.length) {
      // Classes not loaded yet (or their request failed): show the day in every section rather than nowhere.
      if (!entry.classIds.some((id) => sectionOfClass.has(id))) return true;
      return entry.classIds.some((id) => sectionOfClass.get(id) === sectionId);
    }
    return entry.sectionId === null || entry.sectionId === sectionId;
  });
}

export interface PlacedEntry {
  readonly entry: TimelineEntry;
  /** Row inside its lane (0 first); overlapping entries get different rows. */
  readonly row: number;
}

/** Greedy interval packing: an entry goes on the first row where nothing overlaps it. */
export function placeInRows(entries: readonly TimelineEntry[]): { readonly placed: PlacedEntry[]; readonly rows: number } {
  const ends: string[] = [];
  const placed: PlacedEntry[] = [];
  const sorted = [...entries].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn));
  for (const entry of sorted) {
    let row = ends.findIndex((end) => end < entry.startsOn);
    if (row === -1) {
      row = ends.length;
      ends.push(entry.endsOn);
    } else {
      ends[row] = entry.endsOn;
    }
    placed.push({ entry, row });
  }
  return { placed, rows: Math.max(ends.length, 1) };
}

export interface PeriodCandidate {
  readonly id?: string;
  readonly kind: PeriodKind;
  readonly sectionId: string | null;
  readonly startsOn: string;
  readonly endsOn: string;
}

/**
 * The periods a new or edited period would overlap, with the API's rule: same kind, same section or one of
 * them school-wide, dates crossing. Used to point at the culprit after the API answers 409.
 */
export function overlappingPeriods(periods: readonly PeriodDto[], candidate: PeriodCandidate): PeriodDto[] {
  return periods.filter(
    (p) =>
      p.id !== candidate.id &&
      p.kind === candidate.kind &&
      (p.sectionId === null || candidate.sectionId === null || p.sectionId === candidate.sectionId) &&
      rangesOverlap(p.startsOn, p.endsOn, candidate.startsOn, candidate.endsOn),
  );
}

/** « Le 1er trimestre (du 1 septembre 2026 au 20 décembre 2026) chevauche ces dates. » */
export function overlapHint(culprits: readonly PeriodDto[]): string | null {
  if (!culprits.length) return null;
  const list = culprits.map((p) => `${p.label} (${formatRange(p.startsOn, p.endsOn)})`).join(' ; ');
  return culprits.length > 1 ? `Périodes en conflit : ${list}.` : `Période en conflit : ${list}.`;
}

export type StepStatus = 'done' | 'partial' | 'todo';

export type StepId = 'dates' | 'periods' | 'closures' | 'classes' | 'subjects';

export interface ChecklistStep {
  readonly id: StepId;
  readonly title: string;
  readonly status: StepStatus;
  /** What is done and what is missing. */
  readonly detail: string;
  /** Label of the button that continues the step. */
  readonly action: string;
}

export interface ChecklistInput {
  readonly year: SchoolYearDto;
  readonly sections: readonly SectionDto[];
  readonly days: readonly CalendarDayDto[];
  readonly classes: readonly ClassDto[];
  /** Number of subjects of each class, by class id (a class absent from the map has none). */
  readonly subjectCounts: ReadonlyMap<string, number>;
}

function ratio(done: number, total: number): StepStatus {
  if (total > 0 && done === total) return 'done';
  return done > 0 ? 'partial' : 'todo';
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

/** The five setup steps, each derived from what exists, so the checklist resumes where the data stops. */
export function buildChecklist(input: ChecklistInput): ChecklistStep[] {
  const { year, sections, days, classes, subjectCounts } = input;

  const withPeriods = sections.filter((s) => year.periods.some((p) => p.sectionId === null || p.sectionId === s.id));
  const holidays = days.filter((d) => d.type === 'holiday').length;
  const exams = days.filter((d) => d.type === 'exam_week').length;
  const withClasses = sections.filter((s) => classes.some((c) => c.sectionId === s.id));
  const withSubjects = classes.filter((c) => (subjectCounts.get(c.id) ?? 0) > 0);

  const closuresStatus: StepStatus = holidays && exams ? 'done' : holidays || exams ? 'partial' : 'todo';
  const missingClosures = [holidays ? '' : 'les vacances', exams ? '' : 'une semaine d’examens'].filter(Boolean).join(' et ');

  return [
    {
      id: 'dates',
      title: 'Dates de l’année',
      // The dates exist and are valid as soon as the year does; making it the current year is the admin's own decision.
      status: 'done',
      detail: `${formatRange(year.startsOn, year.endsOn)}${year.isCurrent ? '.' : ' ; ce n’est pas encore l’année en cours (l’administration la choisit).'}`,
      action: 'Modifier les dates',
    },
    {
      id: 'periods',
      title: 'Trimestres ou semestres',
      status: ratio(withPeriods.length, sections.length),
      detail: sections.length
        ? `${withPeriods.length} filière${withPeriods.length > 1 ? 's' : ''} sur ${sections.length} ${withPeriods.length > 1 ? 'ont' : 'a'} ses périodes.`
        : 'Aucune filière.',
      action: 'Ajouter les périodes',
    },
    {
      id: 'closures',
      title: 'Vacances et semaines d’examens',
      status: closuresStatus,
      detail:
        closuresStatus === 'done'
          ? `${plural(holidays, 'période de vacances', 'périodes de vacances')} et ${plural(exams, 'semaine d’examens', 'semaines d’examens')}.`
          : `Il manque ${missingClosures}.`,
      action: 'Saisir les vacances',
    },
    {
      id: 'classes',
      title: 'Classes',
      status: ratio(withClasses.length, sections.length),
      detail: classes.length ? `${plural(classes.length, 'classe', 'classes')} dans ${plural(withClasses.length, 'filière', 'filières')}.` : 'Aucune classe pour cette année.',
      action: 'Gérer les classes',
    },
    {
      id: 'subjects',
      title: 'Matières des classes',
      status: ratio(withSubjects.length, classes.length),
      detail: classes.length
        ? `${withSubjects.length} classe${withSubjects.length > 1 ? 's' : ''} sur ${classes.length} ${withSubjects.length > 1 ? 'ont' : 'a'} ses matières.`
        : 'Créez d’abord les classes.',
      action: 'Définir les matières',
    },
  ];
}

/** The step to resume: the first one that is not done, or null when everything is. */
export function nextStep(steps: readonly ChecklistStep[]): ChecklistStep | null {
  return steps.find((s) => s.status !== 'done') ?? null;
}

/** The first class without subjects (where the « Matières » step continues), or the first class. */
export function classToCompleteNext(classes: readonly ClassDto[], subjectCounts: ReadonlyMap<string, number>): ClassDto | null {
  return classes.find((c) => (subjectCounts.get(c.id) ?? 0) === 0) ?? classes[0] ?? null;
}

/** « 1er trimestre », « 2e trimestre », « 1er semestre ». */
export function defaultPeriodLabel(kind: PeriodKind, number: number): string {
  return `${number === 1 ? '1er' : `${number}e`} ${kind === 'semester' ? 'semestre' : 'trimestre'}`;
}

/** The smallest number (1 to 4) not yet used by a period of the same kind and section; 4 when all are. */
export function nextPeriodNumber(periods: readonly PeriodDto[], kind: PeriodKind, sectionId: string | null): number {
  const used = new Set(periods.filter((p) => p.kind === kind && p.sectionId === sectionId).map((p) => p.number));
  for (let n = 1; n <= 4; n += 1) if (!used.has(n)) return n;
  return 4;
}

/**
 * Checks a range against its school year, with the API's wording: the end follows the start (a period)
 * or may equal it (a single day), and both fall inside the year. Dates are ISO days.
 */
export function rangeProblem(
  startsOn: string,
  endsOn: string,
  year: { readonly label: string; readonly startsOn: string; readonly endsOn: string },
  allowSameDay: boolean,
): string | null {
  if (allowSameDay ? endsOn < startsOn : endsOn <= startsOn) {
    return allowSameDay ? 'La fin ne peut pas précéder le début.' : 'La fin doit suivre le début.';
  }
  if (startsOn < year.startsOn || endsOn > year.endsOn) {
    return `Les dates doivent être comprises dans l’année ${year.label} (${formatRange(year.startsOn, year.endsOn)}).`;
  }
  return null;
}

/** A single date (a start) must fall inside the school year; same wording as `rangeProblem`. */
export function dayInYearProblem(
  day: string,
  year: { readonly label: string; readonly startsOn: string; readonly endsOn: string },
): string | null {
  return day < year.startsOn || day > year.endsOn
    ? `Les dates doivent être comprises dans l’année ${year.label} (${formatRange(year.startsOn, year.endsOn)}).`
    : null;
}
