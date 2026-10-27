import {
  type AssessmentTargetDto,
  type AssessmentTargetInput,
  concernedLabel,
  type GroupWithMembersDto,
  type StudentSummaryDto,
  targetedStudentIds,
  type TargetEntry,
} from '@cdls/shared';

/**
 * Pure logic of « Assigner à »: who a piece of work concerns (whole class, groups, named students), shared by
 * the teacher's event form, the grade sheet, the roll call and the event details. No Angular here.
 */

export const studentName = (s: { firstName: string; lastName: string }): string => `${s.firstName} ${s.lastName}`;

/* ------------------------------------------------------------------------------------------------
 * « Assigner à »
 * ---------------------------------------------------------------------------------------------- */

/** What the picker holds: no group and no student is the whole class. */
export interface TargetValue {
  readonly groupIds: readonly string[];
  readonly studentIds: readonly string[];
}

export const WHOLE_CLASS: TargetValue = { groupIds: [], studentIds: [] };

export const isWhole = (t: TargetValue): boolean => !t.groupIds.length && !t.studentIds.length;

/** The picker's value for an existing event. */
export function targetValueOf(target: AssessmentTargetDto | null | undefined): TargetValue {
  return target ? { groupIds: target.groups.map((g) => g.id), studentIds: [...target.studentIds] } : WHOLE_CLASS;
}

export function toTargetInput(t: TargetValue): AssessmentTargetInput {
  return { groupIds: [...t.groupIds], studentIds: [...t.studentIds] };
}

/** The students the target concerns today, from the same shared rule the API uses. */
export function concernedStudents(
  t: TargetValue,
  roster: readonly StudentSummaryDto[],
  groups: readonly GroupWithMembersDto[],
): StudentSummaryDto[] {
  const entries: TargetEntry[] = isWhole(t)
    ? [{ scope: 'class' }]
    : [
        ...t.groupIds.map((groupId) => ({ scope: 'group' as const, groupId })),
        ...t.studentIds.map((studentId) => ({ scope: 'student' as const, studentId })),
      ];
  const ids = new Set(
    targetedStudentIds(entries, {
      classStudentIds: roster.map((s) => s.id),
      groupMembers: new Map(groups.map((g) => [g.id, g.memberIds])),
    }),
  );
  return roster.filter((s) => ids.has(s.id));
}

/** « Toute la classe : 10 élèves concernés » or « TP A, Léa Rizk : 6 élèves concernés ». */
export function targetSentence(
  t: TargetValue,
  roster: readonly StudentSummaryDto[],
  groups: readonly GroupWithMembersDto[],
): string {
  const count = concernedStudents(t, roster, groups).length;
  if (isWhole(t)) return `Toute la classe : ${concernedLabel(count)}.`;
  const names = [
    ...t.groupIds.map((id) => groups.find((g) => g.id === id)?.label ?? 'un groupe'),
    ...t.studentIds.map((id) => {
      const s = roster.find((x) => x.id === id);
      return s ? studentName(s) : 'un élève';
    }),
  ];
  return `${names.join(', ')} : ${concernedLabel(count)}.`;
}

/** The target of an event as a sentence (calendar details, grade sheet, roll call). */
export function eventTargetLine(target: AssessmentTargetDto | null | undefined): string {
  if (!target) return '';
  const count = target.concerned;
  if (target.whole) return count === null ? 'Toute la classe' : `Toute la classe : ${concernedLabel(count)}`;
  const parts = [
    ...target.groups.map((g) => g.label),
    ...(target.studentIds.length ? [target.studentIds.length === 1 ? '1 élève nommé' : `${target.studentIds.length} élèves nommés`] : []),
  ];
  // A student is never told who else was named: the line then says only that it is a part of the class.
  const who = parts.length ? parts.join(', ') : 'Une partie de la classe';
  return `${who}${count === null ? '' : ` : ${concernedLabel(count)}`}`;
}

/**
 * What happens to the grades already given when the audience of a published piece of work changes, in
 * words for the teacher editing it (`graded`: how many marks exist).
 */
export function audienceChangeNote(graded: number): string {
  if (!graded) return 'Aucune note n’est encore saisie : vous pouvez changer l’assignation librement.';
  const marks = graded === 1 ? '1 note existe' : `${graded} notes existent`;
  return `${marks} déjà. Un élève noté ne peut pas être retiré : supprimez d’abord sa note dans la feuille de notes. Les élèves ajoutés apparaissent sans note, et les notes de ceux qui restent ne changent pas.`;
}
