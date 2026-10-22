import { createHash } from 'node:crypto';
import {
  nextYearLabel,
  type RolloverIssue,
  type RolloverSkipReason,
  type RolloverStudentAction,
  type SectionId,
  SHIFTED_DAY_TYPES_TO_CHECK,
  shiftRange,
  shiftYear,
  yearsBetween,
} from '@cdls/shared';

/**
 * The rollover plan: a pure function from a snapshot of the database and the request to everything the
 * rollover would do. Nothing here reads the database or the clock, so the same snapshot and request always
 * give the same plan (and the same hash). The service loads the snapshot, runs the plan in one
 * transaction (a preview rolls it back) and compares hashes.
 */

/** A class is identified across years by its section and code (they are unique per year). */
export const classKey = (sectionCode: string, code: string) => `${sectionCode}/${code}`;

export interface SnapshotYear {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly isCurrent: boolean;
  readonly archived: boolean;
}

export interface SnapshotClass {
  readonly id: string;
  readonly sectionCode: SectionId;
  readonly code: string;
  readonly label: string;
  /** Key of the class of the next level (same year), null: terminal. */
  readonly nextKey: string | null;
}

export interface SnapshotPeriod {
  readonly kind: string;
  readonly sectionCode: SectionId | null;
  readonly number: number;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface SnapshotCalendarDay {
  readonly type: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly sectionCode: SectionId | null;
  readonly classKeys: readonly string[];
}

export interface SnapshotClassSubject {
  readonly classKey: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly subjectArchived: boolean;
  readonly coefficient: number;
  readonly hoursPerWeek: number | null;
}

export interface SnapshotAssignment {
  readonly classKey: string;
  readonly subjectId: string;
  readonly teacherId: string;
  readonly teacherName: string;
  readonly teacherActive: boolean;
}

export interface SnapshotSlot {
  readonly id: string;
  readonly classKey: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly teacherId: string;
  readonly roomId: string | null;
  readonly roomActive: boolean;
  readonly activityTypeId: string;
  readonly activityUsable: boolean;
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly weekParity: 'A' | 'B' | null;
  readonly division: string | null;
  readonly validTo: string;
}

export interface SnapshotStudent {
  readonly studentId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly studentNumber: string | null;
  readonly sectionCode: SectionId;
  readonly classKey: string;
  /** Class (in the new year) the student already has an open enrolment in: a previous run placed them. */
  readonly alreadyIn: string | null;
}

export interface RolloverSnapshot {
  readonly source: SnapshotYear;
  /** The year that already carries the new label (a re-run), null before the first run. */
  readonly target: SnapshotYear | null;
  readonly classes: readonly SnapshotClass[];
  readonly targetClassKeys: readonly string[];
  readonly periods: readonly SnapshotPeriod[];
  readonly targetPeriods: readonly SnapshotPeriod[];
  readonly calendarDays: readonly SnapshotCalendarDay[];
  readonly targetCalendarDays: readonly SnapshotCalendarDay[];
  readonly classSubjects: readonly SnapshotClassSubject[];
  readonly targetClassSubjectKeys: readonly string[];
  readonly assignments: readonly SnapshotAssignment[];
  readonly targetAssignmentKeys: readonly string[];
  readonly slots: readonly SnapshotSlot[];
  readonly targetSlotKeys: readonly string[];
  readonly students: readonly SnapshotStudent[];
}

export interface RolloverOptions {
  readonly label?: string;
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly copyAssignments: boolean;
  readonly copyTimetable: boolean;
  readonly overrides?: readonly {
    readonly studentId: string;
    readonly action: RolloverStudentAction;
  }[];
  readonly leavesOn?: string;
}

/** Why a request cannot be planned (400). */
export class PlanError extends Error {}

export interface PlannedPeriod extends SnapshotPeriod {
  readonly exists: boolean;
}
export interface PlannedCalendarDay extends SnapshotCalendarDay {
  readonly exists: boolean;
}
export interface PlannedClass {
  readonly key: string;
  readonly sourceId: string;
  readonly sectionCode: SectionId;
  readonly code: string;
  readonly label: string;
  readonly nextKey: string | null;
  readonly exists: boolean;
}
export interface PlannedClassSubject {
  readonly classKey: string;
  readonly subjectId: string;
  readonly coefficient: number;
  readonly hoursPerWeek: number | null;
  readonly exists: boolean;
}
export interface PlannedAssignment {
  readonly classKey: string;
  readonly subjectId: string;
  readonly teacherId: string;
  readonly exists: boolean;
}
export interface PlannedSlot {
  readonly sourceSlotId: string;
  readonly classKey: string;
  readonly subjectId: string;
  readonly teacherId: string;
  readonly roomId: string | null;
  readonly activityTypeId: string;
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly weekParity: 'A' | 'B' | null;
  readonly division: string | null;
  readonly exists: boolean;
}
export interface PlannedStudent {
  readonly studentId: string;
  readonly sourceClassKey: string;
  readonly defaultAction: RolloverStudentAction;
  readonly action: RolloverStudentAction;
  /** Key of the class in the new year; null for leave and graduate. */
  readonly targetKey: string | null;
  readonly skipped: RolloverSkipReason | null;
}

export interface RolloverPlan {
  readonly year: {
    readonly label: string;
    readonly startsOn: string;
    readonly endsOn: string;
    readonly exists: boolean;
  };
  readonly leavesOn: string;
  readonly periods: readonly PlannedPeriod[];
  readonly calendarDays: readonly PlannedCalendarDay[];
  readonly classes: readonly PlannedClass[];
  readonly classSubjects: readonly PlannedClassSubject[];
  readonly assignments: readonly PlannedAssignment[];
  readonly slots: readonly PlannedSlot[];
  /** The weekly timetable is copied (the groups step copies the sessions of groups when it is). */
  readonly copyTimetable: boolean;
  readonly students: readonly PlannedStudent[];
  /** The source year is archived by the apply (a no-op when it already is). */
  readonly archiveSource: boolean;
  /** The new year becomes the current one (only when the source was the current year). */
  readonly makeCurrent: boolean;
  /** What the plan itself leaves out or flags; the timetable conflicts are added while it runs. */
  readonly issues: readonly RolloverIssue[];
  readonly skipped: {
    readonly classSubjects: number;
    readonly assignments: number;
    readonly slots: number;
  };
}

export const slotKey = (s: {
  classKey: string;
  subjectId: string;
  teacherId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  weekParity: string | null;
  division: string | null;
}) =>
  [
    s.classKey,
    s.subjectId,
    s.teacherId,
    s.weekday,
    s.startTime,
    s.endTime,
    s.weekParity ?? '',
    s.division ?? '',
  ].join('|');

export const periodKey = (p: { kind: string; sectionCode: string | null; number: number }) =>
  `${p.kind}|${p.sectionCode ?? '*'}|${p.number}`;
export const calendarDayKey = (d: SnapshotCalendarDay) =>
  [
    d.type,
    d.label,
    d.startsOn,
    d.endsOn,
    d.sectionCode ?? '*',
    [...d.classKeys].sort().join(','),
  ].join('|');
export const classSubjectKey = (key: string, subjectId: string) => `${key}|${subjectId}`;
export const assignmentKey = (key: string, subjectId: string, teacherId: string) =>
  `${key}|${subjectId}|${teacherId}`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Builds the plan. Throws PlanError for a request that cannot be planned (bad dates, an override that does
 * not fit the student's class, the timetable without the assignments).
 */
export function buildPlan(snapshot: RolloverSnapshot, options: RolloverOptions): RolloverPlan {
  const { source } = snapshot;
  const label = options.label ?? nextYearLabel(source.label);
  if (!label) throw new PlanError('Indiquez le nom de la nouvelle année (par exemple 2027-2028).');
  // A year that already exists (a re-run) keeps its own dates.
  const existing = snapshot.target;
  const year = {
    label,
    startsOn: existing?.startsOn ?? options.startsOn ?? shiftYear(source.startsOn),
    endsOn: existing?.endsOn ?? options.endsOn ?? shiftYear(source.endsOn),
  };
  if (!DAY.test(year.startsOn) || !DAY.test(year.endsOn)) throw new PlanError('Dates invalides.');
  if (year.endsOn <= year.startsOn)
    throw new PlanError('La fin de l’année doit suivre son début.');
  if (label === source.label)
    throw new PlanError('La nouvelle année doit avoir un autre nom que l’année source.');
  if (year.startsOn <= source.startsOn)
    throw new PlanError('La nouvelle année doit commencer après l’année source.');
  if (options.copyTimetable && !options.copyAssignments)
    throw new PlanError(
      'Copier l’emploi du temps demande de copier aussi les affectations des enseignants.',
    );
  if (!snapshot.classes.length) throw new PlanError('L’année source n’a aucune classe à copier.');
  const target = snapshot.target;
  if (target && target.id === source.id)
    throw new PlanError('La nouvelle année doit être une autre année.');
  const leavesOn = options.leavesOn ?? source.endsOn;
  if (!DAY.test(leavesOn)) throw new PlanError('Date de départ invalide.');

  const years = yearsBetween(source.startsOn, year.startsOn);
  const issues: RolloverIssue[] = [];
  const classByKey = new Map(snapshot.classes.map((c) => [classKey(c.sectionCode, c.code), c]));
  const targetClasses = new Set(snapshot.targetClassKeys);
  const classLabel = (key: string) => classByKey.get(key)?.label ?? key;

  // Periods: moved by a year and held inside the new year.
  const havePeriod = new Set(snapshot.targetPeriods.map(periodKey));
  const periods: PlannedPeriod[] = [...snapshot.periods]
    .sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
    .flatMap((p) => {
      const moved = shiftRange(p, year, years);
      if (moved.outside) {
        issues.push({
          step: 'periods',
          level: 'warning',
          message: `« ${p.label} » tombe hors des dates de la nouvelle année : elle n’est pas copiée.`,
        });
        return [];
      }
      if (moved.clamped)
        issues.push({
          step: 'periods',
          level: 'warning',
          message: `« ${p.label} » dépasse les dates de la nouvelle année : elle est raccourcie (du ${moved.startsOn} au ${moved.endsOn}).`,
        });
      return [{ ...p, startsOn: moved.startsOn, endsOn: moved.endsOn, exists: havePeriod.has(periodKey(p)) }];
    });

  // Calendar days: moved by a year; holidays are flagged, since moveable feasts do not fall on the same date.
  const haveDay = new Set(snapshot.targetCalendarDays.map(calendarDayKey));
  const calendarDays: PlannedCalendarDay[] = [...snapshot.calendarDays]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label))
    .flatMap((d) => {
      const moved = shiftRange(d, year, years);
      if (moved.outside) {
        issues.push({
          step: 'calendar_days',
          level: 'warning',
          message: `« ${d.label} » tombe hors des dates de la nouvelle année : il n’est pas copié.`,
        });
        return [];
      }
      const planned = { ...d, startsOn: moved.startsOn, endsOn: moved.endsOn };
      if (SHIFTED_DAY_TYPES_TO_CHECK.includes(d.type))
        issues.push({
          step: 'calendar_days',
          level: 'warning',
          message: `« ${d.label} » est décalé d’un an (du ${moved.startsOn} au ${moved.endsOn}) : vérifiez la date, les fêtes mobiles ne tombent pas le même jour.`,
        });
      else if (moved.clamped)
        issues.push({
          step: 'calendar_days',
          level: 'warning',
          message: `« ${d.label} » dépasse les dates de la nouvelle année : il est raccourci.`,
        });
      return [{ ...planned, exists: haveDay.has(calendarDayKey(planned)) }];
    });

  // Classes.
  const classes: PlannedClass[] = [...snapshot.classes]
    .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode) || a.code.localeCompare(b.code))
    .map((c) => {
      const key = classKey(c.sectionCode, c.code);
      return {
        key,
        sourceId: c.id,
        sectionCode: c.sectionCode,
        code: c.code,
        label: c.label,
        nextKey: c.nextKey,
        exists: targetClasses.has(key),
      };
    });

  // Class subjects and coefficients.
  const haveClassSubject = new Set(snapshot.targetClassSubjectKeys);
  const classSubjects: PlannedClassSubject[] = [];
  let skippedClassSubjects = 0;
  for (const cs of [...snapshot.classSubjects].sort((a, b) =>
    classSubjectKey(a.classKey, a.subjectId).localeCompare(classSubjectKey(b.classKey, b.subjectId)),
  )) {
    if (cs.subjectArchived) {
      skippedClassSubjects++;
      issues.push({
        step: 'class_subjects',
        level: 'warning',
        message: `La matière « ${cs.subjectName} » est archivée : elle n’est pas copiée dans ${classLabel(cs.classKey)}.`,
      });
      continue;
    }
    classSubjects.push({
      classKey: cs.classKey,
      subjectId: cs.subjectId,
      coefficient: cs.coefficient,
      hoursPerWeek: cs.hoursPerWeek,
      exists: haveClassSubject.has(classSubjectKey(cs.classKey, cs.subjectId)),
    });
  }
  const copiedSubjects = new Set(classSubjects.map((c) => classSubjectKey(c.classKey, c.subjectId)));

  // Teaching assignments (optional).
  const haveAssignment = new Set(snapshot.targetAssignmentKeys);
  const assignments: PlannedAssignment[] = [];
  let skippedAssignments = 0;
  if (options.copyAssignments) {
    for (const a of [...snapshot.assignments].sort((x, y) =>
      assignmentKey(x.classKey, x.subjectId, x.teacherId).localeCompare(
        assignmentKey(y.classKey, y.subjectId, y.teacherId),
      ),
    )) {
      if (!copiedSubjects.has(classSubjectKey(a.classKey, a.subjectId))) {
        skippedAssignments++;
        continue;
      }
      if (!a.teacherActive) {
        skippedAssignments++;
        issues.push({
          step: 'assignments',
          level: 'warning',
          message: `${a.teacherName} n’a plus de compte actif : son affectation en ${classLabel(a.classKey)} n’est pas copiée.`,
        });
        continue;
      }
      assignments.push({
        classKey: a.classKey,
        subjectId: a.subjectId,
        teacherId: a.teacherId,
        exists: haveAssignment.has(assignmentKey(a.classKey, a.subjectId, a.teacherId)),
      });
    }
  }
  const copiedAssignments = new Set(
    assignments.map((a) => assignmentKey(a.classKey, a.subjectId, a.teacherId)),
  );

  // Timetable (optional): the rule in force at the end of the year runs for the whole new year.
  const haveSlot = new Set(snapshot.targetSlotKeys);
  const slots: PlannedSlot[] = [];
  let skippedSlots = 0;
  if (options.copyTimetable) {
    for (const s of [...snapshot.slots].sort((a, b) => a.id.localeCompare(b.id))) {
      // A series that ended earlier was dropped on purpose: it is not part of the next year.
      if (s.validTo < source.endsOn) continue;
      const where = `${s.subjectName}, ${classLabel(s.classKey)}, jour ${s.weekday} à ${s.startTime}`;
      const skip = (why: string) => {
        skippedSlots++;
        issues.push({ step: 'timetable', level: 'warning', message: `Séance non copiée (${where}) : ${why}` });
      };
      if (!copiedSubjects.has(classSubjectKey(s.classKey, s.subjectId))) {
        skip('la matière n’est pas copiée dans la classe.');
        continue;
      }
      if (!copiedAssignments.has(assignmentKey(s.classKey, s.subjectId, s.teacherId))) {
        skip('l’enseignant n’est pas affecté à cette matière dans la nouvelle année.');
        continue;
      }
      if (s.roomId && !s.roomActive) {
        skip('la salle n’est plus utilisée.');
        continue;
      }
      if (!s.activityUsable) {
        skip('le type d’activité n’est plus disponible pour l’emploi du temps.');
        continue;
      }
      slots.push({
        sourceSlotId: s.id,
        classKey: s.classKey,
        subjectId: s.subjectId,
        teacherId: s.teacherId,
        roomId: s.roomId,
        activityTypeId: s.activityTypeId,
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
        weekParity: s.weekParity,
        division: s.division,
        exists: haveSlot.has(slotKey(s)),
      });
    }
  }

  // Students.
  const overrides = new Map<string, RolloverStudentAction>();
  for (const o of options.overrides ?? []) {
    if (overrides.has(o.studentId)) throw new PlanError('Un élève apparaît deux fois dans les choix.');
    overrides.set(o.studentId, o.action);
  }
  const known = new Set(snapshot.students.map((s) => s.studentId));
  for (const id of overrides.keys())
    if (!known.has(id)) throw new PlanError('Un élève des choix n’est pas dans l’année source.');
  const students: PlannedStudent[] = [...snapshot.students]
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'fr') ||
        a.firstName.localeCompare(b.firstName, 'fr') ||
        a.studentId.localeCompare(b.studentId),
    )
    .map((s) => {
      const from = classByKey.get(s.classKey);
      if (!from) throw new PlanError('Un élève est inscrit dans une classe inconnue.');
      const terminal = from.nextKey === null;
      const defaultAction: RolloverStudentAction = terminal ? 'graduate' : 'promote';
      const action = overrides.get(s.studentId) ?? defaultAction;
      const name = `${s.firstName} ${s.lastName}`;
      if (action === 'graduate' && !terminal)
        throw new PlanError(`${name} n’est pas dans une classe terminale : il ne peut pas être diplômé.`);
      if ((action === 'promote' || action === 'section_change') && terminal)
        throw new PlanError(
          `${name} est dans une classe terminale : choisissez redoublement, départ ou diplôme.`,
        );
      const targetKey =
        action === 'leave' || action === 'graduate'
          ? null
          : action === 'repeat'
            ? s.classKey
            : from.nextKey;
      if (targetKey && !classByKey.has(targetKey))
        throw new PlanError(`La classe suivante de ${from.label} n’existe pas.`);
      return {
        studentId: s.studentId,
        sourceClassKey: s.classKey,
        defaultAction,
        action,
        targetKey,
        skipped: s.alreadyIn ? ('already_enrolled' as const) : null,
      };
    });
  const graduating = students.filter((s) => s.action === 'graduate' && !s.skipped).length;
  if (graduating)
    issues.push({
      step: 'students',
      level: 'warning',
      message: `${graduating} élève${graduating > 1 ? 's sortent' : ' sort'} des classes terminales : leur compte sera archivé (lecture seule, plus de connexion).`,
    });
  for (const c of classes)
    if (c.nextKey === null)
      issues.push({
        step: 'classes',
        level: 'warning',
        message: `${c.label} (${c.sectionCode === 'bac' ? 'Bac français' : 'Bac nationale'}) n’a pas de classe suivante : c’est une classe terminale, ses élèves obtiennent leur diplôme.`,
      });

  return {
    year: { ...year, exists: target !== null },
    leavesOn,
    periods,
    calendarDays,
    classes,
    classSubjects,
    assignments,
    slots,
    copyTimetable: options.copyTimetable,
    students,
    archiveSource: true,
    makeCurrent: source.isCurrent,
    issues,
    skipped: {
      classSubjects: skippedClassSubjects,
      assignments: skippedAssignments,
      slots: skippedSlots,
    },
  };
}

/** JSON with sorted object keys: the same value always gives the same text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The hash a preview hands out and the apply compares: the plan plus what running it reported (timetable
 * conflicts, the steps of other modules). It changes when anything the plan reads changes.
 */
export function planHash(plan: RolloverPlan, outcome: unknown): string {
  return createHash('sha256').update(stableStringify({ plan, outcome })).digest('hex');
}
