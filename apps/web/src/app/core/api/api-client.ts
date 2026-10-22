import { HttpClient, type HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  RolloverApplyRequest,
  RolloverPreview,
  RolloverRequest,
  RolloverResult,
  UpdateClassRequest,
  ActivityTypeDto,
  ApiError,
  CalendarDayDto,
  CalendarDayQuery,
  CopyClassSubjectsRequest,
  CreateActivityTypeRequest,
  CreateCalendarDayRequest,
  CreateRoomRequest,
  CreateSubjectRequest,
  RoomDto,
  UpdateActivityTypeRequest,
  UpdateCalendarDayRequest,
  UpdatePeriodRequest,
  UpdateRoomRequest,
  UpdateSchoolYearRequest,
  UpdateSubjectRequest,
  ApproveSectionChangeRequest,
  ArchiveStudentsRequest,
  ArchiveStudentsResponse,
  AttendanceSheetDto,
  ClassStudentDto,
  ClassDto,
  ClassSubjectDto,
  ContactMessageDto,
  ContactMessageListQuery,
  ContactMessageRequest,
  CreateClassRequest,
  CreateClassSubjectRequest,
  CreatedUserResponse,
  CreatePostRequest,
  CreateSectionChangeRequest,
  CreateSchoolYearRequest,
  CreateTeachingAssignmentRequest,
  CreatePeriodRequest,
  CreateUserRequest,
  EnrollmentDto,
  EventDto,
  EventInput,
  EventRangeQuery,
  GradeSheetDto,
  HomeworkCompletionDto,
  HomeworkDto,
  ImportPreviewResponse,
  ImportRole,
  ImportUsersResponse,
  OccurrenceDto,
  Paginated,
  PostDto,
  ReportCardBatchRequest,
  ReportCardBatchResponse,
  ReportCardDto,
  RejectSectionChangeRequest,
  SaveAttendanceRequest,
  SaveGradesRequest,
  SchoolYearDto,
  SectionChangeListQuery,
  SectionChangeRequestDto,
  SectionDto,
  StudentAttendanceDto,
  StudentGradesDto,
  SubjectDto,
  TeachingAssignmentDto,
  PeriodDto,
  UpdateClassSubjectRequest,
  UpdateUserRequest,
  UserDto,
  UserListQuery,
} from '@cdls/shared';

function csvForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

/** `&createAnyway=3,7`: the file lines the administration chose to create although the person already exists. */
function anyway(lines: readonly number[]): string {
  return lines.length ? `&createAnyway=${lines.join(',')}` : '';
}

type Query = Readonly<Record<string, string | number | boolean | null | undefined>>;

function params(query: Query = {}): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') result = result.set(key, String(value));
  }
  return result;
}

/** A readable French message from an API error (Nest sends `message` as a string or a list). */
export function apiMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez dans un instant.'): string {
  const body = (error as HttpErrorResponse | undefined)?.error as ApiError | undefined;
  const status = (error as HttpErrorResponse | undefined)?.status;
  if (status === 0) return 'Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.';
  if (status === 403) return 'Vous n’avez pas accès à cette action.';
  if (!body?.message) return fallback;
  return Array.isArray(body.message) ? body.message.join(' ') : String(body.message);
}

/**
 * Typed access to /api, one method per endpoint, grouped by area. Methods return promises so they plug
 * straight into `resource({ loader })` and async event handlers. Types come from @cdls/shared (api.ts).
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  readonly #http = inject(HttpClient);

  #get<T>(url: string, query?: Query): Promise<T> {
    return firstValueFrom(this.#http.get<T>(`/api${url}`, { params: params(query) }));
  }
  #post<T>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.#http.post<T>(`/api${url}`, body));
  }
  #put<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.#http.put<T>(`/api${url}`, body));
  }
  #patch<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.#http.patch<T>(`/api${url}`, body));
  }
  #delete<T = void>(url: string): Promise<T> {
    return firstValueFrom(this.#http.delete<T>(`/api${url}`));
  }

  /* School structure */
  /** The next-year wizard (admin only). */
  readonly rollover = {
    /** What the rollover would create and flag; writes nothing. */
    preview: (body: RolloverRequest) => this.#post<RolloverPreview>('/rollover/preview', body),
    /** Runs the previewed plan; 409 ROLLOVER_PREVIEW_STALE when the data changed since. */
    apply: (body: RolloverApplyRequest) => this.#post<RolloverResult>('/rollover/apply', body),
  };

  readonly school = {
    sections: () => this.#get<SectionDto[]>('/sections'),
    years: () => this.#get<SchoolYearDto[]>('/school-years'),
    createYear: (body: CreateSchoolYearRequest) => this.#post<SchoolYearDto>('/school-years', body),
    setCurrentYear: (id: string) => this.#post<SchoolYearDto>(`/school-years/${id}/current`),
    /** A year that is not the current one and has no classes (409 otherwise). */
    deleteYear: (id: string) => this.#delete(`/school-years/${id}`),
    createTerm: (yearId: string, body: CreatePeriodRequest) => this.#post<PeriodDto>(`/school-years/${yearId}/periods`, body),
    /** A term without grades or report cards (409 otherwise). */
    updateYear: (id: string, body: UpdateSchoolYearRequest) => this.#patch<SchoolYearDto>(`/school-years/${id}`, body),
    updatePeriod: (periodId: string, body: UpdatePeriodRequest) => this.#patch<PeriodDto>(`/periods/${periodId}`, body),
    deleteTerm: (periodId: string) => this.#delete(`/periods/${periodId}`),
    closeTerm: (periodId: string) => this.#post<PeriodDto>(`/periods/${periodId}/close`),
    reopenTerm: (periodId: string) => this.#post<PeriodDto>(`/periods/${periodId}/close?closed=false`),
    classes: (query: { schoolYearId?: string } = {}) => this.#get<ClassDto[]>('/classes', query),
    class: (id: string) => this.#get<ClassDto>(`/classes/${id}`),
    createClass: (body: CreateClassRequest) => this.#post<ClassDto>('/classes', body),
    updateClass: (id: string, body: UpdateClassRequest) => this.#patch<ClassDto>(`/classes/${id}`, body),
    /** An empty class: no student, grade, attendance or report card (409 otherwise). */
    deleteClass: (id: string) => this.#delete(`/classes/${id}`),
    classStudents: (id: string) => this.#get<ClassStudentDto[]>(`/classes/${id}/students`),
    enroll: (classId: string, studentId: string) => this.#post<EnrollmentDto>(`/classes/${classId}/enrollments`, { studentId }),
    unenroll: (enrollmentId: string) => this.#delete(`/enrollments/${enrollmentId}`),
    subjects: (includeArchived = false) => this.#get<SubjectDto[]>('/subjects', includeArchived ? { includeArchived } : {}),
    createSubject: (body: CreateSubjectRequest) => this.#post<SubjectDto>('/subjects', body),
    updateSubject: (id: string, body: UpdateSubjectRequest) => this.#patch<SubjectDto>(`/subjects/${id}`, body),
    /** School-wide types plus the teacher's own; `includeArchived` also lists the archived ones (an old event may still have one). */
    activityTypes: (includeArchived = false) => this.#get<ActivityTypeDto[]>('/activity-types', includeArchived ? { includeArchived } : {}),
    classSubjects: (classId: string) => this.#get<ClassSubjectDto[]>(`/classes/${classId}/subjects`),
    addClassSubject: (classId: string, body: CreateClassSubjectRequest) => this.#post<ClassSubjectDto>(`/classes/${classId}/subjects`, body),
    updateClassSubject: (id: string, body: UpdateClassSubjectRequest) => this.#patch<ClassSubjectDto>(`/class-subjects/${id}`, body),
    /** 409 while the subject has teachers, grades or graded events. */
    removeClassSubject: (id: string) => this.#delete(`/class-subjects/${id}`),
    /** Adds the subjects the class lacks and aligns coefficient and hours of those it has; returns the class's subjects. */
    copyClassSubjects: (classId: string, body: CopyClassSubjectsRequest) =>
      this.#post<ClassSubjectDto[]>(`/classes/${classId}/subjects/copy`, body),
    rooms: () => this.#get<RoomDto[]>('/rooms'),
    createRoom: (body: CreateRoomRequest) => this.#post<RoomDto>('/rooms', body),
    updateRoom: (id: string, body: UpdateRoomRequest) => this.#patch<RoomDto>(`/rooms/${id}`, body),
    /** 409 while events use the room. */
    deleteRoom: (id: string) => this.#delete(`/rooms/${id}`),
    createActivityType: (body: CreateActivityTypeRequest) => this.#post<ActivityTypeDto>('/activity-types', body),
    updateActivityType: (id: string, body: UpdateActivityTypeRequest) => this.#patch<ActivityTypeDto>(`/activity-types/${id}`, body),
    /** 409 while events use the type. */
    deleteActivityType: (id: string) => this.#delete(`/activity-types/${id}`),
    /** Admin: makes a teacher's private type school-wide. */
    promoteActivityType: (id: string) => this.#post<ActivityTypeDto>(`/activity-types/${id}/promote`),
    calendarDays: (query: CalendarDayQuery) => this.#get<CalendarDayDto[]>('/calendar-days', { ...query }),
    createCalendarDay: (body: CreateCalendarDayRequest) => this.#post<CalendarDayDto>('/calendar-days', body),
    updateCalendarDay: (id: string, body: UpdateCalendarDayRequest) => this.#patch<CalendarDayDto>(`/calendar-days/${id}`, body),
    deleteCalendarDay: (id: string) => this.#delete(`/calendar-days/${id}`),
    assignments: (query: { teacherId?: string; classId?: string } = {}) => this.#get<TeachingAssignmentDto[]>('/teaching-assignments', query),
    createAssignment: (body: CreateTeachingAssignmentRequest) => this.#post<TeachingAssignmentDto>('/teaching-assignments', body),
    deleteAssignment: (id: string) => this.#delete(`/teaching-assignments/${id}`),
  };

  /* Users (admin) */
  readonly users = {
    list: (query: UserListQuery = {}) => this.#get<Paginated<UserDto>>('/users', { ...query }),
    get: (id: string) => this.#get<UserDto>(`/users/${id}`),
    create: (body: CreateUserRequest) => this.#post<CreatedUserResponse>('/users', body),
    update: (id: string, body: UpdateUserRequest) => this.#patch<UserDto>(`/users/${id}`, body),
    remove: (id: string) => this.#delete(`/users/${id}`),
    /** Checks a roster CSV: the accounts it would create (generated e-mails) and the line errors. */
    previewImport: (file: File, role: ImportRole, createAnyway: readonly number[] = []) =>
      this.#post<ImportPreviewResponse>(`/users/import/preview?role=${role}${anyway(createAnyway)}`, csvForm(file)),
    /** All or nothing (400 with `errors`); returns the temporary passwords, once. */
    import: (file: File, role: ImportRole, createAnyway: readonly number[] = []) =>
      this.#post<ImportUsersResponse>(`/users/import?role=${role}${anyway(createAnyway)}`, csvForm(file)),
    /** Students who graduated or left: archived accounts, closed enrolments. */
    archive: (body: ArchiveStudentsRequest) => this.#post<ArchiveStudentsResponse>('/users/archive', body),
  };

  /* Section changes: the student asks, the administration decides */
  readonly sectionChanges = {
    list: (query: SectionChangeListQuery = {}) => this.#get<Paginated<SectionChangeRequestDto>>('/section-changes', { ...query }),
    mine: () => this.#get<SectionChangeRequestDto[]>('/section-changes/mine'),
    create: (body: CreateSectionChangeRequest) => this.#post<SectionChangeRequestDto>('/section-changes', body),
    approve: (id: string, body: ApproveSectionChangeRequest) => this.#post<SectionChangeRequestDto>(`/section-changes/${id}/approve`, body),
    reject: (id: string, body: RejectSectionChangeRequest) => this.#post<SectionChangeRequestDto>(`/section-changes/${id}/reject`, body),
  };

  /* Calendar, homework, announcements */
  readonly calendar = {
    events: (query: EventRangeQuery) => this.#get<EventDto[]>('/events', { ...query }),
    occurrences: (query: EventRangeQuery) => this.#get<OccurrenceDto[]>('/events/occurrences', { ...query }),
    event: (id: string) => this.#get<EventDto>(`/events/${id}`),
    /** The .ics file needs the access token, so it is fetched as a blob rather than linked. */
    ics: (id: string) => firstValueFrom(this.#http.get(`/api/events/${id}/ics`, { responseType: 'blob' })),
    create: (body: EventInput) => this.#post<EventDto>('/events', body),
    update: (id: string, body: Partial<EventInput>) => this.#patch<EventDto>(`/events/${id}`, body),
    remove: (id: string) => this.#delete(`/events/${id}`),
    homework: (query: { from?: string } = {}) => this.#get<HomeworkDto[]>('/homework', query),
    markDone: (eventId: string) => this.#put<HomeworkDto>(`/homework/${eventId}/done`, {}),
    markNotDone: (eventId: string) => this.#delete(`/homework/${eventId}/done`),
    completions: (eventId: string) => this.#get<HomeworkCompletionDto[]>(`/events/${eventId}/completions`),
    posts: (query: { classId?: string; page?: number; pageSize?: number } = {}) => this.#get<Paginated<PostDto>>('/posts', query),
    createPost: (body: CreatePostRequest) => this.#post<PostDto>('/posts', body),
    deletePost: (id: string) => this.#delete(`/posts/${id}`),
  };

  /* Grades */
  readonly grades = {
    sheet: (eventId: string) => this.#get<GradeSheetDto>(`/events/${eventId}/grades`),
    save: (eventId: string, body: SaveGradesRequest) => this.#put<GradeSheetDto>(`/events/${eventId}/grades`, body),
    publish: (eventId: string, published: boolean) => this.#post<GradeSheetDto>(`/events/${eventId}/grades/publish`, { published }),
    ofStudent: (studentId: string, query: { periodId?: string; from?: string; to?: string } = {}) =>
      this.#get<StudentGradesDto>(`/students/${studentId}/grades`, query),
  };

  /* Attendance */
  readonly attendance = {
    sheet: (eventId: string, date: string) => this.#get<AttendanceSheetDto>(`/events/${eventId}/attendance`, { date }),
    save: (eventId: string, body: SaveAttendanceRequest) => this.#put<AttendanceSheetDto>(`/events/${eventId}/attendance`, body),
    ofStudent: (studentId: string, query: { from?: string; to?: string } = {}) =>
      this.#get<StudentAttendanceDto[]>(`/students/${studentId}/attendance`, query),
  };

  /* Contact form (public) and its messages (admin) */
  readonly contact = {
    send: (body: ContactMessageRequest) => this.#post<void>('/contact', body),
    messages: (query: ContactMessageListQuery = {}) => this.#get<Paginated<ContactMessageDto>>('/contact-messages', { ...query }),
    setHandled: (id: string, handled: boolean) => this.#patch<ContactMessageDto>(`/contact-messages/${id}`, { handled }),
  };

  /* Report cards */
  readonly reportCards = {
    generate: (periodId: string, body: ReportCardBatchRequest = {}) => this.#post<ReportCardBatchResponse>(`/periods/${periodId}/report-cards/generate`, body),
    publish: (periodId: string, body: ReportCardBatchRequest = {}) => this.#post<ReportCardBatchResponse>(`/periods/${periodId}/report-cards/publish`, body),
    ofTerm: (periodId: string, query: { classId?: string } = {}) => this.#get<ReportCardDto[]>(`/periods/${periodId}/report-cards`, query),
    ofStudent: (studentId: string) => this.#get<ReportCardDto[]>(`/students/${studentId}/report-cards`),
    update: (id: string, appreciation: string) => this.#patch<ReportCardDto>(`/report-cards/${id}`, { appreciation }),
    /** The PDF needs the access token, so it is fetched as a blob rather than linked. */
    pdf: (id: string) => firstValueFrom(this.#http.get(`/api/report-cards/${id}/pdf`, { responseType: 'blob' })),
  };
}
