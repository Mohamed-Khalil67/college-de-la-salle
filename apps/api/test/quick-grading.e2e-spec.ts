import {
  type GradeSheetDto,
  type PendingGradingDto,
  type StudentGradesDto,
} from '@cdls/shared';
import { fromDay, schoolToday } from '../src/common/dates.js';
import {
  activityTypeId,
  ADMIN,
  bearer,
  createTestApp,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  studentOf,
  type TestApp,
} from './helpers.js';

const message = (body: unknown) => (body as { message?: unknown }).message;
/** Fails with the API's answer in the message, so a refusal is readable in the log. */
const created = (res: { status: number; body: unknown }) => {
  if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
};

/** « Noter »: a teacher grades a class straight away, without an agenda event first. */
describe('Quick grading (e2e)', () => {
  let t: TestApp;
  let student: Awaited<ReturnType<typeof studentOf>>;
  let teacher: string;
  let pupil: string;
  const since = new Date();
  /** Periods covering today that earlier specs left closed: reopened for this spec, closed again after it. */
  const reopened: { id: string; closedAt: Date }[] = [];
  const madeIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    student = await studentOf(t.prisma, 'bac', 'premiere');
    teacher = await t.token(MATHS_TEACHER);
    pupil = await t.token(student.email);
    const today = fromDay(schoolToday());
    const closed = await t.prisma.period.findMany({
      where: { startsOn: { lte: today }, endsOn: { gte: today }, closedAt: { not: null } },
    });
    for (const p of closed) {
      reopened.push({ id: p.id, closedAt: p.closedAt! });
      await t.prisma.period.update({ where: { id: p.id }, data: { closedAt: null } });
    }
  });

  afterAll(async () => {
    // Grades go with their events; the publish notifications are this spec's own.
    await t.prisma.notification.deleteMany({ where: { createdAt: { gte: since } } });
    await t.prisma.event.deleteMany({ where: { id: { in: madeIds } } });
    for (const p of reopened)
      await t.prisma.period.update({ where: { id: p.id }, data: { closedAt: p.closedAt } });
    await t.close();
  });

  const create = (token: string, body: Record<string, unknown>) =>
    t.http().post('/api/grading/assessments').set(bearer(token)).send(body);
  const body = (title: string) => ({
    classId: student.classId,
    subjectId: 'mathematiques',
    title,
  });
  const pending = async () =>
    (
      await t
        .http()
        .get(`/api/grading/pending?classId=${student.classId}&subjectId=mathematiques`)
        .set(bearer(teacher))
        .expect(200)
    ).body as PendingGradingDto[];
  const studentSees = async (eventId: string) => {
    const res = await t
      .http()
      .get(`/api/students/${student.studentId}/grades`)
      .set(bearer(pupil))
      .expect(200);
    return (res.body as StudentGradesDto).subjects
      .flatMap((s) => s.grades)
      .find((g) => g.event.id === eventId);
  };

  it('creates today’s gradable event for the whole class and answers its grade sheet', async () => {
    const res = await create(teacher, {
      ...body('  Interrogation éclair  '),
      coefficient: 2,
    }).expect(created);
    const sheet = res.body as GradeSheetDto;
    madeIds.push(sheet.event.id);

    expect(sheet.event).toMatchObject({
      title: 'Interrogation éclair',
      classId: student.classId,
      subjectId: 'mathematiques',
      date: schoolToday(),
      startTime: null,
      endTime: null,
      coefficient: 2,
    });
    expect(sheet.event.type).toMatchObject({ gradable: true, homework: false, repeatable: false });
    expect(sheet.event.periodId).not.toBeNull();
    expect(sheet.event.target.whole).toBe(true);
    expect(sheet.rows.length).toBeGreaterThan(0);
    expect(sheet.rows.every((r) => r.grade === null && r.targeted)).toBe(true);

    // Audited, and nobody was told yet: students learn about it when the grades are published.
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'event.create', entityId: sheet.event.id },
      }),
    ).toBe(1);
    expect(
      await t.prisma.notification.count({
        where: { createdAt: { gte: since }, entityId: sheet.event.id },
      }),
    ).toBe(0);
  });

  it('lists it as pending until every mark is in and published; students see it only after publish', async () => {
    const res = await create(teacher, body('Contrôle rapide')).expect(created);
    const sheet = res.body as GradeSheetDto;
    madeIds.push(sheet.event.id);

    let item = (await pending()).find((p) => p.event.id === sheet.event.id);
    expect(item).toMatchObject({
      entered: 0,
      total: sheet.rows.length,
      published: false,
      outOf: null,
    });

    await t
      .http()
      .put(`/api/events/${sheet.event.id}/grades`)
      .set(bearer(teacher))
      .send({ outOf: 10, entries: [{ studentId: student.studentId, score: 7.5 }] })
      .expect(200);
    item = (await pending()).find((p) => p.event.id === sheet.event.id);
    expect(item).toMatchObject({ entered: 1, published: false, outOf: 10 });
    expect(await studentSees(sheet.event.id)).toBeUndefined();

    await t
      .http()
      .post(`/api/events/${sheet.event.id}/grades/publish`)
      .set(bearer(teacher))
      .send({ published: true })
      .expect(200);
    const seen = await studentSees(sheet.event.id);
    expect(seen?.grade).toMatchObject({ score: 7.5, outOf: 10, published: true });
    expect(seen?.event.title).toBe('Contrôle rapide');

    // Published but not complete: still to finish.
    if (sheet.rows.length > 1)
      expect((await pending()).some((p) => p.event.id === sheet.event.id)).toBe(true);

    // Every concerned student graded and published: no longer pending.
    await t
      .http()
      .put(`/api/events/${sheet.event.id}/grades`)
      .set(bearer(teacher))
      .send({ entries: sheet.rows.map((r) => ({ studentId: r.student.id, score: 5 })) })
      .expect(200);
    expect((await pending()).some((p) => p.event.id === sheet.event.id)).toBe(false);
  });

  it('validates the title', async () => {
    const blank = await create(teacher, body('   ')).expect(400);
    expect(JSON.stringify(message(blank.body))).toMatch(/Donnez un nom/);
    await create(teacher, body('x'.repeat(121))).expect(400);
    await create(teacher, { classId: student.classId, subjectId: 'mathematiques' }).expect(400);
    await create(teacher, { ...body('Ok'), coefficient: 30 }).expect(400);
    await create(teacher, { ...body('Ok'), extra: true }).expect(400);
  });

  it('refuses a homework or ungraded type', async () => {
    const devoir = await activityTypeId(t.prisma, 'devoir');
    const cours = await activityTypeId(t.prisma, 'cours');
    await create(teacher, { ...body('Devoir'), activityTypeId: devoir }).expect(400);
    await create(teacher, { ...body('Cours'), activityTypeId: cours }).expect(400);
  });

  it('refuses a teacher who does not teach this class and subject (403)', async () => {
    const french = await t.token(FRENCH_TEACHER);
    await create(french, body('Pas ma classe')).expect(403);
    await t
      .http()
      .get(`/api/grading/pending?classId=${student.classId}&subjectId=mathematiques`)
      .set(bearer(french))
      .expect(403);
  });

  it('refuses students and the admin', async () => {
    const admin = await t.token(ADMIN);
    await create(pupil, body('Non')).expect(403);
    await create(admin, body('Non')).expect(403);
    await t
      .http()
      .get(`/api/grading/pending?classId=${student.classId}&subjectId=mathematiques`)
      .set(bearer(pupil))
      .expect(403);
    await t
      .http()
      .get(`/api/grading/pending?classId=${student.classId}&subjectId=mathematiques`)
      .set(bearer(admin))
      .expect(403);
  });

  it('answers 409 when the current period is closed, and leaves its drafts out of the list', async () => {
    const draft = (await create(teacher, body('Avant clôture')).expect(created))
      .body as GradeSheetDto;
    madeIds.push(draft.event.id);
    const periodId = draft.event.periodId!;
    const before = await t.prisma.event.count({ where: { classId: student.classId } });
    await t.prisma.period.update({ where: { id: periodId }, data: { closedAt: new Date() } });
    try {
      const res = await create(teacher, body('Trop tard')).expect(409);
      expect(message(res.body)).toMatch(/clôturée/);
      expect(await t.prisma.event.count({ where: { classId: student.classId } })).toBe(before);
      expect((await pending()).some((p) => p.event.id === draft.event.id)).toBe(false);
    } finally {
      await t.prisma.period.update({ where: { id: periodId }, data: { closedAt: null } });
    }
  });
});
