import {
  addDays,
  generalAverage,
  matiereName,
  type StudentAttendanceDto,
  type StudentGradeDto,
  type StudentGradesDto,
} from '@cdls/shared';

export type SubjectGrades = StudentGradesDto['subjects'][number];

/** Subjects in alphabetical order of their French name, newest grade first inside each. */
export function subjectsByName(data: StudentGradesDto): SubjectGrades[] {
  return [...data.subjects]
    .map((s) => ({ ...s, grades: [...s.grades].sort(byNewest) }))
    .sort((a, b) => matiereName(a.subjectId).localeCompare(matiereName(b.subjectId), 'fr'));
}

/** The most recent grades across subjects. */
export function latestGrades(data: StudentGradesDto, count: number): StudentGradeDto[] {
  return data.subjects
    .flatMap((s) => s.grades)
    .sort(byNewest)
    .slice(0, count);
}

function byNewest(a: StudentGradeDto, b: StudentGradeDto): number {
  return b.event.date.localeCompare(a.event.date) || b.grade.updatedAt.localeCompare(a.grade.updatedAt);
}

/**
 * The general average shown to the student, computed like the report card's: the subject averages
 * weighted by each subject's coefficient in the student's class (subjects not taught in the class are
 * left out), one decimal.
 */
export function overallAverage(subjects: readonly Pick<SubjectGrades, 'average' | 'coefficient'>[]): number | null {
  return generalAverage(subjects);
}

/** A grade published or corrected in the last `days` days is flagged « Nouvelle ». */
export function isRecent(updatedAt: string, today: string, days = 7): boolean {
  return updatedAt.slice(0, 10) >= addDays(today, -days);
}

/** Width of a meter bar for an average on 20, as a percentage. */
export function meterWidth(average: number | null): number {
  return average === null ? 0 : Math.max(0, Math.min(100, (average / 20) * 100));
}

export interface AttendanceCounts {
  readonly absent: number;
  readonly late: number;
  readonly excused: number;
}

export function attendanceCounts(list: readonly StudentAttendanceDto[]): AttendanceCounts {
  const count = (status: string) => list.filter((a) => a.record.status === status).length;
  return { absent: count('absent'), late: count('late'), excused: count('excused') };
}
