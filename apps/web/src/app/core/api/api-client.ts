import { HttpClient, type HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ApiError,
  AttendanceSheetDto,
  ClassStudentDto,
  ClassDto,
  ContactMessageDto,
  ContactMessageListQuery,
  ContactMessageRequest,
  CreateClassRequest,
  CreatedUserResponse,
  CreatePostRequest,
  CreateSchoolYearRequest,
  CreateTeachingAssignmentRequest,
  CreateTermRequest,
  CreateUserRequest,
  EnrollmentDto,
  EventDto,
  EventInput,
  EventRangeQuery,
  GradeSheetDto,
  HandleContactMessagesRequest,
  HandleContactMessagesResponse,
  HomeworkCompletionDto,
  HomeworkDto,
  ImportUsersResponse,
  OccurrenceDto,
  Paginated,
  PostDto,
  ReportCardBatchRequest,
  ReportCardBatchResponse,
  ReportCardDto,
  SaveAttendanceRequest,
  SaveGradesRequest,
  SchoolYearDto,
  SectionDto,
  StudentAttendanceDto,
  StudentGradesDto,
  SubjectDto,
  TeachingAssignmentDto,
  TermDto,
  UpdateUserRequest,
  UserDto,
  UserListQuery,
} from '@cdls/shared';

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
  readonly school = {
    sections: () => this.#get<SectionDto[]>('/sections'),
    years: () => this.#get<SchoolYearDto[]>('/school-years'),
    createYear: (body: CreateSchoolYearRequest) => this.#post<SchoolYearDto>('/school-years', body),
    setCurrentYear: (id: string) => this.#post<SchoolYearDto>(`/school-years/${id}/current`),
    /** A year that is not the current one and has no classes (409 otherwise). */
    deleteYear: (id: string) => this.#delete(`/school-years/${id}`),
    createTerm: (yearId: string, body: CreateTermRequest) => this.#post<TermDto>(`/school-years/${yearId}/terms`, body),
    /** A term without grades or report cards (409 otherwise). */
    deleteTerm: (termId: string) => this.#delete(`/terms/${termId}`),
    closeTerm: (termId: string) => this.#post<TermDto>(`/terms/${termId}/close`),
    reopenTerm: (termId: string) => this.#post<TermDto>(`/terms/${termId}/close?closed=false`),
    classes: (query: { schoolYearId?: string } = {}) => this.#get<ClassDto[]>('/classes', query),
    class: (id: string) => this.#get<ClassDto>(`/classes/${id}`),
    createClass: (body: CreateClassRequest) => this.#post<ClassDto>('/classes', body),
    updateClass: (id: string, body: Partial<Pick<CreateClassRequest, 'code' | 'label'>>) => this.#patch<ClassDto>(`/classes/${id}`, body),
    /** An empty class: no student, grade, attendance or report card (409 otherwise). */
    deleteClass: (id: string) => this.#delete(`/classes/${id}`),
    classStudents: (id: string) => this.#get<ClassStudentDto[]>(`/classes/${id}/students`),
    enroll: (classId: string, studentId: string) => this.#post<EnrollmentDto>(`/classes/${classId}/enrollments`, { studentId }),
    unenroll: (enrollmentId: string) => this.#delete(`/enrollments/${enrollmentId}`),
    subjects: () => this.#get<SubjectDto[]>('/subjects'),
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
    import: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return this.#post<ImportUsersResponse>('/users/import', form);
    },
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
    ofStudent: (studentId: string, query: { termId?: string; from?: string; to?: string } = {}) =>
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
    handleMany: (ids: readonly string[]) =>
      this.#post<HandleContactMessagesResponse>('/contact-messages/handle', { ids } satisfies HandleContactMessagesRequest),
    remove: (id: string) => this.#delete(`/contact-messages/${id}`),
  };

  /* Report cards */
  readonly reportCards = {
    generate: (termId: string, body: ReportCardBatchRequest = {}) => this.#post<ReportCardBatchResponse>(`/terms/${termId}/report-cards/generate`, body),
    publish: (termId: string, body: ReportCardBatchRequest = {}) => this.#post<ReportCardBatchResponse>(`/terms/${termId}/report-cards/publish`, body),
    ofTerm: (termId: string, query: { classId?: string } = {}) => this.#get<ReportCardDto[]>(`/terms/${termId}/report-cards`, query),
    ofStudent: (studentId: string) => this.#get<ReportCardDto[]>(`/students/${studentId}/report-cards`),
    update: (id: string, appreciation: string) => this.#patch<ReportCardDto>(`/report-cards/${id}`, { appreciation }),
    /** The PDF needs the access token, so it is fetched as a blob rather than linked. */
    pdf: (id: string) => firstValueFrom(this.#http.get(`/api/report-cards/${id}/pdf`, { responseType: 'blob' })),
  };
}
