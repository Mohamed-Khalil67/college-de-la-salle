/**
 * The REST contract between apps/api and apps/web: request and response shapes of /api.
 * The Nest DTO classes implement these interfaces, so a change here fails the API build until it follows.
 * Dates are `YYYY-MM-DD` strings, timestamps ISO 8601 strings, decimals plain numbers.
 */
import type { ActivityColour, ActivityIcon, Attachment } from './calendar.js';
import type { SectionId } from './space.js';
import type {
  OccurrenceStatus,
  SessionChange,
  SlotExceptionKind,
  SlotScope,
  WeekParity,
} from './timetable.js';

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
  /** Teachers marked coordinateur by the admin: they edit the year's structure too. */
  readonly isCoordinator: boolean;
  /** Students: the label of that class (« Première »). */
  readonly classLabel: string | null;
  /** Students: their section (null when not set or not a student). */
  readonly sectionCode: SectionId | null;
  /**
   * First sign-in or password reset by the administration: until the user chooses a password
   * (POST /auth/password), every other route answers 403 with `error: PASSWORD_CHANGE_REQUIRED`.
   */
  readonly mustChangePassword: boolean;
}

/** `error` of the 403 sent while the user must still choose a password. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/** Returned by POST /auth/login and POST /auth/refresh. Send `Authorization: Bearer <accessToken>`. */
export interface SessionResponse {
  readonly accessToken: string;
  /** Seconds until the access token expires; refresh before then. */
  readonly expiresIn: number;
  readonly user: SessionUser;
}

/**
 * POST /auth/password: the signed-in user chooses a new password (rules: `passwordProblems`). Every
 * other session is signed out; the response is a fresh session for this one (new refresh cookie).
 */
export interface ChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
}

/**
 * POST /auth/forgot-password (public): asks for a reset link by e-mail. `identifier` is the login e-mail.
 * Always answers 204, whether or not an active account matches (nothing reveals which accounts exist).
 */
export interface ForgotPasswordRequest {
  readonly identifier: string;
}

/**
 * POST /auth/reset-password (public): chooses a new password with the single-use token from the e-mailed
 * link (rules: `passwordProblems`). 204 on success: every session of the account is signed out and the
 * user signs in again with the new password. 400 when the link is invalid, expired or already used.
 */
export interface ResetPasswordRequest {
  readonly token: string;
  readonly newPassword: string;
}

/* ------------------------------------------------------------------------------------------------
 * Users: /api/users (admin)
 * ---------------------------------------------------------------------------------------------- */

/** `archived`: graduated or left the school; no sign-in, kept read-only. */
export type UserStatus = 'active' | 'disabled' | 'archived';
export const USER_STATUSES: readonly UserStatus[] = ['active', 'disabled', 'archived'];

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: UserStatus;
  /** Still on the temporary password given by the administration. */
  readonly mustChangePassword: boolean;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly studentId: string | null;
  readonly teacherId: string | null;
  readonly studentNumber: string | null;
  /** Students: their class in the current school year. */
  readonly classId: string | null;
  /** Teachers only (false for everyone else). */
  readonly isCoordinator: boolean;
  /** Students: their section. */
  readonly sectionCode: SectionId | null;
  /** Students: the day they graduated (archived accounts). */
  readonly graduatedOn: string | null;
}

export interface UserListQuery extends PageQuery {
  readonly role?: Role;
  readonly status?: UserStatus;
  /** Matches e-mail, first or last name. */
  readonly search?: string;
}

export interface CreateUserRequest {
  /** Leave out to get the school e-mail `prenom.nom@<school domain>` (numbered when taken). */
  readonly email?: string;
  readonly role: Role;
  readonly firstName: string;
  readonly lastName: string;
  readonly studentNumber?: string;
  /** Students: `YYYY-MM-DD`. */
  readonly birthDate?: string;
  /** Students: enrol in this class (current school year); it also sets the student's section. */
  readonly classId?: string;
}

/** The account is created with a temporary password, shown once; the user must change it at first sign-in. */
export interface CreatedUserResponse {
  readonly user: UserDto;
  readonly temporaryPassword: string;
}

export interface UpdateUserRequest {
  readonly firstName?: string;
  readonly lastName?: string;
  /**
   * `disabled` blocks sign-in (and signs the user out); `active` re-enables it, and also restores an
   * archived account. Archiving goes through POST /users/archive.
   */
  readonly status?: Exclude<UserStatus, 'archived'>;
  /** A new temporary password: the user is signed out and must choose their own at next sign-in. */
  readonly password?: string;
  /** Teachers only: coordinateur (edits subjects, rooms, periods, calendar days, school years). */
  readonly isCoordinator?: boolean;
}

/** Accounts a roster import creates (admins are created one by one). */
export type ImportRole = 'student' | 'teacher';
export const IMPORT_ROLES: readonly ImportRole[] = ['student', 'teacher'];

/**
 * POST /users/import/preview and POST /users/import, multipart field `file` plus `?role=student|teacher`:
 * a UTF-8 CSV (comma or semicolon) with a header row.
 * - students: `lastName,firstName,section,class,studentNumber,birthDate` (section and class are codes,
 *   e.g. `bac,seconde`; studentNumber and birthDate optional, birthDate `YYYY-MM-DD` or `JJ/MM/AAAA`);
 * - teachers: `lastName,firstName`.
 * E-mails are generated (`prenom.nom@<school domain>`). Every line is checked first: the preview lists
 * the accounts and the errors, and the import creates nothing (400 with `errors`) if one line is invalid.
 */
export interface ImportUsersQuery {
  readonly role: ImportRole;
  /**
   * Lines (as numbered in the file) whose person already has an account with the same name, section and
   * class, but who is a genuine homonym: create them anyway (`createAnyway=3,7`). Without it, those lines
   * are skipped as « déjà présent ». Does not apply to a line whose student number is already in the school.
   */
  readonly createAnyway?: readonly number[];
}

export const ROSTER_HEADERS: Readonly<Record<ImportRole, readonly string[]>> = {
  student: ['lastName', 'firstName', 'section', 'class', 'studentNumber', 'birthDate'],
  teacher: ['lastName', 'firstName'],
};

export interface ImportPreviewRow {
  /** Line in the file (the header is line 1). */
  readonly line: number;
  readonly lastName: string;
  readonly firstName: string;
  /** The login e-mail: generated, or the one the student already has. */
  readonly email: string;
  /** 1 for `prenom.nom`; n when the address was taken by n - 1 homonyms (`prenom.nom2`…). */
  readonly emailNumber: number;
  /** « car 1 homonyme » when the address carries a number, else null. */
  readonly emailNote: string | null;
  /**
   * The person already has an account (same student number, or same name and section and class): it is kept
   * as it is, and no new account or e-mail is made for the line.
   */
  readonly alreadyImported: boolean;
  /** Why `alreadyImported` (or the choice to create anyway) applies: null for a new person. */
  readonly matchedBy: 'studentNumber' | 'name' | null;
  /** The line matched an account by name but the request asks to create it anyway (a genuine homonym). */
  readonly createAnyway: boolean;
  readonly sectionCode: SectionId | null;
  readonly classLabel: string | null;
  readonly studentNumber: string | null;
  readonly birthDate: string | null;
}

export interface ImportPreviewResponse {
  readonly role: ImportRole;
  readonly rows: readonly ImportPreviewRow[];
  /** Empty when the file can be imported as it is. */
  readonly errors: readonly ImportUsersError[];
}

export interface ImportUsersResponse {
  readonly created: readonly {
    readonly email: string;
    readonly role: Role;
    readonly firstName: string;
    readonly lastName: string;
    readonly temporaryPassword: string;
  }[];
}

export interface ImportUsersError {
  readonly line: number;
  readonly message: string;
}

/** Why a student's account is archived. */
export type ArchiveOutcome = 'graduated' | 'left';
export const ARCHIVE_OUTCOMES: readonly ArchiveOutcome[] = ['graduated', 'left'];

/**
 * POST /users/archive: students who graduated or left, by id or a whole class (exactly one of the two).
 * Their accounts are archived (no sign-in), their current enrolment closed on `on`, their sessions ended
 * and any pending section-change request rejected. Grades and report cards stay.
 */
export interface ArchiveStudentsRequest {
  readonly studentIds?: readonly string[];
  readonly classId?: string;
  readonly outcome: ArchiveOutcome;
  /** `YYYY-MM-DD`. */
  readonly on: string;
}

export interface ArchiveStudentsResponse {
  readonly archived: number;
}

/* ------------------------------------------------------------------------------------------------
 * Section changes: /api/section-changes. A student (or the secretariat for them) asks; an admin decides.
 * ---------------------------------------------------------------------------------------------- */

export type SectionChangeStatus = 'pending' | 'approved' | 'rejected';
export const SECTION_CHANGE_STATUSES: readonly SectionChangeStatus[] = [
  'pending',
  'approved',
  'rejected',
];

export const SECTION_CHANGE_LIMITS = { reason: 1000, note: 1000 } as const;

export interface SectionChangeRequestDto {
  readonly id: string;
  readonly studentId: string;
  readonly studentFirstName: string;
  readonly studentLastName: string;
  readonly studentEmail: string;
  /** The student's current class (null when not enrolled). */
  readonly currentClassLabel: string | null;
  readonly fromSection: SectionId;
  readonly toSection: SectionId;
  readonly reason: string;
  readonly status: SectionChangeStatus;
  /** The name of whoever asked: the student, or a member of staff for them. */
  readonly requestedByName: string;
  readonly requestedByStudent: boolean;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly decidedByName: string | null;
  readonly decisionNote: string;
  /** Approved requests: the class the student moved to. */
  readonly newClassLabel: string | null;
}

export interface SectionChangeListQuery extends PageQuery {
  readonly status?: SectionChangeStatus;
}

/** A student sends only `toSection` and `reason`; an admin also names the student. One pending request per student. */
export interface CreateSectionChangeRequest {
  readonly studentId?: string;
  readonly toSection: SectionId;
  readonly reason: string;
}

/** Moves the student, in one transaction, to `classId` (a class of the new section, current school year). */
export interface ApproveSectionChangeRequest {
  readonly classId: string;
  readonly note?: string;
}

export interface RejectSectionChangeRequest {
  readonly note: string;
}

/* ------------------------------------------------------------------------------------------------
 * School structure. Writes: the admin or a coordinator (classes and assignments: the admin only).
 * ---------------------------------------------------------------------------------------------- */

export type PeriodKind = 'trimester' | 'semester';
export const PERIOD_KINDS: readonly PeriodKind[] = ['trimester', 'semester'];

/**
 * A trimester or semester. Periods of the same school year, section and kind never overlap (enforced by
 * the database). Grades belong to a period through their event's `periodId`, so editing a period's dates
 * never moves a grade. A closed period (report cards) is locked: no edit, no grade change.
 */
export interface PeriodDto {
  readonly id: string;
  readonly schoolYearId: string;
  readonly kind: PeriodKind;
  /** null: every section. */
  readonly sectionId: string | null;
  readonly number: number;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly closedAt: string | null;
}

/** `archived`: over and read-only (no grades, events, attendance or timetable edits). */
export type SchoolYearStatus = 'upcoming' | 'current' | 'archived';

export interface SchoolYearDto {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly isCurrent: boolean;
  readonly status: SchoolYearStatus;
  /** When the year was archived (the rollover does it); null otherwise. */
  readonly archivedAt: string | null;
  /** By start day. */
  readonly periods: readonly PeriodDto[];
}

export interface CreateSchoolYearRequest {
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/** PATCH /school-years/:id: the new dates must still contain the year's periods and calendar days. */
export type UpdateSchoolYearRequest = Partial<CreateSchoolYearRequest>;

/** POST /school-years/:id/periods (409 when it would overlap a period of the same section and kind). */
export interface CreatePeriodRequest {
  /** Defaults to trimester. */
  readonly kind?: PeriodKind;
  /** Omit (or null) for a period of every section. */
  readonly sectionId?: string | null;
  readonly number: number;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/** PATCH /periods/:id (409 when the period is closed, or would overlap another). */
export type UpdatePeriodRequest = Partial<CreatePeriodRequest>;

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
  /** The class of the next level in the same year (the rollover promotes through it); null: terminal class. */
  readonly nextClassId: string | null;
}

/** PATCH /classes/:id (admin). `nextClassId` null makes it a terminal class: its students graduate. */
export interface UpdateClassRequest {
  readonly label?: string;
  readonly nextClassId?: string | null;
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

/** GET /classes/:id/students: a student of the roster with the enrolment to remove them (DELETE /enrollments/:id, which closes the enrolment: it stays as history). */
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

/* Subjects: /api/subjects ------------------------------------------------------------------------ */

export const SUBJECT_LIMITS = { name: 120, group: 60 } as const;

export interface SubjectDto {
  /** Stable slug (`mathematiques`), made from the name at creation; never changes. */
  readonly id: string;
  readonly name: string;
  readonly group: string;
  /** The sections the subject can be taught in. */
  readonly sections: readonly SectionId[];
  /** Archived subjects stay on past grades but can't be added to a class. */
  readonly archived: boolean;
}

/** GET /subjects?includeArchived=true */
export interface SubjectListQuery {
  readonly includeArchived?: boolean;
}

export interface CreateSubjectRequest {
  readonly name: string;
  readonly group: string;
  /** At least one. */
  readonly sections: readonly SectionId[];
}

export interface UpdateSubjectRequest {
  readonly name?: string;
  readonly group?: string;
  readonly sections?: readonly SectionId[];
  readonly archived?: boolean;
}

/* Subjects of a class: /api/classes/:id/subjects, /api/class-subjects/:id ------------------------ */

/** A subject taught in a class, with its weight in the class's general average. */
export interface ClassSubjectDto {
  readonly id: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly subjectName: string;
  /** Weight of the subject in the general average (report cards, student averages). */
  readonly coefficient: number;
  /** null when not set. */
  readonly hoursPerWeek: number | null;
  /** Its teaching assignments. */
  readonly teachers: readonly {
    readonly assignmentId: string;
    readonly teacherId: string;
    readonly teacherName: string;
  }[];
}

/** POST /classes/:id/subjects (409 if the class already has it). */
export interface CreateClassSubjectRequest {
  readonly subjectId: string;
  /** Defaults to 1. */
  readonly coefficient?: number;
  readonly hoursPerWeek?: number | null;
}

/** PATCH /class-subjects/:id */
export interface UpdateClassSubjectRequest {
  readonly coefficient?: number;
  readonly hoursPerWeek?: number | null;
}

/**
 * POST /classes/:id/subjects/copy: adds the subjects of `fromClassId` that the class lacks and aligns the
 * coefficient and hours of those it has. Teachers are not copied. Returns the class's subjects.
 */
export interface CopyClassSubjectsRequest {
  readonly fromClassId: string;
}

export interface TeachingAssignmentDto {
  readonly id: string;
  readonly teacherId: string;
  readonly teacherName: string;
  readonly classSubjectId: string;
  readonly classId: string;
  readonly classLabel: string;
  readonly subjectId: string;
  readonly subjectName: string;
  /** The class subject's coefficient. */
  readonly coefficient: number;
}

/** POST /teaching-assignments: a teacher for a subject of a class (add the subject to the class first). */
export interface CreateTeachingAssignmentRequest {
  readonly teacherId: string;
  readonly classSubjectId: string;
}

/* Rooms: /api/rooms ------------------------------------------------------------------------------ */

export type RoomKind = 'classroom' | 'lab' | 'gym' | 'hall';
export const ROOM_KINDS: readonly RoomKind[] = ['classroom', 'lab', 'gym', 'hall'];
export const ROOM_KIND_LABELS: Readonly<Record<RoomKind, string>> = {
  classroom: 'Salle de classe',
  lab: 'Laboratoire',
  gym: 'Gymnase',
  hall: 'Grande salle',
};
export const ROOM_LIMITS = { name: 60, capacity: 2000 } as const;

export interface RoomDto {
  readonly id: string;
  readonly name: string;
  /** Seats; null when unknown. */
  readonly capacity: number | null;
  readonly kind: RoomKind;
  /** Inactive rooms can't be chosen for new events. */
  readonly active: boolean;
}

export interface CreateRoomRequest {
  readonly name: string;
  readonly capacity?: number | null;
  readonly kind: RoomKind;
  readonly active?: boolean;
}

export type UpdateRoomRequest = Partial<CreateRoomRequest>;

/* Activity types: /api/activity-types ------------------------------------------------------------ */

/**
 * A type of calendar activity. System types (cours, TD, TP, examen…) and school-wide types are seen by
 * everyone; a teacher's own types are private until the admin promotes them.
 */
export interface ActivityTypeDto {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly colour: ActivityColour;
  readonly icon: ActivityIcon;
  readonly gradable: boolean;
  readonly repeatable: boolean;
  readonly homework: boolean;
  /** Created with the platform: can't be deleted or archived, and its flags never change. */
  readonly isSystem: boolean;
  /** The teacher who owns a private type; null for school-wide types. */
  readonly ownerTeacherId: string | null;
  readonly ownerName: string | null;
  readonly archived: boolean;
}

/** What an event carries of its type. */
export type ActivityTypeSummary = Pick<
  ActivityTypeDto,
  'id' | 'code' | 'label' | 'colour' | 'icon' | 'gradable' | 'repeatable' | 'homework'
>;

/** GET /activity-types: school-wide types plus the teacher's own (admins: every type), system types first. */
export interface ActivityTypeListQuery {
  readonly includeArchived?: boolean;
}

/** POST /activity-types: a teacher creates a private type, the admin a school-wide one. */
export interface CreateActivityTypeRequest {
  readonly label: string;
  readonly colour: ActivityColour;
  readonly icon: ActivityIcon;
  readonly gradable: boolean;
  readonly repeatable: boolean;
  readonly homework: boolean;
}

/** PATCH /activity-types/:id (owner or admin). Flags can't change once events use the type. */
export interface UpdateActivityTypeRequest extends Partial<CreateActivityTypeRequest> {
  readonly archived?: boolean;
}

/* Calendar days: /api/calendar-days -------------------------------------------------------------- */

export type CalendarDayType = 'holiday' | 'exam_week' | 'no_classes' | 'event_day';
export const CALENDAR_DAY_TYPES: readonly CalendarDayType[] = ['holiday', 'exam_week', 'no_classes', 'event_day'];
export const CALENDAR_DAY_TYPE_LABELS: Readonly<Record<CalendarDayType, string>> = {
  holiday: 'Vacances ou jour férié',
  exam_week: 'Semaine d’examens',
  no_classes: 'Pas de cours',
  event_day: 'Journée spéciale',
};
/** Types that cancel the weekly sessions of their audience. */
export const CLOSED_DAY_TYPES: readonly CalendarDayType[] = ['holiday', 'no_classes'];
export const CALENDAR_DAY_LIMITS = { label: 120, classes: 50 } as const;

/**
 * Holidays, exam weeks, days without classes or special days. Audience: `classIds` non-empty → those
 * classes; else `sectionId` → that section; else the whole school.
 */
export interface CalendarDayDto {
  readonly id: string;
  readonly schoolYearId: string;
  readonly type: CalendarDayType;
  readonly label: string;
  readonly startsOn: string;
  /** Included; equal to startsOn for a single day. */
  readonly endsOn: string;
  readonly sectionId: string | null;
  readonly classIds: readonly string[];
}

/**
 * GET /calendar-days: a year's days and/or those overlapping [from, to], by start day. A school year or a
 * range (`from` and `to`, a year and a bit at most) is required; students only get what concerns them.
 */
export interface CalendarDayQuery {
  readonly schoolYearId?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface CreateCalendarDayRequest {
  readonly schoolYearId: string;
  readonly type: CalendarDayType;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly sectionId?: string | null;
  /** Classes of that school year (and of `sectionId` when given). */
  readonly classIds?: readonly string[];
}

export type UpdateCalendarDayRequest = Partial<Omit<CreateCalendarDayRequest, 'schoolYearId'>>;

/* ------------------------------------------------------------------------------------------------
 * Calendar: /api/events
 * Audience: classId → one class; only sectionId → a section; neither → the whole school.
 * ---------------------------------------------------------------------------------------------- */

export interface EventDto {
  readonly id: string;
  readonly activityTypeId: string;
  /** Its type: label, colour, icon, and the flags (gradable, repeatable, homework) screens rely on. */
  readonly type: ActivityTypeSummary;
  readonly title: string;
  readonly subjectId: string | null;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly repeatUntil: string | null;
  /** A room of the school, or null (then `place` may say where, e.g. outside the school). */
  readonly roomId: string | null;
  readonly roomName: string | null;
  readonly place: string;
  /** Gradable events: the period their grades count for (report cards); null otherwise. */
  readonly periodId: string | null;
  readonly description: string;
  readonly attachments: readonly Attachment[];
  readonly coefficient: number;
  /** Who the work concerns (assessments and homework of a class); the whole class for everything else. */
  readonly target: AssessmentTargetDto;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * « Assigner à » of an assessment or a homework: the whole class (no group, no student), or groups and
 * individual students. Stored as the target, not as a list of students: see `targetedStudentIds`.
 */
export interface AssessmentTargetInput {
  /** Groups of the event's class. */
  readonly groupIds: readonly string[];
  /** Students currently enrolled in the event's class. */
  readonly studentIds: readonly string[];
}

export interface AssessmentTargetGroupDto {
  readonly id: string;
  readonly division: string;
  readonly label: string;
}

export interface AssessmentTargetDto {
  /** True: the whole class is concerned (the default). */
  readonly whole: boolean;
  readonly groups: readonly AssessmentTargetGroupDto[];
  /** Students named one by one. Empty for students (they never learn who else was named). */
  readonly studentIds: readonly string[];
  /** Students concerned today (the class, the groups' members and the students named). Null when not computed. */
  readonly concerned: number | null;
}

export interface EventInput {
  /** A school-wide type or one of the author's own (not archived). */
  readonly activityTypeId: string;
  readonly title: string;
  readonly subjectId?: string | null;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
  readonly date: string;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly repeatUntil?: string | null;
  /** An active room. */
  readonly roomId?: string | null;
  readonly place?: string;
  /**
   * Gradable types: a period of the class's school year and section, not closed. Omitted: the period
   * containing `date`. Ignored (null) for other types.
   */
  readonly periodId?: string | null;
  readonly description?: string;
  readonly attachments?: readonly Attachment[];
  readonly coefficient?: number;
  /**
   * Assessments and homework of a class: who they concern. Omitted on create: the whole class; omitted
   * on update: unchanged. Students already graded cannot be taken out (409).
   */
  readonly target?: AssessmentTargetInput;
}

/** GET /events?from&to (max 186 days), plus optional classId / sectionId filters for staff. */
export interface EventRangeQuery {
  readonly from: string;
  readonly to: string;
  readonly classId?: string;
  readonly sectionId?: string;
}

/**
 * One day of a (possibly weekly) event: GET /events/occurrences. Weekly sessions that fall on a holiday
 * or a « pas de cours » day of their audience are left out.
 */
export interface OccurrenceDto {
  /** `eventId@day`. */
  readonly key: string;
  readonly day: string;
  readonly event: EventDto;
}

/* ------------------------------------------------------------------------------------------------
 * Timetable: /api/timetable. A weekly rule (slot) plus one-off changes (exceptions); the sessions are
 * computed from them (@cdls/shared `expandTimetable`) with holidays removed.
 * ---------------------------------------------------------------------------------------------- */

/** The fields of a weekly slot. `roomId` null: no room (outside the school). */
export interface TimetableSlotInput {
  readonly classSubjectId: string;
  /** Must teach that subject in that class. */
  readonly teacherId: string;
  readonly roomId: string | null;
  /** A repeatable activity type (cours, TD, TP…). */
  readonly activityTypeId: string;
  /** 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  /** HH:MM */
  readonly startTime: string;
  readonly endTime: string;
  /** Included; inside the class's school year. */
  readonly validFrom: string;
  readonly validTo: string;
  /** A or B: the slot runs every other week (week A is the one containing the school year's first day). */
  readonly weekParity: WeekParity | null;
  /**
   * Division of the groups that run in parallel (« TP », « LV2 »): two slots of one class may overlap only
   * when both carry the same division. Null: the whole class. With a `groupId` the division is the
   * group's (a different one is refused), so phase 2 clients that only send a division keep working.
   */
  readonly division: string | null;
  /**
   * The group the session is for (a group of the same class). Omitted or null: the whole class, or the
   * free-text division above. Only that group's students see the session.
   */
  readonly groupId?: string | null;
}

export interface TimetableSlotDto extends TimetableSlotInput {
  readonly id: string;
  readonly classId: string;
  readonly classLabel: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly teacherName: string;
  readonly roomName: string | null;
  readonly activityType: ActivityTypeSummary;
  /** The group the session is for, or null (the whole class). */
  readonly groupId: string | null;
  /** « TP A »; null without a group. */
  readonly groupLabel: string | null;
}

/** Soft rules: they warn, and the save needs a reason for each. */
export type TimetableWarningCode =
  | 'exam_week'
  | 'room_capacity'
  | 'tp_outside_lab'
  | 'assessments_overload'
  | 'hours_exceeded';
export const TIMETABLE_WARNING_CODES: readonly TimetableWarningCode[] = [
  'exam_week',
  'room_capacity',
  'tp_outside_lab',
  'assessments_overload',
  'hours_exceeded',
];
export const TIMETABLE_WARNING_LABELS: Readonly<Record<TimetableWarningCode, string>> = {
  exam_week: 'Séance en semaine d’examens',
  room_capacity: 'Salle trop petite',
  tp_outside_lab: 'TP hors laboratoire',
  assessments_overload: 'Trop d’évaluations le même jour',
  hours_exceeded: 'Volume horaire dépassé',
};

export interface TimetableWarningDto {
  readonly code: TimetableWarningCode;
  /** The weekly slot the warning is about (to badge its sessions and offer a fix). */
  readonly slotId: string;
  /** The day concerned; null when it covers the whole series (hours, room type). */
  readonly date: string | null;
  /** French sentence naming the item (« Salle 8 (24 places) pour 30 élèves »). */
  readonly message: string;
}

/** A warning the person chose to accept, with the reason that goes to the audit log. */
export interface AcknowledgedWarning {
  readonly code: TimetableWarningCode;
  readonly reason: string;
}

export type TimetableConflictKind = 'room' | 'teacher' | 'class';

/** A hard conflict: the save is refused (409). */
export interface TimetableConflictDto {
  readonly kind: TimetableConflictKind;
  /** The room, teacher or class that is taken (its id). */
  readonly resourceId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  /** French sentence naming the conflicting item (« Salle 12 est déjà prise le … par Mathématiques, Première »). */
  readonly message: string;
  /** How many sessions clash with this same item (1 when only `date` does). */
  readonly count: number;
  /** What it clashes with: a weekly slot, an exception, or a one-off event. */
  readonly withSource: 'slot' | 'exception' | 'event';
  readonly withId: string | null;
  readonly withSlotId: string | null;
  readonly withLabel: string;
}

export interface SlotExceptionInput {
  readonly kind: SlotExceptionKind;
  /** moved: the new day (default: same day). */
  readonly newDate?: string | null;
  /** moved: both or neither. */
  readonly newStart?: string | null;
  readonly newEnd?: string | null;
  /** room_change (required), moved (optional). */
  readonly newRoomId?: string | null;
  /** substitute (required). */
  readonly newTeacherId?: string | null;
  readonly reason?: string;
}

export interface SlotExceptionDto {
  readonly id: string;
  readonly slotId: string;
  /** The original day of the session. */
  readonly date: string;
  readonly kind: SlotExceptionKind;
  readonly newDate: string | null;
  readonly newStart: string | null;
  readonly newEnd: string | null;
  readonly newRoomId: string | null;
  readonly newTeacherId: string | null;
  readonly reason: string;
}

/** POST /timetable/slots (admin or coordinator). */
export interface CreateTimetableSlotRequest extends TimetableSlotInput {
  readonly acknowledgedWarnings?: readonly AcknowledgedWarning[];
}

/**
 * PATCH /timetable/slots/:id: « Cette séance / Celle-ci et les suivantes / Toute la série ».
 * - `this`: needs `date` and `exception` (an exception on that session; the only scope a teacher has).
 * - `following`: needs `date` and `changes`; the slot ends the day before and a new slot starts on `date`.
 * - `all`: needs `changes`; edits the series from today on (sessions already held are never rewritten: the
 *   series is split at today when it already started).
 */
export interface UpdateTimetableSlotRequest {
  readonly scope: SlotScope;
  readonly date?: string;
  readonly changes?: Partial<TimetableSlotInput>;
  readonly exception?: SlotExceptionInput;
  readonly acknowledgedWarnings?: readonly AcknowledgedWarning[];
}

/** DELETE /timetable/slots/:id?scope=…&date=…: this session cancelled, the series ended, or deleted. */
export interface DeleteTimetableSlotQuery {
  readonly scope: SlotScope;
  readonly date?: string;
}

/** POST /timetable/slots/:id/exceptions: one session changed (replaces the one it already had). */
export interface CreateSlotExceptionRequest extends SlotExceptionInput {
  /** The original day of the session. */
  readonly date: string;
  readonly acknowledgedWarnings?: readonly AcknowledgedWarning[];
}

/** What a write did. */
export interface TimetableWriteResult {
  /** The slot holding the change (the new one for a split); null when a series was removed. */
  readonly slot: TimetableSlotDto | null;
  /** The old slot when the series was split or ended. */
  readonly endedSlot: TimetableSlotDto | null;
  readonly exception: SlotExceptionDto | null;
  /** Warnings that were accepted. */
  readonly warnings: readonly TimetableWarningDto[];
}

/**
 * POST /timetable/check: what a write would do, without doing it. Without `slotId` it checks a new slot
 * (`slot`); with it, an edit (`scope`, `date`, `changes`, `exception`) as PATCH would take it.
 */
export interface TimetableCheckRequest {
  readonly slotId?: string;
  readonly slot?: TimetableSlotInput;
  readonly scope?: SlotScope;
  readonly date?: string;
  readonly changes?: Partial<TimetableSlotInput>;
  readonly exception?: SlotExceptionInput;
}

export interface TimetableCheckResult {
  readonly conflicts: readonly TimetableConflictDto[];
  readonly warnings: readonly TimetableWarningDto[];
  /** No hard conflict (warnings still need a reason). */
  readonly canSave: boolean;
}

export const TIMETABLE_CONFLICT = 'TIMETABLE_CONFLICT';
export const WARNINGS_NOT_ACKNOWLEDGED = 'WARNINGS_NOT_ACKNOWLEDGED';

/** Body of the 409 a refused write answers with (`code` tells the two cases apart). */
export interface TimetableBlockedError extends ApiError {
  readonly code: typeof TIMETABLE_CONFLICT | typeof WARNINGS_NOT_ACKNOWLEDGED;
  readonly conflicts: readonly TimetableConflictDto[];
  readonly warnings: readonly TimetableWarningDto[];
}

/** GET /timetable/slots: the weekly slots, filtered by class, teacher or room. */
export interface TimetableSlotListQuery extends PageQuery {
  readonly classId?: string;
  readonly teacherId?: string;
  readonly roomId?: string;
}

/** The values of a session at one moment, with names for display. */
export interface SessionValuesDto {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly roomId: string | null;
  readonly roomName: string | null;
  readonly teacherId: string;
  readonly teacherName: string;
}

/** One session of the timetable. */
export interface TimetableOccurrenceDto {
  /** `slotId@originalDate`, `:from` added on the trace of a moved session. */
  readonly key: string;
  readonly slotId: string;
  readonly originalDate: string;
  readonly status: OccurrenceStatus;
  /** Maintenant. For a cancelled session, the values it had. */
  readonly current: SessionValuesDto;
  /** Avant: what the weekly rule says. */
  readonly original: SessionValuesDto;
  /** The fields that differ between the two. */
  readonly changes: readonly SessionChange[];
  /** `moved_from` only: where the session went. */
  readonly movedTo: SessionValuesDto | null;
  readonly exceptionId: string | null;
  readonly reason: string;
  readonly classId: string;
  readonly classLabel: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly activityType: ActivityTypeSummary;
  readonly division: string | null;
  readonly groupId: string | null;
  readonly groupLabel: string | null;
  /** The signed-in user may cancel, move or change the room of this session. */
  readonly canChange: boolean;
}

/** GET /timetable/occurrences?classId|teacherId|roomId&from&to (at most 62 days). */
export interface TimetableOccurrenceQuery {
  readonly classId?: string;
  readonly teacherId?: string;
  readonly roomId?: string;
  readonly from: string;
  readonly to: string;
}

/** GET /timetable/warnings: the soft warnings of the stored timetable in a range, for the « Conflits » panel. */
export type TimetableWarningQuery = TimetableOccurrenceQuery;

/** GET /timetable/free-rooms?date&startTime&endTime: active rooms free during that time. */
export interface FreeRoomsQuery {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  /** Sort the rooms that seat this class first and flag the others. */
  readonly classId?: string;
  /** The session being moved: its own room does not count as taken. */
  readonly ignoreSlotId?: string;
}

export interface FreeRoomDto extends RoomDto {
  /** True when the room seats the class (or when either is unknown). */
  readonly fitsClass: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Groups: /api/groups
 * A group is a part of a class (TP A, LV2 Allemand). Groups of the same `division` run at the same
 * time; a student belongs to at most ONE group per division of a class (409 otherwise). Memberships are
 * soft: leaving sets `leftOn` and keeps the history. A student who leaves the class, or changes section,
 * leaves their groups at the same time.
 * Admins and coordinators manage any group, a teacher those of the classes they teach, a student reads
 * only their own memberships (`GET /groups/mine`).
 * ---------------------------------------------------------------------------------------------- */

export const GROUP_LIMITS = { division: 40, label: 60, members: 100 } as const;

export interface GroupDto {
  readonly id: string;
  readonly classId: string;
  readonly classLabel: string;
  /** « TP », « LV2 »: a student is in one group per division. */
  readonly division: string;
  /** « TP A », « Allemand ». */
  readonly label: string;
  /** Current members. */
  readonly memberCount: number;
  readonly createdAt: string;
}

export interface GroupMemberDto extends StudentSummaryDto {
  /** The day the student joined the group. */
  readonly joinedOn: string;
}

/** GET /groups/:id: the group with its current members, by name. */
export interface GroupDetailDto extends GroupDto {
  readonly members: readonly GroupMemberDto[];
}

/** GET /groups?classId= (required): the groups of a class, by division then label. */
export interface GroupListQuery {
  readonly classId: string;
}

/** An entry of GET /groups: the group and who is in it now (student ids), so screens can count a target. */
export interface GroupWithMembersDto extends GroupDto {
  readonly memberIds: readonly string[];
}

export interface CreateGroupRequest {
  readonly classId: string;
  readonly division: string;
  readonly label: string;
}

/** The class of a group never changes. A new division needs the group to have no timetable session. */
export interface UpdateGroupRequest {
  readonly division?: string;
  readonly label?: string;
}

/** POST /groups/:id/members */
export interface AddGroupMembersRequest {
  /** Students currently enrolled in the group's class. */
  readonly studentIds: readonly string[];
  /**
   * A student already in another group of this division is refused (409) unless `move` is true: then they
   * leave that group (today) and join this one.
   */
  readonly move?: boolean;
}

/** GET /groups/mine: the signed-in student's current groups. */
export interface MyGroupDto {
  readonly id: string;
  readonly classId: string;
  readonly division: string;
  readonly label: string;
  readonly joinedOn: string;
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

/** GET /events/:id/grades: the students the work concerns (the whole class by default) with each one's grade. */
export interface GradeSheetDto {
  readonly event: EventDto;
  readonly rows: readonly {
    readonly student: StudentSummaryDto;
    readonly grade: GradeDto | null;
    /**
     * False for a student who has a grade but is no longer concerned (left the group): the grade is
     * kept and shown, but only removing it is allowed.
     */
    readonly targeted: boolean;
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
  readonly event: Pick<EventDto, 'id' | 'type' | 'title' | 'date' | 'subjectId' | 'coefficient' | 'periodId'>;
}

/** GET /students/:id/grades?periodId= or ?from=&to= */
export interface StudentGradesQuery {
  /** The grades of a period (by their event's periodId), weighted with that year's class subjects. */
  readonly periodId?: string;
  readonly from?: string;
  readonly to?: string;
}

/** GET /students/:id/grades (students: their own, published only). */
export interface StudentGradesDto {
  readonly studentId: string;
  readonly subjects: readonly {
    readonly subjectId: string;
    /** Weighted average on 20 (shared averageOnTwenty), null without grades. */
    readonly average: number | null;
    /**
     * Weight of the subject in the general average of the student's class (its class subject), as
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

/** GET /events/:id/attendance?date= : the students the event concerns (see `event.target`). */
export interface AttendanceSheetDto {
  readonly event: EventDto;
  readonly date: string;
  readonly rows: readonly {
    readonly student: StudentSummaryDto;
    readonly record: AttendanceRecordDto | null;
    /** False for a student with a record that day who is no longer concerned (left the group): the record is kept and can be corrected. */
    readonly targeted: boolean;
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
  readonly event: Pick<EventDto, 'id' | 'type' | 'title' | 'subjectId' | 'startTime' | 'endTime'>;
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
  /** On 20, null when the subject had no published grade in the period. */
  readonly average: number | null;
  readonly gradeCount: number;
}

export interface ReportCardDto {
  readonly id: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly periodId: string;
  readonly classId: string;
  readonly average: number | null;
  readonly rank: number | null;
  readonly appreciation: string;
  readonly subjects: readonly ReportCardSubjectDto[];
  readonly generatedAt: string;
  readonly publishedAt: string | null;
}

/** POST /periods/:id/report-cards/generate and /publish (a closed period). */
export interface ReportCardBatchRequest {
  /** Omit for every class of the period's school year (and section, for a section's period). */
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

/* ------------------------------------------------------------------------------------------------
 * Next school year (rollover): /api/rollover, admin only. A preview that writes nothing, then an apply that
 * runs the same plan in one transaction and refuses when the plan changed since the preview.
 * ---------------------------------------------------------------------------------------------- */

/**
 * What happens to a student: `promote` to the next class, `repeat` (redoublement: the same level),
 * `leave` (départ: archived account), `graduate` (terminal class: archived, graduatedOn set) or
 * `section_change` (promoted, and a section-change request is opened for the admin to approve).
 */
export type RolloverStudentAction = 'promote' | 'repeat' | 'leave' | 'graduate' | 'section_change';
export const ROLLOVER_STUDENT_ACTIONS: readonly RolloverStudentAction[] = [
  'promote',
  'repeat',
  'leave',
  'graduate',
  'section_change',
];
export const ROLLOVER_ACTION_LABELS: Readonly<Record<RolloverStudentAction, string>> = {
  promote: 'Promu',
  repeat: 'Redoublement',
  leave: 'Départ',
  graduate: 'Diplômé',
  section_change: 'Changement de section',
};

export const ROLLOVER_LIMITS = { overrides: 5000 } as const;

export interface RolloverStudentOverride {
  readonly studentId: string;
  readonly action: RolloverStudentAction;
}

/** POST /rollover/preview */
export interface RolloverRequest {
  readonly sourceYearId: string;
  /** Default: the source label one year on (« 2027-2028 »). */
  readonly label?: string;
  /** Default: the source dates one year on (29 February moves to 28 February). */
  readonly startsOn?: string;
  readonly endsOn?: string;
  /** Teaching assignments are copied (needed by the timetable). */
  readonly copyAssignments: boolean;
  /** The weekly timetable is copied for the whole new year; clashes are reported, not fatal. Needs the assignments. */
  readonly copyTimetable: boolean;
  /** Only the students that differ from the default (promoted, or graduating in a terminal class). */
  readonly overrides?: readonly RolloverStudentOverride[];
  /** The day graduations and departures take effect. Default: the end of the source year. */
  readonly leavesOn?: string;
}

/** POST /rollover/apply: the same request plus the hash the preview returned. */
export interface RolloverApplyRequest extends RolloverRequest {
  readonly planHash: string;
}

export type RolloverStepId =
  | 'year'
  | 'periods'
  | 'calendar_days'
  | 'classes'
  | 'class_subjects'
  | 'assignments'
  | 'timetable'
  | 'students'
  | 'groups'
  | 'group_members'
  | 'group_slots'
  | 'archive';

/** Counts of one step: what is created, what already exists (a re-run keeps it) and what is left out. */
export interface RolloverStepSummary {
  readonly id: RolloverStepId;
  readonly label: string;
  readonly create: number;
  readonly existing: number;
  readonly skipped: number;
}

/** `conflict`: a timetable slot that could not be placed (left out, the rest goes on); `warning`: to check. */
export interface RolloverIssue {
  readonly step: RolloverStepId;
  readonly level: 'warning' | 'conflict';
  readonly message: string;
}

export interface RolloverClassPlan {
  readonly sourceClassId: string;
  readonly sectionCode: SectionId;
  readonly code: string;
  readonly label: string;
  /** Label of the class the students are promoted to; null: terminal (graduation). */
  readonly nextLabel: string | null;
  readonly studentCount: number;
  readonly action: 'create' | 'exists';
  /** The class in the new year: set once applied (null in a preview). */
  readonly targetClassId: string | null;
}

export type RolloverSkipReason = 'already_enrolled';

export interface RolloverStudentPlan {
  readonly studentId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly studentNumber: string | null;
  readonly sectionCode: SectionId;
  readonly sourceClassId: string;
  readonly sourceClassLabel: string;
  /** What the rules give (promote, or graduate in a terminal class). */
  readonly defaultAction: RolloverStudentAction;
  /** What will happen: the default, or the override. */
  readonly action: RolloverStudentAction;
  /** Label of the class in the new year; null when the student leaves or graduates. */
  readonly targetClassLabel: string | null;
  /** Set when nothing is done for this student (already placed by a previous run). */
  readonly skipped: RolloverSkipReason | null;
}

export interface RolloverPreview {
  /** Send it back to /rollover/apply: it changes when anything the plan reads changes. */
  readonly planHash: string;
  readonly sourceYear: { readonly id: string; readonly label: string; readonly archived: boolean };
  readonly newYear: {
    readonly label: string;
    readonly startsOn: string;
    readonly endsOn: string;
    /** The year already exists (a re-run): only what is missing is created. */
    readonly exists: boolean;
  };
  readonly steps: readonly RolloverStepSummary[];
  readonly issues: readonly RolloverIssue[];
  readonly classes: readonly RolloverClassPlan[];
  /** Every student of the source year with their proposed outcome (the web pages it). */
  readonly students: readonly RolloverStudentPlan[];
  /** The source year is archived and, when it was the current one, the new year becomes current. */
  readonly archivesSourceYear: boolean;
  readonly makesNewYearCurrent: boolean;
}

/** POST /rollover/apply */
export interface RolloverResult {
  readonly schoolYearId: string;
  readonly schoolYearLabel: string;
  readonly steps: readonly RolloverStepSummary[];
  readonly issues: readonly RolloverIssue[];
  /** Each class of the new year with its id (the web links to them). */
  readonly classes: readonly RolloverClassPlan[];
  readonly studentCounts: Readonly<Record<RolloverStudentAction, number>>;
  /** Nothing was created or changed: a previous run had already done it all. */
  readonly nothingToDo: boolean;
}

/** The 409 code of a preview that no longer matches the data. */
export const ROLLOVER_PREVIEW_STALE = 'ROLLOVER_PREVIEW_STALE';
/** The 409 code of a write refused because its school year is archived. */
export const YEAR_ARCHIVED = 'YEAR_ARCHIVED';

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
