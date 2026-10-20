/**
 * The REST contract between apps/api and apps/web: request and response shapes of /api.
 * The Nest DTO classes implement these interfaces, so a change here fails the API build until it follows.
 * Dates are `YYYY-MM-DD` strings, timestamps ISO 8601 strings, decimals plain numbers.
 */
import type { Attachment, EventKind } from './calendar.js';
import type { SectionId } from './space.js';

export type Role = 'admin' | 'teacher' | 'student';
export const ROLES: readonly Role[] = ['admin', 'teacher', 'student'];

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
];

/* ------------------------------------------------------------------------------------------------
 * Common
 * ---------------------------------------------------------------------------------------------- */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `?page=1&pageSize=20` on every list endpoint. */
export interface PageQuery {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Body of every error response (Nest's default shape). */
export interface ApiError {
  readonly statusCode: number;
  readonly message: string | readonly string[];
  readonly error?: string;
}

/* ------------------------------------------------------------------------------------------------
 * Auth: /api/auth. The refresh token travels only in an httpOnly cookie.
 * ---------------------------------------------------------------------------------------------- */

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly firstName: string;
  readonly lastName: string;
  /** Set for students. */
  readonly studentId: string | null;
  /** Set for teachers. */
  readonly teacherId: string | null;
  /** Students: their class in the current school year (null when not enrolled or not a student). */
  readonly classId: string | null;
}

/** Returned by POST /auth/login and POST /auth/refresh. Send `Authorization: Bearer <accessToken>`. */
export interface SessionResponse {
  readonly accessToken: string;
  /** Seconds until the access token expires; refresh before then. */
  readonly expiresIn: number;
  readonly user: SessionUser;
}

/* ------------------------------------------------------------------------------------------------
 * Users: /api/users (admin)
 * ---------------------------------------------------------------------------------------------- */

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly firstName: string;
  readonly lastName: string;
  readonly isActive: boolean;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly studentId: string | null;
  readonly teacherId: string | null;
  readonly studentNumber: string | null;
  /** Students: their class in the current school year. */
  readonly classId: string | null;
}

export interface UserListQuery extends PageQuery {
  readonly role?: Role;
  /** Matches e-mail, first or last name. */
  readonly search?: string;
}

export interface CreateUserRequest {
  readonly email: string;
  readonly role: Role;
  readonly firstName: string;
  readonly lastName: string;
  /** Omit to get a generated temporary password back. */
  readonly password?: string;
  readonly studentNumber?: string;
  /** Students: enrol in this class (current school year). */
  readonly classId?: string;
}

export interface CreatedUserResponse {
  readonly user: UserDto;
  /** Only when the password was generated; shown once. */
  readonly temporaryPassword: string | null;
}

export interface UpdateUserRequest {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isActive?: boolean;
  readonly password?: string;
}

/**
 * POST /users/import, multipart field `file`: a UTF-8 CSV with the header
 * `email,firstName,lastName,role,studentNumber,section,class` (section/class: codes, students only).
 * All rows are checked first; nothing is created if one is invalid (400 with `errors`).
 */
export interface ImportUsersResponse {
  readonly created: readonly {
    readonly email: string;
    readonly role: Role;
    readonly temporaryPassword: string;
  }[];
}

export interface ImportUsersError {
  readonly line: number;
  readonly message: string;
}

/* ------------------------------------------------------------------------------------------------
 * School structure
 * ---------------------------------------------------------------------------------------------- */

export interface TermDto {
  readonly id: string;
  readonly schoolYearId: string;
  readonly number: number;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly closedAt: string | null;
}

export interface SchoolYearDto {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly isCurrent: boolean;
  readonly terms: readonly TermDto[];
}

export interface CreateSchoolYearRequest {
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface CreateTermRequest {
  readonly number: number;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface SectionDto {
  readonly id: string;
  readonly code: SectionId;
  readonly label: string;
}

export interface ClassDto {
  readonly id: string;
  readonly schoolYearId: string;
  readonly sectionId: string;
  readonly sectionCode: SectionId;
  readonly code: string;
  readonly label: string;
  readonly studentCount: number;
}

export interface CreateClassRequest {
  readonly schoolYearId: string;
  readonly sectionId: string;
  readonly code: string;
  readonly label: string;
}

export interface StudentSummaryDto {
  /** Student id (not the user id). */
  readonly id: string;
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly studentNumber: string | null;
}

/** GET /classes/:id/students: a student of the roster with the enrolment to remove them (DELETE /enrollments/:id). */
export interface ClassStudentDto extends StudentSummaryDto {
  readonly enrollmentId: string;
}

export interface EnrollmentDto {
  readonly id: string;
  readonly studentId: string;
  readonly classId: string;
  readonly schoolYearId: string;
  readonly enrolledOn: string;
  readonly leftOn: string | null;
}

export interface SubjectDto {
  readonly id: string;
  readonly name: string;
  readonly group: string;
}

export interface TeachingAssignmentDto {
  readonly id: string;
  readonly teacherId: string;
  readonly teacherName: string;
  readonly classId: string;
  readonly classLabel: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly coefficient: number;
}

export interface CreateTeachingAssignmentRequest {
  readonly teacherId: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly coefficient?: number;
}

/* ------------------------------------------------------------------------------------------------
 * Calendar: /api/events
 * Audience: classId → one class; only sectionId → a section; neither → the whole school.
 * ---------------------------------------------------------------------------------------------- */

export interface EventDto {
  readonly id: string;
  readonly kind: EventKind;
  readonly title: string;
  readonly subjectId: string | null;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly repeatUntil: string | null;
  readonly place: string;
  readonly description: string;
  readonly attachments: readonly Attachment[];
  readonly coefficient: number;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EventInput {
  readonly kind: EventKind;
  readonly title: string;
  readonly subjectId?: string | null;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
  readonly date: string;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly repeatUntil?: string | null;
  readonly place?: string;
  readonly description?: string;
  readonly attachments?: readonly Attachment[];
  readonly coefficient?: number;
}

/** GET /events?from&to (max 186 days), plus optional classId / sectionId filters for staff. */
export interface EventRangeQuery {
  readonly from: string;
  readonly to: string;
  readonly classId?: string;
  readonly sectionId?: string;
}

/** One day of a (possibly weekly) event: GET /events/occurrences. */
export interface OccurrenceDto {
  /** `eventId@day`. */
  readonly key: string;
  readonly day: string;
  readonly event: EventDto;
}

/* ------------------------------------------------------------------------------------------------
 * Homework
 * ---------------------------------------------------------------------------------------------- */

export interface HomeworkDto {
  readonly event: EventDto;
  readonly done: boolean;
  readonly doneAt: string | null;
}

export interface HomeworkCompletionDto {
  readonly student: StudentSummaryDto;
  readonly doneAt: string;
}

/* ------------------------------------------------------------------------------------------------
 * Grades
 * ---------------------------------------------------------------------------------------------- */

export interface GradeDto {
  readonly id: string;
  readonly eventId: string;
  readonly studentId: string;
  readonly score: number;
  readonly outOf: number;
  readonly comment: string;
  readonly published: boolean;
  readonly updatedAt: string;
}

/** GET /events/:id/grades: the whole class with each student's grade, for the entry grid. */
export interface GradeSheetDto {
  readonly event: EventDto;
  readonly rows: readonly {
    readonly student: StudentSummaryDto;
    readonly grade: GradeDto | null;
  }[];
}

export interface GradeEntry {
  readonly studentId: string;
  /** null removes the grade. */
  readonly score: number | null;
  readonly comment?: string;
}

/** PUT /events/:id/grades */
export interface SaveGradesRequest {
  /** Defaults to 20. */
  readonly outOf?: number;
  readonly entries: readonly GradeEntry[];
}

/** POST /events/:id/grades/publish */
export interface PublishGradesRequest {
  readonly published: boolean;
}

export interface StudentGradeDto {
  readonly grade: GradeDto;
  readonly event: Pick<EventDto, 'id' | 'kind' | 'title' | 'date' | 'subjectId' | 'coefficient'>;
}

/** GET /students/:id/grades (students: their own, published only). */
export interface StudentGradesDto {
  readonly studentId: string;
  readonly subjects: readonly {
    readonly subjectId: string;
    /** Weighted average on 20 (shared averageOnTwenty), null without grades. */
    readonly average: number | null;
    /**
     * Weight of the subject in the general average of the student's class (its teaching assignment), as
     * on the report card; null when the subject is not taught in that class (left out, like the report card).
     * Combine with the shared generalAverage().
     */
    readonly coefficient: number | null;
    readonly grades: readonly StudentGradeDto[];
  }[];
}

/* ------------------------------------------------------------------------------------------------
 * Attendance
 * ---------------------------------------------------------------------------------------------- */

export interface AttendanceRecordDto {
  readonly id: string;
  readonly eventId: string;
  readonly studentId: string;
  readonly date: string;
  readonly status: AttendanceStatus;
  readonly minutesLate: number | null;
  readonly note: string;
}

/** GET /events/:id/attendance?date= */
export interface AttendanceSheetDto {
  readonly event: EventDto;
  readonly date: string;
  readonly rows: readonly {
    readonly student: StudentSummaryDto;
    readonly record: AttendanceRecordDto | null;
  }[];
}

/** PUT /events/:id/attendance */
export interface SaveAttendanceRequest {
  /** Must be a day on which the event takes place. */
  readonly date: string;
  readonly records: readonly {
    readonly studentId: string;
    readonly status: AttendanceStatus;
    readonly minutesLate?: number | null;
    readonly note?: string;
  }[];
}

export interface StudentAttendanceDto {
  readonly record: AttendanceRecordDto;
  readonly event: Pick<EventDto, 'id' | 'kind' | 'title' | 'subjectId' | 'startTime' | 'endTime'>;
}

/* ------------------------------------------------------------------------------------------------
 * Announcements: /api/posts
 * ---------------------------------------------------------------------------------------------- */

export interface PostDto {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly subjectId: string | null;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: string;
}

export interface CreatePostRequest {
  readonly title: string;
  readonly body: string;
  readonly subjectId?: string | null;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
}

/* ------------------------------------------------------------------------------------------------
 * Report cards
 * ---------------------------------------------------------------------------------------------- */

export interface ReportCardSubjectDto {
  readonly subjectId: string;
  readonly subjectName: string;
  readonly coefficient: number;
  /** On 20, null when the subject had no published grade in the term. */
  readonly average: number | null;
  readonly gradeCount: number;
}

export interface ReportCardDto {
  readonly id: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly termId: string;
  readonly classId: string;
  readonly average: number | null;
  readonly rank: number | null;
  readonly appreciation: string;
  readonly subjects: readonly ReportCardSubjectDto[];
  readonly generatedAt: string;
  readonly publishedAt: string | null;
}

/** POST /terms/:id/report-cards/generate and /publish (a closed term). */
export interface ReportCardBatchRequest {
  /** Omit for every class of the term's school year. */
  readonly classId?: string;
}

export interface ReportCardBatchResponse {
  readonly count: number;
}

/* ------------------------------------------------------------------------------------------------
 * Contact messages: POST /api/contact (public, rate-limited), /api/contact-messages (admin)
 * ---------------------------------------------------------------------------------------------- */

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  subject: 120,
  track: 120,
  message: 1000,
} as const;

/** POST /contact: a message from the public site to the secretariat. */
export interface ContactMessageRequest {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly phone?: string;
  /** Track and class the message is about (« Bac français, lycée »). */
  readonly track?: string;
  /**
   * Honeypot: a field hidden from people. Robots that fill it get the usual 204, and their message is
   * dropped. The site always sends it empty.
   */
  readonly website?: string;
}

export interface ContactMessageDto {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly subject: string;
  readonly track: string;
  readonly message: string;
  readonly createdAt: string;
  /** When an admin marked it handled; null while it is waiting. */
  readonly handledAt: string | null;
  readonly handledByName: string | null;
}

/** GET /contact-messages (newest first). */
export interface ContactMessageListQuery extends PageQuery {
  /** true: handled only; false: waiting only; omitted: all. */
  readonly handled?: boolean;
}

/** PATCH /contact-messages/:id */
export interface UpdateContactMessageRequest {
  readonly handled: boolean;
}

/** Most ids POST /contact-messages/handle takes at once. */
export const CONTACT_BULK_MAX = 100;

/** POST /contact-messages/handle: marks several messages handled at once (admins). */
export interface HandleContactMessagesRequest {
  /** 1 to CONTACT_BULK_MAX message ids. Unknown or already handled ones are skipped. */
  readonly ids: readonly string[];
}

export interface HandleContactMessagesResponse {
  /** How many messages this request marked handled (already handled or deleted ones are not counted). */
  readonly handled: number;
}
