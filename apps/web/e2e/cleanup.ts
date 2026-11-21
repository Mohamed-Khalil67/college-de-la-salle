import type { ClassDto, ContactMessageDto, CreatedUserResponse, EventDto, GradeSheetDto, PostDto, SchoolYearDto, SectionId } from '@cdls/shared';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { ACCOUNTS, type Account } from './accounts';
import { schoolToday } from './school';
import { tokenOf } from './structure';

/**
 * Leaving the demo database as it was. Every spec that creates something removes it in `afterAll` or `finally`
 * through the API, as the admin: events, posts, groups, slots, assignments, classes and years are deleted; an
 * account cannot be deleted, so a student is archived (out of the class lists and the report cards) and any
 * other account disabled. What the API keeps on purpose (a class or a year that ever had a student, a closed
 * period with published report cards) is created in a far-future fixture year (`fixtureYear`), never in the
 * current one, so the screens of the year in use show the same data on every run.
 */

type Headers = { Authorization: string };

export interface AdminApi {
  readonly headers: Headers;
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  patch<T>(url: string, data?: unknown): Promise<T>;
  /** Deletes and accepts « already gone » (404). */
  del(url: string): Promise<void>;
}

async function body<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

export async function adminApi(request: APIRequestContext): Promise<AdminApi> {
  const headers = await tokenOf(request, ACCOUNTS.admin);
  return {
    headers,
    get: async (url) => body(await request.get(url, { headers })),
    post: async (url, data) => body(await request.post(url, { headers, data })),
    patch: async (url, data) => body(await request.patch(url, { headers, data })),
    del: async (url) => {
      const res = await request.delete(url, { headers });
      expect([200, 204, 404], `DELETE ${url}: ${res.status()} ${await res.text()}`).toContain(res.status());
    },
  };
}

/** Archives students (by student id): they leave the class lists, cannot sign in, keep their history. */
export async function archiveStudents(request: APIRequestContext, studentIds: readonly string[]): Promise<void> {
  if (!studentIds.length) return;
  const api = await adminApi(request);
  await api.post('/api/users/archive', { studentIds: [...new Set(studentIds)], outcome: 'left', on: schoolToday() });
}

/** Disables accounts (by user id) that are not students; already disabled ones are left as they are. */
export async function disableUsers(request: APIRequestContext, userIds: readonly string[]): Promise<void> {
  const api = await adminApi(request);
  for (const id of new Set(userIds)) await api.del(`/api/users/${id}`);
}

/** The student ids of the accounts whose e-mail or name matches `search` (an import's unique last name). */
export async function studentsMatching(request: APIRequestContext, search: string): Promise<string[]> {
  const api = await adminApi(request);
  const page = await api.get<{ items: { studentId: string | null; status: string }[] }>(
    `/api/users?role=student&search=${encodeURIComponent(search)}&pageSize=100`,
  );
  return page.items.filter((u) => u.studentId && u.status !== 'archived').map((u) => u.studentId!);
}

/** The user ids of the accounts of a role whose e-mail or name matches `search`. */
export async function usersMatching(request: APIRequestContext, role: 'teacher' | 'admin', search: string): Promise<string[]> {
  const api = await adminApi(request);
  const page = await api.get<{ items: { id: string; status: string }[] }>(
    `/api/users?role=${role}&search=${encodeURIComponent(search)}&pageSize=100`,
  );
  return page.items.filter((u) => u.status === 'active').map((u) => u.id);
}

/**
 * Deletes the events of `account` between `from` and `to` whose title matches, their marks first (an event with
 * marks cannot be deleted). For the specs that grade: a mark left behind would count in the demo averages and
 * report cards.
 */
export async function removeEvents(
  request: APIRequestContext,
  account: Account,
  matches: (title: string) => boolean,
  from: string,
  to: string,
): Promise<void> {
  const headers = await tokenOf(request, account);
  const res = await request.get(`/api/events?from=${from}&to=${to}`, { headers });
  expect(res.ok(), await res.text()).toBeTruthy();
  for (const event of ((await res.json()) as EventDto[]).filter((e) => matches(e.title))) {
    if (event.type.gradable) {
      const sheet = (await (await request.get(`/api/events/${event.id}/grades`, { headers })).json()) as GradeSheetDto;
      const entries = sheet.rows.filter((r) => r.grade).map((r) => ({ studentId: r.student.id, score: null }));
      if (entries.length) {
        const cleared = await request.put(`/api/events/${event.id}/grades`, { headers, data: { entries } });
        expect(cleared.ok(), await cleared.text()).toBeTruthy();
      }
    }
    const gone = await request.delete(`/api/events/${event.id}`, { headers });
    expect([204, 404], await gone.text()).toContain(gone.status());
  }
}

/** Deletes the announcements whose title matches (the admin may delete any). */
export async function removePosts(request: APIRequestContext, matches: (title: string) => boolean): Promise<void> {
  const api = await adminApi(request);
  const page = await api.get<{ items: PostDto[] }>('/api/posts?pageSize=100');
  for (const post of page.items.filter((p) => matches(p.title))) await api.del(`/api/posts/${post.id}`);
}

/** Deletes the contact-form messages that match (every page of the inbox, handled or not). */
export async function removeContactMessages(request: APIRequestContext, matches: (m: ContactMessageDto) => boolean): Promise<void> {
  const api = await adminApi(request);
  for (let page = 1; page < 50; page++) {
    const list = await api.get<{ items: ContactMessageDto[]; total: number }>(`/api/contact-messages?page=${page}&pageSize=100`);
    for (const m of list.items.filter(matches)) await api.del(`/api/contact-messages/${m.id}`);
    if (page * 100 >= list.total) break;
  }
}

/* Fixture years ------------------------------------------------------------------------------------------ */

/** Fixture years are 9900-9901, 9901-9902…: far from the demo year and from the rollover spec's (2200-9200). */
const FIRST_FIXTURE_YEAR = 9900;
/** A year holds at most 4 trimesters for every section (period numbers 1 to 4). */
const TRIMESTERS = 4;

/**
 * A school year that belongs to the suite (created once, reused by later runs). With `freeTrimester`, the first
 * fixture year that still has a trimester number free (each run of the report-card spec closes one for good).
 */
export async function fixtureYear(request: APIRequestContext, { freeTrimester = false } = {}): Promise<SchoolYearDto> {
  const api = await adminApi(request);
  const years = await api.get<SchoolYearDto[]>('/api/school-years');
  for (let start = FIRST_FIXTURE_YEAR; start < FIRST_FIXTURE_YEAR + 99; start++) {
    const label = `${start}-${start + 1}`;
    const year =
      years.find((y) => y.label === label) ??
      (await api.post<SchoolYearDto>('/api/school-years', { label, startsOn: `${start}-09-01`, endsOn: `${start + 1}-06-30` }));
    const used = year.periods.filter((p) => p.kind === 'trimester' && p.sectionId === null).length;
    if (year.status !== 'archived' && (!freeTrimester || used < TRIMESTERS)) return year;
  }
  throw new Error('No fixture year left between 9900 and 9999');
}

/** A class of its own in a fixture year (a class that ever had a student cannot be deleted). */
export async function fixtureClass(
  request: APIRequestContext,
  year: SchoolYearDto,
  section: SectionId,
  label: string,
): Promise<ClassDto> {
  const api = await adminApi(request);
  const sections = await api.get<{ id: string; code: string }[]>('/api/sections');
  const sectionId = sections.find((s) => s.code === section)!.id;
  const code = `e2e-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  return api.post<ClassDto>('/api/classes', { schoolYearId: year.id, sectionId, code, label });
}

/** A student account in a class (the API answers the temporary password once). */
export async function createStudent(
  request: APIRequestContext,
  classId: string,
  firstName: string,
  lastName: string,
): Promise<CreatedUserResponse> {
  const api = await adminApi(request);
  return api.post<CreatedUserResponse>('/api/users', { role: 'student', firstName, lastName, classId });
}
