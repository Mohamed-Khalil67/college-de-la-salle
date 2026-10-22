import type { ApiError, ClassDto, PeriodDto, SchoolYearDto, SectionDto } from '@cdls/shared';
import { ADMIN, bearer, createTestApp, MATHS_TEACHER, studentOf, type TestApp } from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);

/** Admin clean-up: deleting a class, a school year or a period created by mistake, never one in use. */
describe('Clean-up deletions (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let teacher: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    teacher = await t.token(MATHS_TEACHER);
  });

  afterAll(() => t.close());

  /** A new, empty school year with one period. */
  async function spareYear(label: string) {
    const year = (
      await t
        .http()
        .post('/api/school-years')
        .set(bearer(admin))
        .send({ label, startsOn: `${label.slice(0, 4)}-09-01`, endsOn: `${label.slice(5)}-06-30` })
        .expect(201)
    ).body as SchoolYearDto;
    const period = (
      await t
        .http()
        .post(`/api/school-years/${year.id}/periods`)
        .set(bearer(admin))
        .send({
          number: 1,
          label: '1er trimestre',
          startsOn: `${label.slice(0, 4)}-09-01`,
          endsOn: `${label.slice(0, 4)}-12-20`,
        })
        .expect(201)
    ).body as PeriodDto;
    return { year, period };
  }

  it('deletes an empty class, refuses one with students', async () => {
    const sections = (await t.http().get('/api/sections').set(bearer(admin)).expect(200))
      .body as SectionDto[];
    const current = (
      (await t.http().get('/api/school-years').set(bearer(admin)).expect(200))
        .body as SchoolYearDto[]
    ).find((y) => y.isCurrent)!;
    const created = (
      await t
        .http()
        .post('/api/classes')
        .set(bearer(admin))
        .send({
          schoolYearId: current.id,
          sectionId: sections[0]!.id,
          code: 'classe-erreur',
          label: 'Classe créée par erreur',
        })
        .expect(201)
    ).body as ClassDto;

    // Teachers may not delete classes.
    await t.http().delete(`/api/classes/${created.id}`).set(bearer(teacher)).expect(403);

    await t.http().delete(`/api/classes/${created.id}`).set(bearer(admin)).expect(204);
    await t.http().get(`/api/classes/${created.id}`).set(bearer(admin)).expect(404);
    await t.http().delete(`/api/classes/${created.id}`).set(bearer(admin)).expect(404);
    expect(
      await t.prisma.auditLog.count({ where: { action: 'class.delete', entityId: created.id } }),
    ).toBe(1);

    const busy = await studentOf(t.prisma, 'bac', 'premiere');
    const res = await t
      .http()
      .delete(`/api/classes/${busy.classId}`)
      .set(bearer(admin))
      .expect(409);
    expect(message(res.body)).toMatch(/élèves inscrits/);
  });

  it('refuses a class whose students left but whose grades remain', async () => {
    const { year } = await spareYear('2031-2032');
    const sections = (await t.http().get('/api/sections').set(bearer(admin)).expect(200))
      .body as SectionDto[];
    const schoolClass = (
      await t
        .http()
        .post('/api/classes')
        .set(bearer(admin))
        .send({
          schoolYearId: year.id,
          sectionId: sections[0]!.id,
          code: 'avec-notes',
          label: 'Classe avec notes',
        })
        .expect(201)
    ).body as ClassDto;
    const teacher = await t.prisma.teacher.findFirstOrThrow({
      where: { user: { email: MATHS_TEACHER } },
    });
    const student = await studentOf(t.prisma, 'bac', 'premiere');
    const event = await t.prisma.event.create({
      data: {
        activityTypeId: (
          await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'examen' } })
        ).id,
        periodId: (await t.prisma.period.findFirstOrThrow({ where: { schoolYearId: year.id } })).id,
        title: 'Examen',
        classId: schoolClass.id,
        date: new Date('2031-10-10T00:00:00Z'),
        authorId: teacher.id,
      },
    });
    await t.prisma.grade.create({
      data: { eventId: event.id, studentId: student.studentId, score: 12, gradedById: teacher.id },
    });
    const res = await t
      .http()
      .delete(`/api/classes/${schoolClass.id}`)
      .set(bearer(admin))
      .expect(409);
    expect(message(res.body)).toMatch(/notes/);

    // The year has a class: it stays too, and its graded period as well.
    const yearRes = await t
      .http()
      .delete(`/api/school-years/${year.id}`)
      .set(bearer(admin))
      .expect(409);
    expect(message(yearRes.body)).toMatch(/classes/);
    const period = await t.prisma.period.findFirstOrThrow({ where: { schoolYearId: year.id } });
    const periodRes = await t
      .http()
      .delete(`/api/periods/${period.id}`)
      .set(bearer(admin))
      .expect(409);
    expect(message(periodRes.body)).toMatch(/notes/);
  });

  it('deletes an empty school year with its periods, never the current one', async () => {
    const { year, period } = await spareYear('2032-2033');
    await t.http().delete(`/api/school-years/${year.id}`).set(bearer(teacher)).expect(403);
    await t.http().delete(`/api/school-years/${year.id}`).set(bearer(admin)).expect(204);
    expect(await t.prisma.period.findUnique({ where: { id: period.id } })).toBeNull();

    const current = await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
    const res = await t
      .http()
      .delete(`/api/school-years/${current.id}`)
      .set(bearer(admin))
      .expect(409);
    expect(message(res.body)).toMatch(/année en cours/);
  });

  it('deletes a period without grades, refuses one with grades', async () => {
    const { period } = await spareYear('2033-2034');
    await t.http().delete(`/api/periods/${period.id}`).set(bearer(teacher)).expect(403);
    await t.http().delete(`/api/periods/${period.id}`).set(bearer(admin)).expect(204);
    await t.http().delete(`/api/periods/${period.id}`).set(bearer(admin)).expect(404);

    // The seed grades the first period of the current year.
    const graded = await t.prisma.period.findFirstOrThrow({
      where: { number: 1, schoolYear: { isCurrent: true } },
    });
    const res = await t.http().delete(`/api/periods/${graded.id}`).set(bearer(admin)).expect(409);
    expect(message(res.body)).toMatch(/notes|bulletins/);
  });
});
