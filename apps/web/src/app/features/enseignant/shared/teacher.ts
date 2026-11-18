import { type AssessmentTargetInput, type AttendanceStatus, averageOnTwenty, type ClassDto, type EventDto, type EventInput, GRADING_LIMITS, type ActivityTypeSummary, round1, type SectionDto, type TeachingAssignmentDto } from '@cdls/shared';
import { SECTION_LABELS } from '../../../core/school/school-profile';
import type { AudienceOption } from '../../../shared/utils/audience';
import { average } from '../../../shared/utils/format';

/**
 * Pure logic of the teacher space: classes from teaching assignments, the event form, the grade grid,
 * the roll call and announcement audiences. No Angular here, so Vitest tests it directly.
 */

/* ------------------------------------------------------------------------------------------------
 * Classes
 * ---------------------------------------------------------------------------------------------- */

export interface TeacherClass {
  readonly classId: string;
  readonly label: string;
  readonly sectionLabel: string;
  readonly studentCount: number | null;
  readonly subjects: readonly { readonly id: string; readonly name: string; readonly coefficient: number }[];
}

/** The teacher's assignments grouped by class (sorted by section then label), with each class's size. */
export function groupByClass(assignments: readonly TeachingAssignmentDto[], classes: readonly ClassDto[]): TeacherClass[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const groups = new Map<string, TeacherClass>();
  for (const a of assignments) {
    const c = byId.get(a.classId);
    const group = groups.get(a.classId) ?? {
      classId: a.classId,
      label: a.classLabel,
      sectionLabel: c ? SECTION_LABELS[c.sectionCode] : '',
      studentCount: c?.studentCount ?? null,
      subjects: [],
    };
    groups.set(a.classId, {
      ...group,
      subjects: [...group.subjects, { id: a.subjectId, name: a.subjectName, coefficient: a.coefficient }].sort((x, y) =>
        x.name.localeCompare(y.name, 'fr'),
      ),
    });
  }
  return [...groups.values()].sort(
    (a, b) => a.sectionLabel.localeCompare(b.sectionLabel, 'fr') || a.label.localeCompare(b.label, 'fr'),
  );
}

/** « Première, Mathématiques » for an assignment select. */
export function assignmentLabel(a: TeachingAssignmentDto): string {
  return `${a.classLabel}, ${a.subjectName}`;
}

/** Sorted by class then subject. */
export function sortAssignments(list: readonly TeachingAssignmentDto[]): TeachingAssignmentDto[] {
  return [...list].sort((a, b) => assignmentLabel(a).localeCompare(assignmentLabel(b), 'fr'));
}

/* ------------------------------------------------------------------------------------------------
 * Event form
 * ---------------------------------------------------------------------------------------------- */

export interface EventFormModel {
  /** An activity type id (GET /activity-types). */
  activityTypeId: string;
  title: string;
  /** A teaching assignment id: the class and the subject together. */
  assignmentId: string;
  date: string;
  startTime: string;
  endTime: string;
  weekly: boolean;
  repeatUntil: string;
  place: string;
  description: string;
  coefficient: number;
}

export function emptyEventModel(date: string, assignmentId = '', activityTypeId = ''): EventFormModel {
  return {
    activityTypeId,
    title: '',
    assignmentId,
    date,
    startTime: '',
    endTime: '',
    weekly: false,
    repeatUntil: '',
    place: '',
    description: '',
    coefficient: 1,
  };
}

/** The form model of an existing event (its assignment found from class and subject). */
export function modelFromEvent(e: EventDto, assignments: readonly TeachingAssignmentDto[]): EventFormModel {
  const assignment = assignments.find((a) => a.classId === e.classId && a.subjectId === e.subjectId);
  return {
    activityTypeId: e.activityTypeId,
    title: e.title,
    assignmentId: assignment?.id ?? '',
    date: e.date,
    startTime: e.startTime ?? '',
    endTime: e.endTime ?? '',
    weekly: !!e.repeatUntil,
    repeatUntil: e.repeatUntil ?? '',
    place: e.place,
    description: e.description,
    coefficient: e.coefficient,
  };
}

/** The type to start a new event with: the first plain weekly type (repeatable, ungraded, not homework). */
export function defaultActivityType(types: readonly ActivityTypeSummary[]): ActivityTypeSummary | undefined {
  return types.find((t) => t.repeatable && !t.gradable && !t.homework) ?? types[0];
}

/** What the API expects. Fields that don't apply to the type (repeat, coefficient) are reset. */
export function toEventInput(
  m: EventFormModel,
  assignments: readonly TeachingAssignmentDto[],
  types: readonly Pick<ActivityTypeSummary, 'id' | 'repeatable' | 'gradable'>[],
  /** « Assigner à », for assessments and homework of a class; left out for other events. */
  target?: AssessmentTargetInput,
): EventInput {
  const info = types.find((t) => t.id === m.activityTypeId) ?? { repeatable: false, gradable: false };
  const assignment = assignments.find((a) => a.id === m.assignmentId);
  return {
    activityTypeId: m.activityTypeId,
    title: m.title.trim(),
    classId: assignment?.classId ?? null,
    subjectId: assignment?.subjectId ?? null,
    sectionId: null,
    date: m.date,
    startTime: m.startTime || null,
    endTime: m.startTime && m.endTime ? m.endTime : null,
    repeatUntil: info.repeatable && m.weekly && m.repeatUntil ? m.repeatUntil : null,
    place: m.place.trim(),
    description: m.description.trim(),
    coefficient: info.gradable ? m.coefficient : 1,
    ...(target ? { target } : {}),
  };
}

/** The time check of the event form, or null when the times are consistent. */
export function timeProblem(start: string, end: string): string | null {
  if (end && !start) return 'Indiquez aussi l’heure de début, ou effacez l’heure de fin.';
  if (start && end && end <= start) return 'L’heure de fin doit suivre l’heure de début.';
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Grade grid
 * ---------------------------------------------------------------------------------------------- */

/** True when `mark` is empty or a number between 0 and `outOf`. */
export function isValidScore(mark: number | null, outOf: number): boolean {
  return mark === null || (Number.isFinite(mark) && mark >= 0 && mark <= outOf);
}

export interface ScoreCell {
  readonly score: number | null;
  readonly outOf: number;
  readonly coefficient: number;
}

/** A student's average on 20 over the cells that hold a valid score (weighted by coefficient). */
export function rowAverage(cells: readonly ScoreCell[]): number | null {
  return averageOnTwenty(
    cells
      .filter((c): c is ScoreCell & { score: number } => c.score !== null && isValidScore(c.score, c.outOf))
      .map((c) => ({ score: c.score, outOf: c.outOf, coefficient: c.coefficient })),
  );
}

/** The class average of one evaluation, on 20, over valid scores; null without any. */
export function columnAverage(scores: readonly (number | null)[], outOf: number): number | null {
  const valid = scores.filter((s): s is number => s !== null && isValidScore(s, outOf));
  return valid.length ? round1(valid.reduce((sum, s) => sum + (s / outOf) * 20, 0) / valid.length) : null;
}

export interface GradeIssues {
  /** Names of students whose mark is not a number between 0 and the scale. */
  readonly invalid: readonly string[];
  /** Names of students without a mark. */
  readonly missing: readonly string[];
}

export function gradeIssues(rows: readonly { readonly name: string; readonly score: number | null }[], outOf: number): GradeIssues {
  return {
    invalid: rows.filter((r) => !isValidScore(r.score, outOf)).map((r) => r.name),
    missing: rows.filter((r) => r.score === null).map((r) => r.name),
  };
}

/** « 1 note est hors barème (Karim Mansour) et 1 note manque (Sami Rafla). » or ''. */
export function issuesSentence(issues: GradeIssues): string {
  const part = (names: readonly string[], one: string, many: string) =>
    names.length ? `${names.length} ${names.length > 1 ? many : one} (${names.join(', ')})` : '';
  const parts = [part(issues.invalid, 'note est hors barème', 'notes sont hors barème'), part(issues.missing, 'note manque', 'notes manquent')];
  const text = parts.filter(Boolean).join(' et ');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : '';
}

/* ------------------------------------------------------------------------------------------------
 * Roll call
 * ---------------------------------------------------------------------------------------------- */

export type RollCounts = Readonly<Record<AttendanceStatus, number>>;

export function rollCounts(statuses: readonly AttendanceStatus[]): RollCounts {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const s of statuses) counts[s]++;
  return counts;
}

/** « 24 présents, 1 absent, 1 en retard » (excused only when there are some). */
export function rollSentence(c: RollCounts): string {
  const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;
  const parts = [n(c.present, 'présent', 'présents'), n(c.absent, 'absent', 'absents'), `${c.late} en retard`];
  if (c.excused) parts.push(n(c.excused, 'excusé', 'excusés'));
  return parts.join(', ');
}

/* ------------------------------------------------------------------------------------------------
 * Announcement audiences: `class:<id>`, `section:<id>` or `all`
 * ---------------------------------------------------------------------------------------------- */

// Reading a choice and naming an audience are shared with the administration.
export { audienceFromValue, audienceLabel, type AudienceOption } from '../../../shared/utils/audience';

/** The teacher's classes, then the sections of those classes, then the whole school. */
export function audienceOptions(myClasses: readonly ClassDto[], sections: readonly SectionDto[]): AudienceOption[] {
  const classOptions = [...myClasses]
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    .map((c) => ({ value: `class:${c.id}`, label: `${c.label} (${SECTION_LABELS[c.sectionCode]})` }));
  const sectionIds = new Set(myClasses.map((c) => c.sectionId));
  const sectionOptions = sections
    .filter((s) => sectionIds.has(s.id))
    .map((s) => ({ value: `section:${s.id}`, label: `Tout le ${s.label}` }));
  return [...classOptions, ...sectionOptions, { value: 'all', label: 'Tous les élèves du collège' }];
}


/* ------------------------------------------------------------------------------------------------
 * Autosave of the grade grid (« Noter »)
 * ---------------------------------------------------------------------------------------------- */

export interface SaveState {
  /** A request is running. */
  readonly saving: boolean;
  /** Typed marks or comments that the server does not have yet. */
  readonly dirty: boolean;
  /** Some typed marks (or the scale) are outside what is accepted: nothing is sent. */
  readonly invalid: boolean;
  /** The last save failed (the reason is shown separately). */
  readonly failed: boolean;
  /** Marks entered, among `total` students. */
  readonly entered: number;
  readonly total: number;
  /** Class average on 20, null without marks. */
  readonly average: number | null;
}

/** Where the autosave stands. Only the settled stages are announced to screen readers. */
export type SaveStage = 'saved' | 'saving' | 'pending' | 'failed' | 'invalid';

export function saveStage(s: SaveState): SaveStage {
  if (s.invalid) return 'invalid';
  if (s.saving) return 'saving';
  if (s.failed) return 'failed';
  if (s.dirty) return 'pending';
  return 'saved';
}

const SAVE_LABELS: Readonly<Record<SaveStage, string>> = {
  saved: 'Enregistré',
  saving: 'Enregistrement…',
  pending: 'Modifications en attente',
  failed: 'Non enregistré',
  invalid: 'Note hors barème : corrigez-la pour enregistrer',
};

/** The state in words: « Enregistré », « Non enregistré », « Note hors barème… ». */
export function saveStatus(s: SaveState): string {
  return SAVE_LABELS[saveStage(s)];
}

/** Announced politely: only a settled state (the others change at every keystroke). */
export function isAnnounced(stage: SaveStage): boolean {
  return stage === 'saved' || stage === 'failed' || stage === 'invalid';
}

/** The figures next to the state, for reading, never announced: « 4 / 27 · moyenne 14,2 ». */
export function saveSummary(s: Pick<SaveState, 'entered' | 'total' | 'average'>): string {
  const counts = `${s.entered} / ${s.total}`;
  return s.average === null ? counts : `${counts} · moyenne ${average(s.average)}`;
}

/**
 * The entries typed while a save was running: what differs between the values sent and the values now.
 * They are put back after the server's answer replaces the sheet, so nothing typed meanwhile is lost.
 */
export function changedSince<T>(sent: Readonly<Record<string, T>>, now: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(now).filter(([key, value]) => !Object.is(sent[key], value)));
}

/* ------------------------------------------------------------------------------------------------
 * The numbers of a new note
 * ---------------------------------------------------------------------------------------------- */

/** What is wrong with a scale (« Sur »), or null: it must be a number from the shared limits. */
export function scaleProblem(value: unknown): string | null {
  const { min, max } = GRADING_LIMITS.scale;
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? null
    : `Indiquez sur combien la note est donnée, de ${min} à ${max}.`;
}

/** What is wrong with a coefficient, or null: a number from the shared limits (0 is allowed). */
export function coefficientProblem(value: unknown): string | null {
  const { min, max } = GRADING_LIMITS.coefficient;
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? null
    : `Indiquez un coefficient de ${min} à ${max}, 1 par défaut.`;
}
