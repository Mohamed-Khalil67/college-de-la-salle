import {
  type ActivityTypeDto,
  isAssessment,
  type PendingGradingDto,
  type TeachingAssignmentDto,
} from '@cdls/shared';
import { dayTitle, mark } from '../../../shared/utils/format';
import { assignmentLabel } from '../shared/teacher';

/** Pure rules of the « Noter » screen (choices, picker lines, the new note's numbers). No Angular here. */

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
    if (!seen.has(key)) seen.set(key, { key, classId: a.classId, subjectId: a.subjectId, classLabel: a.classLabel, label: assignmentLabel(a) });
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

/** « sur 20, coefficient 2 » under the title of a note. */
export function scaleLine(outOf: number, coefficient: number): string {
  return `Sur ${mark(outOf)}, coefficient ${mark(coefficient)}`;
}
