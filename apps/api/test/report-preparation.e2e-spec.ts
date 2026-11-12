import type {
  NotificationDto,
  Paginated,
  ReportPreparationDto,
  ReportReminderResponse,
} from '@cdls/shared';
import { schoolToday } from '../src/common/dates.js';
import {
  activityTypeId,
  ADMIN,
  bearer,
  createTestApp,
  MATHS_TEACHER,
  PLANNER,
  studentOf,
  type TestApp,
} from './helpers.js';

/** « Préparer les bulletins » and « Relancer »: the admin sees what is missing and reminds the teachers. */
describe('Report preparation and reminders (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let periodId: string;
  let classId: string;
  let eventId: string;
  let mathsUserId: string;
  /** The period as the spec found it: reopened for the reminders, restored afterwards. */
  let original: { closedAt: Date | null };
  const since = new Date();

  beforeAll(async () => {
    // The spec makes many reminder requests: raise the limit it exercises last.
    process.env['REMINDER_THROTTLE_LIMIT'] = '40';
    t = await createTestApp();
    admin = await t.token(ADMIN);
    const student = await studentOf(t.prisma, 'bac', 'premiere');
    classId = student.classId;
    const cls = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
    const period = await t.prisma.period.findFirstOrThrow({
      where: { schoolYearId: cls.schoolYearId, OR: [{ sectionId: null }, { sectionId: cls.sectionId }] },
      orderBy: { startsOn: 'asc' },
    });
    periodId = period.id;
    original = { closedAt: period.closedAt };
    await t.prisma.period.update({ where: { id: periodId }, data: { closedAt: null } });

    const teacher = await t.prisma.teacher.findFirstOrThrow({
      where: { user: { email: MATHS_TEACHER } },
    });
    mathsUserId = teacher.userId;
    // A mathematics assessment with two marks out of a whole class: unfinished work.
    const event = await t.prisma.event.create({
      data: {
        activityTypeId: await activityTypeId(t.prisma, 'examen'),
        title: 'Spec relance',
        subjectId: 'mathematiques',
        classId,
        date: new Date(`${schoolToday()}T00:00:00Z`),
        periodId,
        authorId: teacher.id,
      },
    });
    eventId = event.id;
    const students = await t.prisma.enrollment.findMany({
      where: { classId, leftOn: null },
      take: 2,
      orderBy: { studentId: 'asc' },
    });
    for (const s of students)
      await t.prisma.grade.create({
        data: { eventId, studentId: s.studentId, score: 12, gradedById: teacher.id },
      });
  });

  afterAll(async () => {
    await t.prisma.notification.deleteMany({ where: { createdAt: { gte: since }, kind: 'grades_reminder' } });
    await t.prisma.auditLog.deleteMany({
      where: { createdAt: { gte: since }, action: 'report_preparation.remind' },
    });
    await t.prisma.event.deleteMany({ where: { id: eventId } });
    await t.prisma.period.update({ where: { id: periodId }, data: { closedAt: original.closedAt } });
    await t.close();
  });

  const get = (token: string) =>
    t.http().get(`/api/periods/${periodId}/report-preparation`).set(bearer(token));
  const remind = (token: string, body: Record<string, unknown> = { classId }) =>
    t.http().post(`/api/periods/${periodId}/report-preparation/reminders`).set(bearer(token)).send(body);
  const reminders = async () =>
    t.prisma.notification.findMany({
      where: { userId: mathsUserId, kind: 'grades_reminder', createdAt: { gte: since } },
    });

  it('is the admin’s alone: teachers, planners, students and visitors are refused', async () => {
    const teacher = await t.token(MATHS_TEACHER);
    const planner = await t.token(PLANNER);
    const student = await t.token((await studentOf(t.prisma, 'bac', 'premiere')).email);
    for (const token of [teacher, planner, student]) {
      await get(token).expect(403);
      await remind(token).expect(403);
    }
    await t.http().get(`/api/periods/${periodId}/report-preparation`).expect(401);
    await t.http().post(`/api/periods/${periodId}/report-preparation/reminders`).send({}).expect(401);
  });

  it('says, per class, which subject is not ready and who teaches it', async () => {
    const res = await get(admin).expect(200);
    const prep = res.body as ReportPreparationDto;
    expect(prep.period.id).toBe(periodId);
    expect(prep.classCount).toBe(prep.classes.length);
    expect(prep.readySubjectCount).toBeLessThanOrEqual(prep.subjectCount);
    const mine = prep.classes.find((c) => c.classId === classId);
    expect(mine?.complete).toBe(false);
    const maths = mine?.gaps.find((g) => g.subjectId === 'mathematiques');
    expect(maths?.reason).toBe('incomplete');
    expect(maths?.entered).toBeGreaterThanOrEqual(2);
    expect(maths?.total).toBeGreaterThan(maths?.entered ?? 0);
    expect(maths?.teachers.map((x) => x.name).join(' ')).toMatch(/Mansour/);
    // Nothing about accounts leaks: ids of teachers only, no user ids or e-mails.
    expect(JSON.stringify(prep)).not.toContain(mathsUserId);
    expect(prep.lateTeacherCount).toBeGreaterThan(0);
  });

  it('answers 404 for an unknown period or class', async () => {
    const none = '00000000-0000-4000-8000-000000000000';
    await t.http().get(`/api/periods/${none}/report-preparation`).set(bearer(admin)).expect(404);
    await remind(admin, { classId: none }).expect(404);
    await remind(admin, { classId: 'nope' }).expect(400);
  });

  it('reminds the teacher once: a notification in their list, an audit row, and a cooldown', async () => {
    const first = (await remind(admin).expect(200)).body as ReportReminderResponse;
    expect(first.teachers).toBeGreaterThan(0);
    expect(first.notified).toBeGreaterThan(0);
    expect(first.alreadyReminded).toBe(0);

    const [n] = await reminders();
    expect(n?.title).toMatch(/^Notes à finir : /);
    expect(n?.body).toContain('Mathématiques');
    expect(n?.link).toBe('/enseignant/notes');
    expect(n?.entityId).toBe(classId);

    const audit = await t.prisma.auditLog.findMany({
      where: { createdAt: { gte: since }, action: 'report_preparation.remind', entityId: periodId },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ classId, notified: first.notified });

    // The teacher sees it among their notifications.
    const mine = await t.http().get('/api/notifications').set(bearer(await t.token(MATHS_TEACHER))).expect(200);
    expect((mine.body as Paginated<NotificationDto>).items.some((i) => i.kind === 'grades_reminder')).toBe(true);

    // A second click, or an impatient admin: nobody is reminded again.
    const again = (await remind(admin).expect(200)).body as ReportReminderResponse;
    expect(again.notified).toBe(0);
    expect(again.alreadyReminded).toBe(first.teachers);
    expect(await reminders()).toHaveLength(1);
  });

  it('makes a whole-period reminder wait for an earlier reminder about one class', async () => {
    // The class reminder above already reached the mathematics teacher: the wider one leaves them alone.
    const wide = (await remind(admin, {}).expect(200)).body as ReportReminderResponse;
    expect(wide.alreadyReminded).toBeGreaterThanOrEqual(1);
    expect(await reminders()).toHaveLength(1);
    // The invariant of the answer: every reachable teacher is either reminded now or was reminded lately.
    expect(wide.teachers).toBe(wide.notified + wide.alreadyReminded);
  });

  it('counts a teacher whose account is disabled apart, and never reminds them', async () => {
    await t.prisma.user.update({ where: { id: mathsUserId }, data: { status: 'disabled' } });
    try {
      const prep = (await get(admin).expect(200)).body as ReportPreparationDto;
      const maths = prep.classes.find((c) => c.classId === classId)?.gaps.find((g) => g.subjectId === 'mathematiques');
      expect(maths?.teachers.map((x) => x.name).join(' ') ?? '').not.toMatch(/Mansour/);
      const before = (await reminders()).length;
      const res = (await remind(admin).expect(200)).body as ReportReminderResponse;
      expect(res.unreachable).toBeGreaterThanOrEqual(1);
      expect(res.teachers).toBe(res.notified + res.alreadyReminded);
      expect(await reminders()).toHaveLength(before);
    } finally {
      await t.prisma.user.update({ where: { id: mathsUserId }, data: { status: 'active' } });
    }
  });

  it('refuses a reminder once the period is closed', async () => {
    await t.prisma.period.update({ where: { id: periodId }, data: { closedAt: new Date() } });
    try {
      await remind(admin).expect(409);
      // Looking is still allowed.
      await get(admin).expect(200);
    } finally {
      await t.prisma.period.update({ where: { id: periodId }, data: { closedAt: null } });
    }
  });

  it('lets the admin page count the Planificateurs and the accounts never activated', async () => {
    const list = async (query: string) =>
      (await t.http().get(`/api/users?${query}`).set(bearer(admin)).expect(200)).body as Paginated<{
        email: string;
        isPlanner: boolean;
        mustChangePassword: boolean;
      }>;
    const planners = await list('isPlanner=true&pageSize=100');
    expect(planners.items.length).toBeGreaterThan(0);
    expect(planners.items.every((u) => u.isPlanner)).toBe(true);
    expect(planners.items.map((u) => u.email)).toContain(PLANNER);
    const others = await list('isPlanner=false&pageSize=100');
    expect(others.items.some((u) => u.isPlanner)).toBe(false);
    expect(planners.total + others.total).toBe((await list('pageSize=1')).total);
    const fresh = await list('mustChangePassword=true&pageSize=100');
    expect(fresh.items.every((u) => u.mustChangePassword)).toBe(true);
    await t.http().get('/api/users?isPlanner=maybe').set(bearer(admin)).expect(400);
  });

  it('is rate limited: a burst of reminders ends in 429', async () => {
    const limit = Number(process.env['REMINDER_THROTTLE_LIMIT'] ?? 10);
    let status = 200;
    for (let i = 0; i <= limit && status !== 429; i += 1) status = (await remind(admin)).status;
    expect(status).toBe(429);
  });
});
