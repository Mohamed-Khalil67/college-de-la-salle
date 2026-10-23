import {
  addDays,
  type CalendarFeedCreatedDto,
  type CalendarFeedDto,
  type CreatedUserResponse,
  type EventDto,
  feedSequence,
  type SessionResponse,
  weekday,
} from '@cdls/shared';
import { schoolToday } from '../src/common/dates.js';
import {
  ADMIN,
  bearer,
  createTestApp,
  deleteUsers,
  MATHS_TEACHER,
  studentOf,
  type TestApp,
} from './helpers.js';

const TODAY = schoolToday();
/** The path of a feed address (the e2e app has no web origin in front of it). */
const pathOf = (url: string) => new URL(url).pathname;
/** The UIDs of the entries of a feed. */
const uids = (ics: string) => [...ics.matchAll(/^UID:([^@\s]+)@/gm)].map((m) => m[1]!);
/** The lines of one entry, by UID. */
const entry = (ics: string, uid: string) =>
  ics
    .replace(/\r\n /g, '')
    .split('BEGIN:VEVENT')
    .find((block) => block.includes(`UID:${uid}@`)) ?? '';

/**
 * « Synchroniser mon agenda »: a secret feed address per user. The feed shows the user's real sessions and
 * events only, and stops working when revoked, replaced, or when the account's password or status changes.
 */
describe('Calendar feed (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let maths: string;
  let student: { studentId: string; email: string; classId: string };
  let other: { studentId: string; email: string; classId: string };
  let studentToken: string;
  /** Accounts these tests create: removed at the end, with everything that hangs on them. */
  const createdUsers: string[] = [];
  let startedAt: Date;

  const get = (path: string) => t.http().get(path).buffer(true);
  const create = async (token: string) =>
    (await t.http().post('/api/calendar/feed').set(bearer(token)).expect(201))
      .body as CalendarFeedCreatedDto;
  const ics = async (url: string) => {
    const res = await get(pathOf(url)).expect(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    return res.text;
  };

  /** An active teacher with a password of their own (the first-sign-in step done). */
  async function freshTeacher(): Promise<{
    id: string;
    email: string;
    password: string;
    token: string;
  }> {
    const res = await t
      .http()
      .post('/api/users')
      .set(bearer(admin))
      .send({
        role: 'teacher',
        firstName: 'Feed',
        lastName: `Teacher${Math.random().toString(36).slice(2, 8)}`,
      })
      .expect(201);
    const created = res.body as CreatedUserResponse;
    createdUsers.push(created.user.id);
    const login = await t
      .http()
      .post('/api/auth/login')
      .send({ email: created.user.email, password: created.temporaryPassword })
      .expect(200);
    const password = 'Agenda-du-Cedre-2026';
    const changed = await t
      .http()
      .post('/api/auth/password')
      .set(bearer((login.body as SessionResponse).accessToken))
      .send({ currentPassword: created.temporaryPassword, newPassword: password })
      .expect(200);
    return {
      id: created.user.id,
      email: created.user.email,
      password,
      token: (changed.body as SessionResponse).accessToken,
    };
  }

  beforeAll(async () => {
    startedAt = new Date(Date.now() - 2000);
    t = await createTestApp();
    admin = await t.token(ADMIN);
    maths = await t.token(MATHS_TEACHER);
    student = await studentOf(t.prisma, 'bac', 'premiere');
    other = await studentOf(t.prisma, 'nationale', 'secondaire-1');
    studentToken = await t.token(student.email);
  });

  afterAll(async () => {
    await t.prisma.calendarFeed.deleteMany({});
    await deleteUsers(t.prisma, createdUsers);
    // The notifications the sessions changed here sent to the demo students stay out of the next specs.
    await t.prisma.notification.deleteMany({ where: { createdAt: { gte: startedAt } } });
    await t.close();
  });

  it('needs a student or teacher session to manage the address', async () => {
    await t.http().get('/api/calendar/feed').expect(401);
    await t.http().post('/api/calendar/feed').expect(401);
    await t.http().get('/api/calendar/feed').set(bearer(admin)).expect(403);
    const none = (await t.http().get('/api/calendar/feed').set(bearer(studentToken)).expect(200))
      .body as CalendarFeedDto;
    expect(none).toEqual({ active: false, createdAt: null, lastUsedAt: null });
  });

  it('stores only a hash of the secret and shows the address once', async () => {
    const made = await create(studentToken);
    expect(made.url).toMatch(/\/api\/calendar\/feed\/[0-9a-f]{32}[\w-]{43}\.ics$/);
    const secret = /([\w-]{43})\.ics$/.exec(made.url)![1]!;
    const row = await t.prisma.calendarFeed.findFirstOrThrow({
      where: { user: { email: student.email } },
    });
    expect(row.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.secretHash).not.toContain(secret);
    const status = (await t.http().get('/api/calendar/feed').set(bearer(studentToken)).expect(200))
      .body as CalendarFeedDto & { url?: string };
    expect(status.active).toBe(true);
    expect(status.url).toBeUndefined();
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'calendar_feed.create', entityId: row.id },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit!.after)).not.toContain(secret);
  });

  it('serves a valid calendar of the student’s class only, with the Cairo zone', async () => {
    const made = await create(studentToken);
    const text = await ics(made.url);
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('TZID:Africa/Cairo');
    expect(text).toContain('DTSTART;TZID=Africa/Cairo:');

    // Every session of the feed is a slot of the student's class, and a whole-class one or one of their groups.
    const slotIds = [
      ...new Set(uids(text).flatMap((u) => /^slot-([0-9a-f-]{36})-/.exec(u)?.[1] ?? [])),
    ];
    expect(slotIds.length).toBeGreaterThan(0);
    const slots = await t.prisma.timetableSlot.findMany({
      where: { id: { in: slotIds } },
      select: { groupId: true, classSubject: { select: { classId: true } } },
    });
    expect(slots).toHaveLength(slotIds.length);
    const groups = new Set(
      (
        await t.prisma.groupMember.findMany({
          where: { studentId: student.studentId, leftOn: null },
        })
      ).map((m) => m.groupId),
    );
    for (const s of slots) {
      expect(s.classSubject.classId).toBe(student.classId);
      if (s.groupId) expect(groups.has(s.groupId)).toBe(true);
    }

    // No event of another class.
    const eventIds = [
      ...new Set(uids(text).flatMap((u) => /^event-([0-9a-f-]{36})/.exec(u)?.[1] ?? [])),
    ];
    const events = await t.prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { classId: true },
    });
    for (const e of events) expect([null, student.classId]).toContain(e.classId);
    const foreign = await t.prisma.event.findMany({
      where: { classId: other.classId },
      select: { id: true },
    });
    for (const e of foreign) expect(text).not.toContain(e.id);
  });

  it('applies exceptions: a cancelled session leaves, a moved one keeps its UID and a higher SEQUENCE', async () => {
    const made = await create(studentToken);
    const slot = await t.prisma.timetableSlot.findFirstOrThrow({
      where: {
        classSubject: { classId: student.classId, subjectId: 'mathematiques' },
        groupId: null,
        weekParity: null,
      },
      orderBy: { id: 'asc' },
    });
    // Two sessions of that slot a few weeks ahead that the rule really puts on the calendar.
    const text0 = await ics(made.url);
    const days = uids(text0)
      .filter((u) => u.startsWith(`slot-${slot.id}-`))
      .map((u) => u.slice(`slot-${slot.id}-`.length, `slot-${slot.id}-`.length + 10))
      .filter((d) => d >= addDays(TODAY, 21));
    expect(days.length).toBeGreaterThanOrEqual(2);
    const [cancelDay, moveDay] = days as [string, string];
    const movedUid = `slot-${slot.id}-${moveDay}`;
    const before = Number(/SEQUENCE:(\d+)/.exec(entry(text0, movedUid))![1]);

    await t
      .http()
      .post(`/api/timetable/slots/${slot.id}/exceptions`)
      .set(bearer(maths))
      .send({ date: cancelDay, kind: 'cancelled', reason: 'Conseil de classe' })
      .expect(201);
    // Moved to a Friday evening: the school week is Sunday to Thursday, so nothing of the class, the
    // teacher or the room can clash with it (the first Friday that is not a holiday).
    let newDay = addDays(moveDay, (5 - weekday(moveDay) + 7) % 7 || 7);
    for (let tries = 0; ; tries++, newDay = addDays(newDay, 7)) {
      const moved = await t
        .http()
        .post(`/api/timetable/slots/${slot.id}/exceptions`)
        .set(bearer(admin))
        .send({
          date: moveDay,
          kind: 'moved',
          newDate: newDay,
          newStart: '16:00',
          newEnd: '17:00',
        });
      if (moved.status === 201) break;
      expect(tries, `moving to a Friday: ${moved.status}`).toBeLessThan(3);
    }

    const text = await ics(made.url);
    expect(uids(text)).not.toContain(`slot-${slot.id}-${cancelDay}`);
    expect(uids(text).filter((u) => u === movedUid)).toHaveLength(1);
    const moved = entry(text, movedUid);
    expect(moved).toContain(`DTSTART;TZID=Africa/Cairo:${newDay.replace(/-/g, '')}T160000`);
    expect(moved).toContain('Séance déplacée');
    const after = Number(/SEQUENCE:(\d+)/.exec(moved)![1]);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(feedSequence(new Date().toISOString()));

    const restoredFrom = after;
    // SEQUENCE counts seconds: let one pass, as it does between two real polls of a calendar app.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    // Restored through the API, so the occupancy index follows.
    for (const ex of await t.prisma.slotException.findMany({
      where: {
        slotId: slot.id,
        date: { in: [cancelDay, moveDay].map((d) => new Date(`${d}T00:00:00Z`)) },
      },
    }))
      await t.http().delete(`/api/timetable/exceptions/${ex.id}`).set(bearer(admin)).expect(200);
    // Back to the rule's day: the entry is at its old place, and its SEQUENCE did not fall back.
    const back = entry(await ics(made.url), movedUid);
    expect(back).toContain(`DTSTART;TZID=Africa/Cairo:${moveDay.replace(/-/g, '')}T`);
    expect(Number(/SEQUENCE:(\d+)/.exec(back)![1])).toBeGreaterThan(restoredFrom);
  });

  it('answers 404 to malformed, unknown, tampered, replaced and revoked addresses', async () => {
    await get('/api/calendar/feed/nothing.ics').expect(404);
    await get(`/api/calendar/feed/${'0'.repeat(32)}${'A'.repeat(43)}.ics`).expect(404);
    const first = await create(studentToken);
    const path = pathOf(first.url);
    await get(path.replace(/.\.ics$/, (m) => (m[0] === 'A' ? 'B.ics' : 'A.ics'))).expect(404);
    await get(path.replace(/\.ics$/, '')).expect(404);
    await get(path).expect(200);

    const second = await create(studentToken);
    await get(path).expect(404);
    await get(pathOf(second.url)).expect(200);

    await t.http().delete('/api/calendar/feed').set(bearer(studentToken)).expect(204);
    await get(pathOf(second.url)).expect(404);
    const status = (await t.http().get('/api/calendar/feed').set(bearer(studentToken)).expect(200))
      .body as CalendarFeedDto;
    expect(status.active).toBe(false);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'calendar_feed.revoke', actorId: { not: null } },
      }),
    ).toBeGreaterThan(0);
  });

  it('stops when the password changes or the account is disabled', async () => {
    const changing = await freshTeacher();
    const feed = await create(changing.token);
    await get(pathOf(feed.url)).expect(200);
    await t
      .http()
      .post('/api/auth/password')
      .set(bearer(changing.token))
      .send({ currentPassword: changing.password, newPassword: 'Nouveau-Cedre-2027' })
      .expect(200);
    await get(pathOf(feed.url)).expect(404);

    const disabled = await freshTeacher();
    const feed2 = await create(disabled.token);
    await get(pathOf(feed2.url)).expect(200);
    await t
      .http()
      .patch(`/api/users/${disabled.id}`)
      .set(bearer(admin))
      .send({ status: 'disabled' })
      .expect(200);
    await get(pathOf(feed2.url)).expect(404);
    // Restoring the account does not bring the old address back.
    await t
      .http()
      .patch(`/api/users/${disabled.id}`)
      .set(bearer(admin))
      .send({ status: 'active' })
      .expect(200);
    await get(pathOf(feed2.url)).expect(404);
  });

  it('stops when the student is archived', async () => {
    const res = await t
      .http()
      .post('/api/users')
      .set(bearer(admin))
      .send({
        role: 'student',
        firstName: 'Feed',
        lastName: `Archive${Math.random().toString(36).slice(2, 8)}`,
        classId: student.classId,
      })
      .expect(201);
    const created = res.body as CreatedUserResponse;
    createdUsers.push(created.user.id);
    const login = await t
      .http()
      .post('/api/auth/login')
      .send({ email: created.user.email, password: created.temporaryPassword })
      .expect(200);
    const changed = await t
      .http()
      .post('/api/auth/password')
      .set(bearer((login.body as SessionResponse).accessToken))
      .send({ currentPassword: created.temporaryPassword, newPassword: 'Agenda-Archive-2026' })
      .expect(200);
    const feed = await create((changed.body as SessionResponse).accessToken);
    await get(pathOf(feed.url)).expect(200);
    const studentId = (
      await t.prisma.student.findUniqueOrThrow({ where: { userId: created.user.id } })
    ).id;
    await t
      .http()
      .post('/api/users/archive')
      .set(bearer(admin))
      .send({ studentIds: [studentId], outcome: 'left', on: TODAY })
      .expect(200);
    await get(pathOf(feed.url)).expect(404);
  });

  it('gives a teacher their own sessions and the events of the classes they teach', async () => {
    const feed = await create(maths);
    const text = await ics(feed.url);
    const mathsTeacher = await t.prisma.teacher.findFirstOrThrow({
      where: { user: { email: MATHS_TEACHER } },
    });
    const slotIds = [
      ...new Set(uids(text).flatMap((u) => /^slot-([0-9a-f-]{36})-/.exec(u)?.[1] ?? [])),
    ];
    expect(slotIds.length).toBeGreaterThan(0);
    const slots = await t.prisma.timetableSlot.findMany({
      where: { id: { in: slotIds } },
      include: { exceptions: true },
    });
    // Their own sessions, or sessions where they stand in for a colleague (other specs name them so).
    for (const s of slots)
      expect(
        s.teacherId === mathsTeacher.id ||
          s.exceptions.some((e) => e.kind === 'substitute' && e.newTeacherId === mathsTeacher.id),
      ).toBe(true);
    // A homework of another teacher's subject in a class they teach is not theirs.
    const french = await t.prisma.event.findFirst({
      where: {
        classId: student.classId,
        subjectId: 'francais',
        authorId: { not: mathsTeacher.id },
      },
    });
    if (french) expect(text).not.toContain(french.id);
    const own = (
      await t
        .http()
        .post('/api/events')
        .set(bearer(maths))
        .send({
          activityTypeId: (
            await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'devoir' } })
          ).id,
          title: 'Feed devoir',
          subjectId: 'mathematiques',
          classId: student.classId,
          date: addDays(TODAY, 40),
        })
        .expect(201)
    ).body as EventDto;
    expect(uids(await ics(feed.url))).toContain(`event-${own.id}`);
    await t.http().delete(`/api/events/${own.id}`).set(bearer(maths)).expect(204);
  });

  // Last: it uses up this app's budget of feed requests.
  it('limits the feed to FEED_THROTTLE_LIMIT requests a minute per client, unknown tokens included', async () => {
    const limit = Number(process.env['FEED_THROTTLE_LIMIT'] ?? 60);
    const statuses: number[] = [];
    for (let i = 0; i <= limit; i++)
      statuses.push(
        (await get(`/api/calendar/feed/${'0'.repeat(32)}${'B'.repeat(43)}.ics`)).status,
      );
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s !== 404 && s !== 429)).toEqual([]);
  });
});
