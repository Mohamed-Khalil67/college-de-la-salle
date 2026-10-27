import {
  nextYearLabel,
  ROLLOVER_STUDENT_ACTIONS,
  type RolloverRequest,
  type RolloverStepSummary,
  type RolloverStudentAction,
  type RolloverStudentOverride,
  type RolloverStudentPlan,
  type SchoolYearDto,
  shiftYear,
} from '@cdls/shared';

/**
 * Pure logic of the « Nouvelle année » wizard (decorator-free, tested in rollover-logic.spec.ts): the
 * secretariat's choices per student, the filters of the review table, the paging, and the saved draft.
 */

/** The choices that differ from what the rules propose: student id → action. */
export type Choices = ReadonlyMap<string, RolloverStudentAction>;

export const STEPS = [
  { id: 'source', label: 'Année et dates' },
  { id: 'copy', label: 'Ce qui est copié' },
  { id: 'review', label: 'Aperçu et élèves' },
  { id: 'confirm', label: 'Confirmation' },
  { id: 'result', label: 'Résultat' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

/** A terminal class graduates by default; the other classes promote. */
export function isTerminal(student: Pick<RolloverStudentPlan, 'defaultAction'>): boolean {
  return student.defaultAction === 'graduate';
}

/** What the secretariat may pick for a student: a terminal class has no next class to be promoted to. */
export function actionsFor(student: Pick<RolloverStudentPlan, 'defaultAction'>): readonly RolloverStudentAction[] {
  return isTerminal(student) ? ['graduate', 'repeat', 'leave'] : ['promote', 'repeat', 'leave', 'section_change'];
}

export function effectiveAction(student: RolloverStudentPlan, choices: Choices): RolloverStudentAction {
  return choices.get(student.studentId) ?? student.defaultAction;
}

/** Picks an action for one student; picking the default again removes the choice. */
export function setChoice(choices: Choices, student: RolloverStudentPlan, action: RolloverStudentAction): Choices {
  const next = new Map(choices);
  if (action === student.defaultAction || !actionsFor(student).includes(action)) next.delete(student.studentId);
  else next.set(student.studentId, action);
  return next;
}

/**
 * Applies one action to many students (the filtered ones). Students it does not fit (« Promu » for a terminal
 * class, « Diplômé » for another) and students already placed are left alone and counted.
 */
export function applyToStudents(
  choices: Choices,
  students: readonly RolloverStudentPlan[],
  action: RolloverStudentAction,
): { readonly choices: Choices; readonly changed: number; readonly left: number } {
  let next = choices;
  let changed = 0;
  let left = 0;
  for (const s of students) {
    if (s.skipped || !actionsFor(s).includes(action)) {
      left++;
      continue;
    }
    if (effectiveAction(s, next) !== action) changed++;
    next = setChoice(next, s, action);
  }
  return { choices: next, changed, left };
}

export function toOverrides(choices: Choices): RolloverStudentOverride[] {
  return [...choices].map(([studentId, action]) => ({ studentId, action })).sort((a, b) => a.studentId.localeCompare(b.studentId));
}

/** Choices from the overrides of a request (the preview that was just run). */
export function fromOverrides(overrides: readonly RolloverStudentOverride[] | undefined): Choices {
  return new Map((overrides ?? []).map((o) => [o.studentId, o.action]));
}

/** Students per action, those already placed by a previous run left out. */
export function countActions(students: readonly RolloverStudentPlan[], choices: Choices): Record<RolloverStudentAction, number> {
  const counts: Record<RolloverStudentAction, number> = { promote: 0, repeat: 0, leave: 0, graduate: 0, section_change: 0 };
  for (const s of students) if (!s.skipped) counts[effectiveAction(s, choices)]++;
  return counts;
}

/** Lower case without accents, for searching names. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export interface StudentFilters {
  readonly query: string;
  readonly classId: string;
  /** An action, `changed` (choices of the secretariat) or empty for all. */
  readonly action: RolloverStudentAction | 'changed' | '';
}

export const NO_FILTERS: StudentFilters = { query: '', classId: '', action: '' };

export function filterStudents(
  students: readonly RolloverStudentPlan[],
  choices: Choices,
  filters: StudentFilters,
): RolloverStudentPlan[] {
  const q = fold(filters.query);
  return students.filter((s) => {
    if (filters.classId && s.sourceClassId !== filters.classId) return false;
    if (filters.action === 'changed' && !choices.has(s.studentId)) return false;
    if (filters.action && filters.action !== 'changed' && effectiveAction(s, choices) !== filters.action) return false;
    if (!q) return true;
    return fold(`${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName} ${s.studentNumber ?? ''}`).includes(q);
  });
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** One page of a list; the page number is kept inside the list. */
export function pageSlice<T>(items: readonly T[], page: number, size: number): T[] {
  const p = Math.min(Math.max(1, page), pageCount(items.length, size));
  return items.slice((p - 1) * size, p * size);
}

/* The request ------------------------------------------------------------------------------------ */

export interface Draft {
  sourceYearId: string;
  label: string;
  startsOn: string;
  endsOn: string;
  copyAssignments: boolean;
  copyTimetable: boolean;
  /** Where the secretariat stopped. */
  step: StepId;
  choices: [string, RolloverStudentAction][];
}

/** The dates and name proposed for the year after `source` (one year on, 29 February moved to 28). */
export function suggestNewYear(source: Pick<SchoolYearDto, 'label' | 'startsOn' | 'endsOn'>): {
  label: string;
  startsOn: string;
  endsOn: string;
} {
  return {
    label: nextYearLabel(source.label) ?? '',
    startsOn: shiftYear(source.startsOn),
    endsOn: shiftYear(source.endsOn),
  };
}

export function toRequest(draft: Pick<Draft, 'sourceYearId' | 'label' | 'startsOn' | 'endsOn' | 'copyAssignments' | 'copyTimetable'>, choices: Choices): RolloverRequest {
  return {
    sourceYearId: draft.sourceYearId,
    label: draft.label.trim(),
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    copyAssignments: draft.copyAssignments,
    // The timetable needs the assignments.
    copyTimetable: draft.copyAssignments && draft.copyTimetable,
    ...(choices.size ? { overrides: toOverrides(choices) } : {}),
  };
}

const STEP_IDS: readonly string[] = STEPS.map((s) => s.id);
const ACTIONS: readonly string[] = ROLLOVER_STUDENT_ACTIONS;

/** A saved draft, or null when the text is not one (a newer or damaged value is ignored, never trusted). */
export function parseDraft(text: string | null): Draft | null {
  if (!text) return null;
  try {
    const d = JSON.parse(text) as Partial<Draft> | null;
    if (!d || typeof d !== 'object') return null;
    if (typeof d.sourceYearId !== 'string' || typeof d.label !== 'string' || typeof d.startsOn !== 'string' || typeof d.endsOn !== 'string') return null;
    if (typeof d.copyAssignments !== 'boolean' || typeof d.copyTimetable !== 'boolean') return null;
    if (typeof d.step !== 'string' || !STEP_IDS.includes(d.step)) return null;
    const choices = Array.isArray(d.choices)
      ? d.choices.filter((c): c is [string, RolloverStudentAction] => Array.isArray(c) && typeof c[0] === 'string' && ACTIONS.includes(c[1] as string))
      : [];
    // The result and the confirmation are never resumed: the preview has to be looked at again.
    const step: StepId = d.step === 'result' || d.step === 'confirm' ? 'review' : (d.step as StepId);
    return {
      sourceYearId: d.sourceYearId,
      label: d.label,
      startsOn: d.startsOn,
      endsOn: d.endsOn,
      copyAssignments: d.copyAssignments,
      copyTimetable: d.copyTimetable,
      step,
      choices,
    };
  } catch {
    return null;
  }
}

/** The line of the confirmation about the groups (empty when the school has none to copy). */
export function groupsLine(steps: readonly Pick<RolloverStepSummary, 'id' | 'create'>[]): string | null {
  const created = (id: string) => steps.find((s) => s.id === id)?.create ?? 0;
  const groups = created('groups');
  if (!groups) return null;
  const members = created('group_members');
  const sessions = created('group_slots');
  const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;
  const parts = [members === 1 ? '1 élève promu retrouve son groupe' : `${members} élèves promus retrouvent leur groupe`];
  if (sessions) parts.push(n(sessions, 'séance de groupe est copiée', 'séances de groupe sont copiées'));
  return `${n(groups, 'groupe est copié', 'groupes sont copiés')} dans les nouvelles classes : ${parts.join(', ')}.`;
}

/** The French summary of what the confirmation dialog restates. */
export function consequences(counts: Record<RolloverStudentAction, number>): string[] {
  const out: string[] = [];
  const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;
  if (counts.graduate) out.push(`${n(counts.graduate, 'élève est diplômé', 'élèves sont diplômés')} : compte archivé, plus de connexion.`);
  if (counts.leave) out.push(`${n(counts.leave, 'élève quitte', 'élèves quittent')} le collège : compte archivé, plus de connexion.`);
  if (counts.repeat) out.push(`${n(counts.repeat, 'élève redouble', 'élèves redoublent')} : même niveau dans la nouvelle année.`);
  if (counts.section_change) out.push(`${n(counts.section_change, 'demande', 'demandes')} de changement de section ${counts.section_change > 1 ? 'seront ouvertes' : 'sera ouverte'}, à valider dans « Validations ».`);
  return out;
}
