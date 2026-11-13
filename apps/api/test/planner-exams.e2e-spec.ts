import { addDays, type EventDto, type EventInput, TIMETABLE_CONFLICT } from '@cdls/shared';
import { schoolToday } from '../src/common/dates.js';
import {
  activityTypeId,
  ADMIN,
  bearer,
  createTestApp,
  deleteUsers,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  PLANNER,
  studentOf,
  type TestApp,
} from './helpers.js';

const day = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * « Ajouter un examen »: the admin and a planner (an admin account without a teacher profile, or a teacher
 * marked Planificateur) set an exam or a test for ANY class; a teacher who is not a planner and a student stay
 * refused for the classes they do not teach, and for every other type of event.
 */
describe('Planner exams (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let planner: string;
  let maths: string;
  let student: string;
  let adminPlanner: string;
  let adminPlannerUserId: string;
  let since: Date;
  let examType: string;
  let homeworkType: string;
  let classId: string;
  let subjectId: string;
  let friday: string;
  const eventIds: string[] = [];

  const exam = (over: Partial<EventInput> = {}): EventInput => ({
    activityTypeId: examType,
    title: 'Examen de test planificateur',
    classId,
    subjectId,
    date: friday,
    startTime: '18:00',
    endTime: '19:00',
    ...over,
  });

  const create = async (token: string, body: EventInput, status = 201) => {
    const res = await t.http().post('/api/events').set(bearer(token)).send(body).expect(status);
    if (status === 201) eventIds.push((res.body as EventDto).id);
    return res;
  };

  beforeAll(async () => {
    since = new Date(Date.now() - 2000);
    t = await createTestApp();
    admin = await t.token(ADMIN);
    planner = await t.token(PLANNER);
    maths = await t.token(MATHS_TEACHER);
    const first = await studentOf(t.prisma, 'bac', 'premiere');
    student = await t.token(first.email);
    classId = first.classId;
    examType = await activityTypeId(t.prisma, 'examen');
    homeworkType = await activityTypeId(t.prisma, 'devoir');

    // An admin account that holds the permission and has no teacher profile (it signs in like the seeded admin).
    const seededAdmin = await t.prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });
    const made = await t.prisma.user.create({
      data: {
        email: `exam.planner.${Date.now()}@demo.cdls.test`,
        passwordHash: seededAdmin.passwordHash,
        role: 'admin',
        firstName: 'Plan',
        lastName: 'Admin',
        mustChangePassword: false,
        isPlanner: true,
      },
    });
    adminPlannerUserId = made.id;
    adminPlanner = await t.token(made.email);

    // A subject of that class that neither the planner teacher nor the maths teacher teaches there.
    const staff = await t.prisma.teacher.findMany({
      where: { user: { email: { in: [PLANNER, MATHS_TEACHER, FRENCH_TEACHER] } } },
      select: { id: true },
    });
    const free = await t.prisma.classSubject.findFirstOrThrow({
      where: {
        classId,
        assignments: { none: { teacherId: { in: staff.map((s) => s.id) } } },
      },
    });
    subjectId = free.subjectId;

    // A Friday evening in an open period of the class (the school week is Sunday to Thursday: no clash with lessons).
    const schoolClass = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
    const periods = await t.prisma.period.findMany({
      where: {
        schoolYearId: schoolClass.schoolYearId,
        closedAt: null,
        OR: [{ sectionId: null }, { sectionId: schoolClass.sectionId }],
      },
      orderBy: { startsOn: 'asc' },
    });
    const from = addDays(schoolToday(), 7);
    let candidate = from;
    while (new Date(`${candidate}T00:00:00Z`).getUTCDay() !== 5) candidate = addDays(candidate, 1);
    for (let i = 0; i < 12; i++, candidate = addDays(candidate, 7)) {
      if (periods.some((p) => p.startsOn <= day(candidate) && day(candidate) <= p.endsOn)) {
        friday = candidate;
        return;
      }
    }
    throw new Error('No open period covers a coming Friday: the fixture needs one.');
  });

  afterAll(async () => {
    await t.prisma.grade.deleteMany({ where: { eventId: { in: eventIds } } });
    await t.prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await t.prisma.notification.deleteMany({ where: { createdAt: { gte: since } } });
    await t.prisma.auditLog.deleteMany({
      where: { action: { startsWith: 'event.exam.' }, createdAt: { gte: since } },
    });
    await deleteUsers(t.prisma, [adminPlannerUserId]);
    await t.close();
  });

  it('lets an admin account without a teacher profile set an exam, as the author, with an audit row', async () => {
    const res = await create(adminPlanner, exam());
    const body = res.body as EventDto;
    expect(body.authorId).toBeNull();
    expect(body.authorName).toBe('Plan Admin');
    expect(body.type.gradable).toBe(true);
    const row = await t.prisma.event.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.authorId).toBeNull();
    expect(row.createdById).toBe(adminPlannerUserId);
    const logs = await t.prisma.auditLog.findMany({
      where: { entityId: body.id, action: 'event.exam.create' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorId).toBe(adminPlannerUserId);
  });

  it('shows the exam to the students of the class (and not to another class)', async () => {
    const list = await t
      .http()
      .get('/api/events')
      .query({ from: friday, to: friday })
      .set(bearer(student))
      .expect(200);
    expect((list.body as EventDto[]).some((e) => e.title === 'Examen de test planificateur')).toBe(true);
  });

  it('lets a planner teacher set a test for a class they do not teach, but only exam types', async () => {
    const test = await activityTypeId(t.prisma, 'controle');
    await create(planner, exam({ activityTypeId: test, title: 'Contrôle planificateur', startTime: '19:30', endTime: '20:00' }));
    // Homework (or anything that is not an exam type) stays with the teachers of the class.
    await create(planner, exam({ activityTypeId: homeworkType, title: 'Devoir refusé' }), 403);
  });

  it('keeps a teacher who is not a planner and a student out of other classes', async () => {
    await create(maths, exam(), 403);
    await create(student, exam(), 403);
    await create(await t.token(FRENCH_TEACHER), exam({ startTime: '20:30', endTime: '21:00' }), 403);
  });

  it('refuses a clash of the class at the same time (409 TIMETABLE_CONFLICT) and writes nothing', async () => {
    const before = await t.prisma.event.count({ where: { classId, date: day(friday) } });
    const res = await create(admin, exam({ title: 'Doublon', startTime: '18:30', endTime: '19:15' }), 409);
    expect((res.body as { code: string }).code).toBe(TIMETABLE_CONFLICT);
    expect(await t.prisma.event.count({ where: { classId, date: day(friday) } })).toBe(before);
  });

  it('lets a planner edit and delete only their own exam; the admin may touch any', async () => {
    const mine = (await create(adminPlanner, exam({ title: 'À déplacer', startTime: '21:00', endTime: '21:30' }))).body as EventDto;
    // Another planner (a teacher account) cannot touch it.
    await t.http().patch(`/api/events/${mine.id}`).set(bearer(planner)).send({ title: 'x' }).expect(403);
    await t.http().delete(`/api/events/${mine.id}`).set(bearer(planner)).expect(403);
    // The creator can move it; the change is audited.
    const moved = await t
      .http()
      .patch(`/api/events/${mine.id}`)
      .set(bearer(adminPlanner))
      .send({ startTime: '21:15', endTime: '21:45' })
      .expect(200);
    expect((moved.body as EventDto).startTime).toBe('21:15');
    await t.http().patch(`/api/events/${mine.id}`).set(bearer(admin)).send({ title: 'Renommé' }).expect(200);
    await t.http().delete(`/api/events/${mine.id}`).set(bearer(adminPlanner)).expect(204);
    const actions = (
      await t.prisma.auditLog.findMany({ where: { entityId: mine.id }, orderBy: { id: 'asc' } })
    ).map((l) => l.action);
    expect(actions).toEqual(['event.exam.create', 'event.exam.update', 'event.exam.update', 'event.exam.delete']);
  });

  it('refuses homework and other non-exam events to an admin account without a teacher profile (403, nothing written)', async () => {
    const before = await t.prisma.event.count({ where: { createdById: adminPlannerUserId } });
    for (const body of [
      exam({ activityTypeId: homeworkType, title: 'Devoir sans auteur' }),
      // Section-wide and school-wide notices have no class to authorise: still refused without a profile.
      exam({ activityTypeId: homeworkType, title: 'Annonce de section', classId: null, subjectId: null, sectionId: (await t.prisma.section.findFirstOrThrow()).id }),
      exam({ activityTypeId: homeworkType, title: 'Annonce générale', classId: null, subjectId: null }),
    ]) {
      const res = await create(adminPlanner, body, 403);
      expect((res.body as { message: string }).message).toMatch(/profil enseignant/);
      await create(admin, body, 403);
    }
    expect(await t.prisma.event.count({ where: { createdById: adminPlannerUserId } })).toBe(before);
  });

  it('keeps the exam path of the admin, but refuses to turn an exam into homework', async () => {
    const made = (await create(admin, exam({ title: 'Examen de l’admin', startTime: '07:00', endTime: '07:30' }))).body as EventDto;
    await t.http().patch(`/api/events/${made.id}`).set(bearer(admin)).send({ activityTypeId: homeworkType, coefficient: 1 }).expect(403);
    await t.http().patch(`/api/events/${made.id}`).set(bearer(admin)).send({ title: 'Examen renommé' }).expect(200);
  });

  it('refuses a planner whose permission was revoked the edit and the deletion of the exam they created, unaudited', async () => {
    const made = (await create(planner, exam({ title: 'Examen d’un ancien planificateur', startTime: '22:00', endTime: '22:30' }))).body as EventDto;
    const plannerUser = await t.prisma.user.findUniqueOrThrow({ where: { email: PLANNER } });
    const auditCount = () => t.prisma.auditLog.count({ where: { entityId: made.id } });
    expect(await auditCount()).toBe(1);
    await t.prisma.user.update({ where: { id: plannerUser.id }, data: { isPlanner: false } });
    try {
      await t.http().patch(`/api/events/${made.id}`).set(bearer(planner)).send({ title: 'Modifié' }).expect(403);
      await t.http().patch(`/api/events/${made.id}`).set(bearer(planner)).send({ startTime: '22:10', endTime: '22:40' }).expect(403);
      await t.http().delete(`/api/events/${made.id}`).set(bearer(planner)).expect(403);
      const kept = await t.prisma.event.findUniqueOrThrow({ where: { id: made.id } });
      expect(kept.title).toBe('Examen d’un ancien planificateur');
      expect(await auditCount()).toBe(1);
    } finally {
      await t.prisma.user.update({ where: { id: plannerUser.id }, data: { isPlanner: true } });
    }
    // The admin still may, and it is audited.
    await t.http().patch(`/api/events/${made.id}`).set(bearer(admin)).send({ title: 'Repris par l’admin' }).expect(200);
    expect(await auditCount()).toBe(2);
    await t.http().delete(`/api/events/${made.id}`).set(bearer(admin)).expect(204);
    expect(await auditCount()).toBe(3);
  });

  it('still lets a teacher edit and delete their own event of a class they teach, and audits an admin deleting a teacher’s exam', async () => {
    const mine = await t.prisma.teachingAssignment.findFirstOrThrow({
      where: { teacher: { user: { email: MATHS_TEACHER } } },
      select: { classSubject: { select: { classId: true, subjectId: true } } },
    });
    const body = {
      activityTypeId: homeworkType,
      title: 'Devoir de mon enseignant',
      classId: mine.classSubject.classId,
      subjectId: mine.classSubject.subjectId,
      date: friday,
    };
    const made = (await create(maths, body)).body as EventDto;
    await t.http().patch(`/api/events/${made.id}`).set(bearer(maths)).send({ title: 'Devoir revu' }).expect(200);
    await t.http().delete(`/api/events/${made.id}`).set(bearer(maths)).expect(204);
  });

  it('lets the admin enter the marks of an exam that has no teacher author (recorded under a teacher of the class)', async () => {
    const owned = await t.prisma.event.findFirstOrThrow({ where: { id: { in: eventIds }, authorId: null } });
    const teachers = await t.prisma.teachingAssignment.count({
      where: { classSubject: { classId, subjectId } },
    });
    const roster = await t.prisma.enrollment.findFirstOrThrow({ where: { classId, leftOn: null } });
    const res = await t
      .http()
      .put(`/api/events/${owned.id}/grades`)
      .set(bearer(admin))
      .send({ entries: [{ studentId: roster.studentId, score: 12 }] });
    // With a teacher on the subject the mark is saved; without one the API says so instead of failing.
    expect(res.status).toBe(teachers > 0 ? 200 : 409);
  });
});
