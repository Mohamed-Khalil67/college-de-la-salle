import { averageOnTwenty, round1 } from '@cdls/shared';

export interface SubjectWeight {
  readonly subjectId: string;
  readonly subjectName: string;
  /** Weight of the subject in the general average. */
  readonly coefficient: number;
}

export interface TermGrade {
  readonly studentId: string;
  readonly subjectId: string;
  readonly score: number;
  readonly outOf: number;
  /** The event's coefficient. */
  readonly coefficient: number;
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
 * Term report cards of one class. Subject average: the shared averageOnTwenty over the term's published
 * grades (weighted by each event's coefficient). General average: the subject averages weighted by
 * the subjects' coefficients, ignoring subjects without grades. Rank: by general average, ties share
 * a rank (1, 2, 2, 4), students without an average are not ranked.
 */
export function computeReportCards(
  studentIds: readonly string[],
  subjects: readonly SubjectWeight[],
  grades: readonly TermGrade[],
): ComputedReportCard[] {
  const cards = studentIds.map((studentId) => {
    const mine = grades.filter((g) => g.studentId === studentId);
    const perSubject = subjects.map((s) => {
      const list = mine.filter((g) => g.subjectId === s.subjectId);
      return { ...s, average: averageOnTwenty(list), gradeCount: list.length };
    });
    const graded = perSubject.filter((s) => s.average !== null && s.coefficient > 0);
    const weight = graded.reduce((sum, s) => sum + s.coefficient, 0);
    const average =
      weight > 0
        ? round1(graded.reduce((sum, s) => sum + s.average! * s.coefficient, 0) / weight)
        : null;
    return { studentId, average, subjects: perSubject };
  });
  const ranked = cards.filter((c) => c.average !== null).sort((a, b) => b.average! - a.average!);
  return cards.map((c) => ({
    ...c,
    rank: c.average === null ? null : ranked.findIndex((r) => r.average === c.average) + 1,
  }));
}
