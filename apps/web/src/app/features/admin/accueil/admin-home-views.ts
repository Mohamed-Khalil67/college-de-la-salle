import {
  type ClassDto,
  type ContactMessageDto,
  daysBetween,
  type Paginated,
  type PeriodDto,
  type PostDto,
  type ReportPreparationDto,
  type SchoolYearDto,
  SECTION_LABELS,
  type SectionChangeRequestDto,
  type UserDto,
} from '@cdls/shared';
import { currentTerm, currentYear } from '../../../shared/utils/format';

/**
 * What each block of the administration's home shows, from the API's data: plain functions (Vitest checks
 * them). Each returns null when the block has nothing to show (its empty state).
 */

/** How many lines a block lists before its entry link takes over. */
export const LIST_LIMIT = 3;
export const NAMES_LIMIT = 4;

export interface ApprovalLine {
  readonly id: string;
  readonly student: string;
  /** « Bac français vers Bac nationale » */
  readonly change: string;
}

export interface ApprovalsView {
  readonly pending: number;
  readonly lines: readonly ApprovalLine[];
  /** Accounts still on their temporary password; null when that count could not be read. */
  readonly neverActivated: number | null;
}

/** Section-change requests waiting for a decision, and accounts nobody has activated yet. */
export function approvalsView(
  requests: Paginated<SectionChangeRequestDto>,
  neverActivated: number | null,
): ApprovalsView | null {
  if (requests.total === 0 && !neverActivated) return null;
  return {
    pending: requests.total,
    lines: requests.items.slice(0, LIST_LIMIT).map((r) => ({
      id: r.id,
      student: `${r.studentFirstName} ${r.studentLastName}`,
      change: `${SECTION_LABELS[r.fromSection]} vers ${SECTION_LABELS[r.toSection]}`,
    })),
    neverActivated,
  };
}

export interface MessagesView {
  readonly waiting: number;
  readonly latest: readonly ContactMessageDto[];
}

/** The contact-form messages nobody has handled yet, newest first. */
export function messagesView(waiting: Paginated<ContactMessageDto>): MessagesView | null {
  if (waiting.total === 0) return null;
  return { waiting: waiting.total, latest: waiting.items.slice(0, LIST_LIMIT) };
}

export interface ClassesView {
  readonly classCount: number;
  readonly averageSize: number;
  /** Active students that no class holds; null when the number of students could not be read. */
  readonly withoutClass: number | null;
}

export function classesView(classes: readonly ClassDto[], activeStudents: number | null): ClassesView | null {
  if (!classes.length) return null;
  const enrolled = classes.reduce((sum, c) => sum + c.studentCount, 0);
  return {
    classCount: classes.length,
    averageSize: Math.round(enrolled / classes.length),
    withoutClass: activeStudents === null ? null : Math.max(0, activeStudents - enrolled),
  };
}

export interface LateTeacher {
  readonly teacherId: string;
  readonly name: string;
  /** Subjects (of any class) still to finish. */
  readonly count: number;
}

export interface ReportsView {
  readonly termLabel: string;
  readonly closed: boolean;
  readonly endsOn: string;
  /** Days from today to the end of the term; 0 once it is over. */
  readonly daysLeft: number;
  readonly readySubjects: number;
  readonly subjectCount: number;
  readonly readyPercent: number;
  readonly completeClasses: number;
  readonly classCount: number;
  readonly lateTeachers: readonly LateTeacher[];
  /** All of them, the list above shows the first few. */
  readonly lateTeacherCount: number;
}

/** The term's grade progress and the teachers most behind (null: no term today, or no class). */
export function reportsView(prep: ReportPreparationDto | null, today: string): ReportsView | null {
  if (!prep || prep.classCount === 0) return null;
  const late = new Map<string, LateTeacher>();
  for (const c of prep.classes)
    for (const gap of c.gaps)
      for (const t of gap.teachers) {
        const seen = late.get(t.teacherId);
        late.set(t.teacherId, { teacherId: t.teacherId, name: t.name, count: (seen?.count ?? 0) + 1 });
      }
  const lateTeachers = [...late.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  return {
    termLabel: prep.period.label,
    closed: prep.period.closedAt !== null,
    endsOn: prep.period.endsOn,
    daysLeft: Math.max(0, daysBetween(today, prep.period.endsOn)),
    readySubjects: prep.readySubjectCount,
    subjectCount: prep.subjectCount,
    readyPercent: prep.subjectCount ? Math.round((prep.readySubjectCount / prep.subjectCount) * 100) : 0,
    completeClasses: prep.completeClassCount,
    classCount: prep.classCount,
    lateTeachers: lateTeachers.slice(0, NAMES_LIMIT),
    lateTeacherCount: lateTeachers.length,
  };
}

export interface RolesView {
  readonly planners: readonly string[];
  readonly plannerCount: number;
  /** Active administrators; null when that count could not be read. */
  readonly adminCount: number | null;
}

/** Who holds the Planificateur permission (the page's own list) and how many administrators there are. */
export function rolesView(planners: Paginated<UserDto>, adminCount: number | null): RolesView {
  return {
    planners: planners.items.slice(0, NAMES_LIMIT).map((u) => `${u.firstName} ${u.lastName}`),
    plannerCount: planners.total,
    adminCount,
  };
}

export interface YearView {
  readonly year: SchoolYearDto;
  /** The term of today; null between two terms. */
  readonly term: PeriodDto | null;
  readonly daysLeft: number;
  /** The year being prepared (not started yet), if any. */
  readonly next: SchoolYearDto | null;
}

export function yearView(years: readonly SchoolYearDto[], today: string): YearView | null {
  const year = currentYear(years);
  if (!year) return null;
  const next = years.filter((y) => y.status === 'upcoming').sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  return {
    year,
    term: currentTerm(years, today),
    daysLeft: Math.max(0, daysBetween(today, year.endsOn)),
    next: next ?? null,
  };
}

/** The two latest announcements of the school. */
export function newsView(page: Paginated<PostDto>): readonly PostDto[] | null {
  return page.items.length ? page.items.slice(0, 2) : null;
}
