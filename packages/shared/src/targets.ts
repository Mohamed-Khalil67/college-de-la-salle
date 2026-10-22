/**
 * « Assigner à »: who a piece of work (an evaluation or a homework) concerns.
 *
 * The TARGET is stored (the whole class, some groups, some students), never a copy of the student list.
 * The students it concerns are worked out from the target and today's rosters, so a student who joins a
 * group later is included and one who leaves is not. This is the ONE place that rule is written: the API
 * (`TargetsService`) and the web forms both call `targetedStudentIds`.
 */

export type AssessmentTargetScope = 'class' | 'group' | 'student';
export const ASSESSMENT_TARGET_SCOPES: readonly AssessmentTargetScope[] = ['class', 'group', 'student'];

/** One stored target row. `class` carries neither id; `group` a group id; `student` a student id. */
export interface TargetEntry {
  readonly scope: AssessmentTargetScope;
  readonly groupId?: string | null;
  readonly studentId?: string | null;
}

/** What the rosters say today, for the class the work belongs to. */
export interface TargetContext {
  /** Students with an open enrolment in the work's class, in the order the result keeps. */
  readonly classStudentIds: readonly string[];
  /** Current members of each group (open memberships), by group id. Unknown groups have no members. */
  readonly groupMembers: ReadonlyMap<string, readonly string[]>;
}

/** No target row, or a `class` row: the whole class (the default). */
export function isWholeClass(entries: readonly TargetEntry[]): boolean {
  return entries.length === 0 || entries.some((e) => e.scope === 'class');
}

/**
 * The students the work concerns today, in the class list's order.
 * - whole class: everyone enrolled in the class;
 * - groups and students: the union of the groups' current members and the students named, and only those
 *   still enrolled in the class (a student who left the class is no longer concerned).
 */
export function targetedStudentIds(
  entries: readonly TargetEntry[],
  context: TargetContext,
): string[] {
  if (isWholeClass(entries)) return [...context.classStudentIds];
  const chosen = new Set<string>();
  for (const e of entries) {
    if (e.scope === 'group' && e.groupId) {
      for (const id of context.groupMembers.get(e.groupId) ?? []) chosen.add(id);
    } else if (e.scope === 'student' && e.studentId) {
      chosen.add(e.studentId);
    }
  }
  return context.classStudentIds.filter((id) => chosen.has(id));
}

/** Is this student one the work concerns today? */
export function concernsStudent(
  entries: readonly TargetEntry[],
  context: TargetContext,
  studentId: string,
): boolean {
  return targetedStudentIds(entries, context).includes(studentId);
}

/**
 * Was this student ever a target? Used for grades already given: a student who moved from one group to
 * another keeps the grades they earned in the first. `groupsEverIn` holds every group the student has
 * belonged to, open or closed.
 */
export function wasTargeted(
  entries: readonly TargetEntry[],
  studentId: string,
  groupsEverIn: ReadonlySet<string>,
): boolean {
  if (isWholeClass(entries)) return true;
  return entries.some(
    (e) =>
      (e.scope === 'student' && e.studentId === studentId) ||
      (e.scope === 'group' && !!e.groupId && groupsEverIn.has(e.groupId)),
  );
}

/** « 1 élève concerné », « 12 élèves concernés ». */
export function concernedLabel(count: number): string {
  return count === 1 ? '1 élève concerné' : `${count} élèves concernés`;
}

/** The rows to store for a request: no group and no student is the whole class. */
export function entriesOf(input: {
  readonly groupIds: readonly string[];
  readonly studentIds: readonly string[];
}): TargetEntry[] {
  const groups = [...new Set(input.groupIds)].map((groupId) => ({
    scope: 'group' as const,
    groupId,
  }));
  const students = [...new Set(input.studentIds)].map((studentId) => ({
    scope: 'student' as const,
    studentId,
  }));
  const all: TargetEntry[] = [...groups, ...students];
  return all.length ? all : [{ scope: 'class' }];
}
