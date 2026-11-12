import {
  type ActivityTypeDto,
  isAssessment,
  type PendingGradingDto,
  type TeachingAssignmentDto,
} from '@cdls/shared';
import { average, dayTitle, mark } from '../../../shared/utils/format';

/**
 * Pure rules of « Noter » (quick grading) and of the grid's autosave. No Angular here, so Vitest tests it
 * directly.
 */

/** The scale a new note may use: what `SaveGradesRequest.outOf` accepts. */
export const SCALE_LIMITS = { min: 1, max: 1000 } as const;
/** The coefficient a new note may use: what `CreateQuickAssessmentRequest.coefficient` accepts. */
export const COEFFICIENT_LIMITS = { min: 0, max: 20 } as const;

/** Types a quick grade may use: graded, not homework, not archived; exams and tests first. */
export function quickGradeTypes(types: readonly ActivityTypeDto[]): ActivityTypeDto[] {
  const usable = types.filter((t) => t.gradable && !t.homework && !t.archived);
  return [...usable.filter(isAssessment), ...usable.filter((t) => !isAssessment(t))];
}

/** « Première, mathématiques »: one choice per class and subject the teacher grades. */
export interface ClassSubjectChoice {
  readonly key: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly classLabel: string;
  readonly label: string;
}

export function classSubjectChoices(assignments: readonly TeachingAssignmentDto[]): ClassSubjectChoice[] {
  const seen = new Map<string, ClassSubjectChoice>();
  for (const a of assignments) {
    const key = `${a.classId}|${a.subjectId}`;
    if (!seen.has(key)) seen.set(key, { key, classId: a.classId, subjectId: a.subjectId, classLabel: a.classLabel, label: `${a.classLabel}, ${a.subjectName}` });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/** The choice named by `?classe=&matiere=` (the first of the class when only the class is given), else the first. */
export function initialChoice(
  choices: readonly ClassSubjectChoice[],
  classId: string | undefined,
  subjectId: string | undefined,
): ClassSubjectChoice | undefined {
  return (
    choices.find((c) => c.classId === classId && c.subjectId === subjectId) ??
    choices.find((c) => c.classId === classId) ??
    choices[0]
  );
}

/** « Contrôle, jeudi 12 novembre, 18 notes sur 27, brouillon » for the picker. */
export function pendingMeta(p: PendingGradingDto): string {
  const state = p.published ? 'publiée en partie' : 'brouillon';
  const count = p.entered === 0 ? 'aucune note saisie' : `${p.entered} ${p.entered > 1 ? 'notes' : 'note'} sur ${p.total}`;
  return `${p.event.type.label}, ${dayTitle(p.event.date).toLowerCase()}, ${count}, ${state}`;
}

export interface SaveState {
  /** A request is running. */
  readonly saving: boolean;
  /** Typed marks or comments that the server does not have yet. */
  readonly dirty: boolean;
  /** Some typed marks are outside the scale: they are not sent. */
  readonly invalid: boolean;
  /** The last save failed (the reason is shown separately). */
  readonly failed: boolean;
  /** Marks entered, among `total` students. */
  readonly entered: number;
  readonly total: number;
  /** Class average on 20, null without marks. */
  readonly average: number | null;
}

/** The polite status line of the autosaving grid: « Enregistré · 4 / 27 · moyenne 14,2 ». */
export function saveStatus(s: SaveState): string {
  const counts = `${s.entered} / ${s.total}`;
  const avg = s.average === null ? '' : ` · moyenne ${average(s.average)}`;
  if (s.invalid) return `Note hors barème : corrigez-la pour enregistrer · ${counts}`;
  if (s.saving) return `Enregistrement… · ${counts}`;
  if (s.failed) return `Non enregistré · ${counts}`;
  if (s.dirty) return `Modifications en attente · ${counts}${avg}`;
  return `Enregistré · ${counts}${avg}`;
}

/**
 * The entries typed while a save was running: what differs between the values sent and the values now.
 * They are put back after the server's answer replaces the sheet, so nothing typed meanwhile is lost.
 */
export function changedSince<T>(sent: Readonly<Record<string, T>>, now: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(now).filter(([key, value]) => !Object.is(sent[key], value)));
}

/** « sur 20, coefficient 2 » under the title of a note. */
export function scaleLine(outOf: number, coefficient: number): string {
  return `Sur ${mark(outOf)}, coefficient ${mark(coefficient)}`;
}
