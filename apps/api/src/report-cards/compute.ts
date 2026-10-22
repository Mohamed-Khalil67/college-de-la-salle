import { averageOnTwenty, generalAverage } from '@cdls/shared';

export interface SubjectWeight {
  readonly subjectId: string;
  readonly subjectName: string;
  /** Weight of the subject in the general average. */
  readonly coefficient: number;
}

/**
 * A class's subjects and their weights, from its class subjects (one coefficient per subject and class,
 * however many teachers share it).
 */
export function subjectWeights(
  classSubjects: readonly {
    readonly subjectId: string;
    readonly coefficient: number;
    readonly subject: { readonly name: string };
  }[],
): SubjectWeight[] {
  return classSubjects.map((c) => ({
    subjectId: c.subjectId,
    subjectName: c.subject.name,
    coefficient: c.coefficient,
  }));
}

export interface PeriodGrade {
  readonly studentId: string;
  readonly subjectId: string;
  readonly score: number;
  readonly outOf: number;
  /** The event's coefficient. */
  readonly coefficient: number;
  /** The class the graded event belongs to (needed only when a student was in several classes). */
  readonly classId?: string;
}

export interface ComputedSubject extends SubjectWeight {
  readonly average: number | null;
  readonly gradeCount: number;
}

export interface ComputedReportCard {
  readonly studentId: string;
  readonly average: number | null;
  readonly rank: number | null;
  readonly subjects: readonly ComputedSubject[];
}

/**
 * Period report cards of one class. Subject average: the shared averageOnTwenty over the term's published
 * grades (weighted by each event's coefficient). General average: the subject averages weighted by
 * the subjects' coefficients, ignoring subjects without grades. Rank: by general average, ties share
 * a rank (1, 2, 2, 4), students without an average are not ranked.
 */
export function computeReportCards(
  studentIds: readonly string[],
  subjects: readonly SubjectWeight[],
  grades: readonly PeriodGrade[],
): ComputedReportCard[] {
  return computeCards(
    studentIds.map((studentId) => ({ studentId, subjects })),
    grades,
  );
}

/** The cards of a set of students, each with the subject list that applies to them (see `subjectsOfStudent`). */
export function computeCards(
  students: readonly { readonly studentId: string; readonly subjects: readonly SubjectWeight[] }[],
  grades: readonly PeriodGrade[],
): ComputedReportCard[] {
  const cards = students.map(({ studentId, subjects }) => {
    const mine = grades.filter((g) => g.studentId === studentId);
    const perSubject = subjects.map((s) => {
      const list = mine.filter((g) => g.subjectId === s.subjectId);
      return { ...s, average: averageOnTwenty(list), gradeCount: list.length };
    });
    return { studentId, average: generalAverage(perSubject), subjects: perSubject };
  });
  const ranked = cards.filter((c) => c.average !== null).sort((a, b) => b.average! - a.average!);
  return cards.map((c) => ({
    ...c,
    rank: c.average === null ? null : ranked.findIndex((r) => r.average === c.average) + 1,
  }));
}

/** A class a student was enrolled in during a period, with the subjects and coefficients of that class. */
export interface ClassStint {
  readonly classId: string;
  /** `YYYY-MM-DD`. */
  readonly enrolledOn: string;
  /** null while the enrolment is open; breaks the tie when two enrolments start the same day (a move on that day). */
  readonly leftOn?: string | null;
  readonly subjects: readonly SubjectWeight[];
}

/** Earlier enrolment first; of two starting the same day, the closed one before the open one. */
function byStint(a: ClassStint, b: ClassStint): number {
  return (
    a.enrolledOn.localeCompare(b.enrolledOn) ||
    (a.leftOn ?? '9999-12-31').localeCompare(b.leftOn ?? '9999-12-31')
  );
}

/** Does an enrolment (from `enrolledOn` to `leftOn`, null while open) overlap the period `[from, to]`? */
export function enrolledDuring(
  enrolment: { readonly enrolledOn: string; readonly leftOn: string | null },
  window: { readonly from: string; readonly to: string },
): boolean {
  return enrolment.enrolledOn <= window.to && (enrolment.leftOn === null || enrolment.leftOn >= window.from);
}

/** The class a student ended the period in: the latest enrolment (this is the class their card belongs to). */
export function primaryClassId(stints: readonly ClassStint[]): string | null {
  return [...stints].sort(byStint).at(-1)?.classId ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The subjects of a student's report card when they were in several classes during the period (a section
 * or class change): the subjects of the class they ended in, plus the subjects of the earlier classes
 * they have grades in. The coefficient of a subject is the coefficient of the class each of its grades
 * belongs to, averaged by the weight (event coefficients) of those grades: all the grades from one class
 * give exactly that class's coefficient; a subject graded in both classes gets a blend; a subject
 * with no grade keeps the coefficient of the latest class that teaches it. With one class this is the
 * class's own subject list, unchanged.
 */
export function subjectsOfStudent(
  stints: readonly ClassStint[],
  grades: readonly PeriodGrade[],
): SubjectWeight[] {
  const ordered = [...stints].sort(byStint);
  const latest = ordered.at(-1);
  if (!latest) return [];
  if (ordered.length === 1) return [...latest.subjects];

  const listed = new Map<string, SubjectWeight>();
  for (const stint of [...ordered].reverse())
    for (const s of stint.subjects) if (!listed.has(s.subjectId)) listed.set(s.subjectId, s);
  const graded = new Set(grades.map((g) => g.subjectId));
  const inLatest = new Set(latest.subjects.map((s) => s.subjectId));

  const out: SubjectWeight[] = [];
  for (const [subjectId, fallback] of listed) {
    if (!inLatest.has(subjectId) && !graded.has(subjectId)) continue;
    let weight = 0;
    let weighted = 0;
    for (const stint of ordered) {
      const cs = stint.subjects.find((s) => s.subjectId === subjectId);
      if (!cs) continue;
      const w = grades
        .filter((g) => g.subjectId === subjectId && g.classId === stint.classId)
        .reduce((sum, g) => sum + g.coefficient, 0);
      weight += w;
      weighted += w * cs.coefficient;
    }
    out.push({
      subjectId,
      subjectName: fallback.subjectName,
      coefficient: weight > 0 ? round2(weighted / weight) : fallback.coefficient,
    });
  }
  return out.sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'fr'));
}
