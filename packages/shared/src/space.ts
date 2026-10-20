/**
 * Model of the school space: sections and classes, audiences, announcements and grades.
 * Pure types and functions (no Angular, no Firebase, no Nest), shared by apps/web and apps/api.
 */

export type SectionId = 'nationale' | 'bac';

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  nationale: 'Bac nationale',
  bac: 'Bac français',
};

export interface ClassOption {
  readonly value: string;
  readonly label: string;
}

/** Classes a student can pick, by section. */
export const CLASSES: Readonly<Record<SectionId, readonly ClassOption[]>> = {
  nationale: [
    { value: 'secondaire-1', label: '1re secondaire' },
    { value: 'secondaire-2', label: '2e secondaire' },
    { value: 'secondaire-3', label: '3e secondaire (Thanaweya Amma)' },
  ],
  bac: [
    { value: 'seconde', label: 'Seconde' },
    { value: 'premiere', label: 'Première' },
    { value: 'terminale', label: 'Terminale' },
  ],
};

export function classLabel(section: SectionId, value: string): string {
  return CLASSES[section].find((c) => c.value === value)?.label ?? value;
}

/* ------------------------------------------------------------------------------------------------
 * Audiences
 * ---------------------------------------------------------------------------------------------- */

/** `all`, a section (`nationale`, `bac`) or one class (`bac-premiere`). */
export type Target = string;

export function classTarget(section: SectionId, classe: string): Target {
  return `${section}-${classe}`;
}

export interface TargetOption {
  readonly value: Target;
  readonly label: string;
}

/** Everything a teacher can address, from widest to narrowest. */
export const TARGET_OPTIONS: readonly TargetOption[] = [
  { value: 'all', label: 'Tous les élèves' },
  { value: 'nationale', label: 'Tout le Bac nationale' },
  ...CLASSES.nationale.map((c) => ({ value: classTarget('nationale', c.value), label: `Bac nationale — ${c.label}` })),
  { value: 'bac', label: 'Tout le Bac français' },
  ...CLASSES.bac.map((c) => ({ value: classTarget('bac', c.value), label: `Bac français — ${c.label}` })),
];

export function targetLabel(target: Target): string {
  return TARGET_OPTIONS.find((t) => t.value === target)?.label ?? target;
}

export function isValidTarget(target: string): boolean {
  return TARGET_OPTIONS.some((t) => t.value === target);
}

/** Is a post addressed to a student of this section and class? */
export function audienceMatches(target: Target, section: SectionId, classe: string): boolean {
  return target === 'all' || target === section || target === classTarget(section, classe);
}

/* ------------------------------------------------------------------------------------------------
 * Announcements (everything with a date lives in the calendar)
 * ---------------------------------------------------------------------------------------------- */

export interface Post {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** A catalogue subject id (see site-content/matieres.ts), or '' for none. */
  readonly subject: string;
  readonly target: Target;
  readonly authorUid: string;
  readonly authorName: string;
  readonly createdAt: number;
}

export const LIMITS = {
  title: 120,
  body: 4000,
  comment: 1000,
  name: 80,
  maxDone: 300,
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** https links only: never `javascript:`, `data:` or plain http. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:' && value.trim().length <= 500;
  } catch {
    return false;
  }
}

/** Local calendar day, YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DUE_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** « mardi 21 octobre » for a YYYY-MM-DD day. */
export function formatDay(day: string): string {
  return DUE_FORMAT.format(new Date(`${day}T12:00:00Z`));
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

/** Where a due date stands relative to today. */
export function dueState(dueDate: string, today: string): DueState {
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  const days = Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return days <= 3 ? 'soon' : 'later';
}

/** Announcements that concern a student, newest first. */
export function postsFor(posts: readonly Post[], section: SectionId, classe: string): Post[] {
  return posts.filter((p) => audienceMatches(p.target, section, classe)).sort((a, b) => b.createdAt - a.createdAt);
}

/* ------------------------------------------------------------------------------------------------
 * Grades: entered per exam (a calendar event), published when the teacher decides
 * ---------------------------------------------------------------------------------------------- */

export interface Grade {
  readonly id: string;
  readonly studentUid: string;
  readonly studentName: string;
  /** The calendar event (examen, contrôle, TP, devoir) it belongs to. */
  readonly eventId: string;
  readonly subject: string;
  readonly title: string;
  readonly score: number;
  readonly outOf: number;
  readonly coefficient: number;
  readonly comment: string;
  /** Students only see published grades. */
  readonly published: boolean;
  readonly teacherUid: string;
  readonly teacherName: string;
  readonly createdAt: number;
}

/** One grade document per student and exam, so entering a mark again corrects it. */
export function gradeId(eventId: string, studentUid: string): string {
  return `${eventId}_${studentUid}`;
}

/** A grade ramped to a mark out of 20 (the French/Egyptian convention), unrounded. */
export function onTwenty(grade: Pick<Grade, 'score' | 'outOf'>): number {
  return (grade.score / grade.outOf) * 20;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Weighted average on 20 (coefficient 1 when absent), to one decimal; null when there are none. */
export function averageOnTwenty(grades: readonly (Pick<Grade, 'score' | 'outOf'> & { readonly coefficient?: number })[]): number | null {
  const weight = grades.reduce((sum, g) => sum + (g.coefficient ?? 1), 0);
  if (!grades.length || weight <= 0) return null;
  return round1(grades.reduce((sum, g) => sum + onTwenty(g) * (g.coefficient ?? 1), 0) / weight);
}

/**
 * General average on 20, as on the report card: the subject averages weighted by the subjects'
 * coefficients, ignoring subjects without an average or without a (positive) coefficient; one decimal.
 */
export function generalAverage(
  subjects: readonly { readonly average: number | null; readonly coefficient: number | null }[],
): number | null {
  const graded = subjects.filter(
    (s): s is { average: number; coefficient: number } => s.average !== null && s.coefficient !== null && s.coefficient > 0,
  );
  const weight = graded.reduce((sum, s) => sum + s.coefficient, 0);
  return weight > 0 ? round1(graded.reduce((sum, s) => sum + s.average * s.coefficient, 0) / weight) : null;
}

export interface SubjectGrades {
  readonly subject: string;
  readonly grades: readonly Grade[];
  readonly average: number | null;
}

/** Grades grouped by subject (newest grade first inside each), subjects sorted by id. */
export function gradesBySubject(grades: readonly Grade[]): SubjectGrades[] {
  const groups = new Map<string, Grade[]>();
  for (const g of grades) groups.set(g.subject, [...(groups.get(g.subject) ?? []), g]);
  return [...groups]
    .map(([subject, list]) => ({
      subject,
      grades: [...list].sort((a, b) => b.createdAt - a.createdAt),
      average: averageOnTwenty(list),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

/** Parses « 14,5 » or « 14.5 »; NaN when it isn't a number. */
export function parseNumber(text: string): number {
  const cleaned = text.trim().replace(',', '.');
  return cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned) ? Number.NaN : Number(cleaned);
}

export const FORMAT_MARK = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/* ------------------------------------------------------------------------------------------------
 * People
 * ---------------------------------------------------------------------------------------------- */

export interface StudentProfile {
  readonly displayName: string;
  readonly section: SectionId;
  readonly classe: string;
  /** Ids of the « devoir » events the student marked as done. */
  readonly done: readonly string[];
}

export interface StudentSummary {
  readonly uid: string;
  readonly displayName: string;
  readonly section: SectionId;
  readonly classe: string;
}
