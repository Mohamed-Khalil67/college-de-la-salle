import type {
  ApiError,
  EventDto,
  PeriodDto,
  ReportCardDto,
  SchoolYearDto,
  SectionDto,
  StudentGradesDto,
} from '@cdls/shared';
import {
  activityTypeId,
  ADMIN,
  bearer,
  COORDINATOR,
  createTestApp,
  deleteUsers,
  MATHS_TEACHER,
  type TestApp,
  UNUSABLE_PASSWORD_HASH,
} from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);

/** Periods: no overlap (the database says so), closed periods are locked, grades follow their period. */
describe('Periods (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let coordinator: string;
  let teacher: string;
  let year: SchoolYearDto;
  let sections: SectionDto[];

  const post = (token: string, body: object, yearId = year.id) =>
    t.http().post(`/api/school-years/${yearId}/periods`).set(bearer(token)).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    coordinator = await t.token(COORDINATOR);
    teacher = await t.token(MATHS_TEACHER);
    sections = (await t.http().get('/api/sections').set(bearer(admin)).expect(200))
      .body as SectionDto[];
    year = (
      await t
        .http()
        .post('/api/school-years')
        .set(bearer(coordinator))
        .send({ label: '2060-2061', startsOn: '2060-09-01', endsOn: '2061-06-30' })
        .expect(201)
    ).body as SchoolYearDto;
  });

  afterAll(async () => {
    // The student made for these tests goes too.
    const students = await t.prisma.user.findMany({
      where: { email: 'eleve.periodes@demo.cdls.test' },
      select: { id: true },
    });
    await deleteUsers(t.prisma, students.map((u) => u.id));
    await t.close();
  });

  describe('overlap', () => {
    it('refuses two periods of the same kind and section that share a day (409, in French)', async () => {
      await post(coordinator, {
        number: 1,
        label: '1er trimestre',
        startsOn: '2060-09-01',
        endsOn: '2060-12-15',
      }).expect(201);
      const res = await post(coordinator, {
        number: 2,
        label: '2e trimestre',
        startsOn: '2060-12-15',
        endsOn: '2061-03-15',
      }).expect(409);
      expect(message(res.body)).toMatch(/chevauche une autre période/);

      await post(coordinator, {
        number: 2,
        label: '2e trimestre',
        startsOn: '2060-12-16',
        endsOn: '2061-03-15',
      }).expect(201);
    });

    it('refuses a repeated number for the same kind and section', async () => {
      const res = await post(admin, {
        number: 1,
        label: 'Encore',
        startsOn: '2061-04-01',
        endsOn: '2061-06-15',
      }).expect(409);
      expect(message(res.body)).toMatch(/n° 1 existe déjà/);
    });

    it('compares sections: « every section » against one section, but not two sections', async () => {
      const [bac, nationale] = [
        sections.find((s) => s.code === 'bac')!,
        sections.find((s) => s.code === 'nationale')!,
      ];
      // Covered by the school-wide trimester 1.
      const clash = await post(admin, {
        sectionId: bac.id,
        number: 3,
        label: 'Bac',
        startsOn: '2060-10-01',
        endsOn: '2060-10-20',
      }).expect(409);
      expect(message(clash.body)).toMatch(/chevauche/);

      // Free time at the end of the year: each section gets its own third trimester, side by side.
      await post(admin, {
        sectionId: bac.id,
        number: 3,
        label: '3e trimestre',
        startsOn: '2061-03-16',
        endsOn: '2061-06-15',
      }).expect(201);
      await post(admin, {
        sectionId: nationale.id,
        number: 3,
        label: '3e trimestre',
        startsOn: '2061-03-16',
        endsOn: '2061-06-15',
      }).expect(201);
      // …but a school-wide one now clashes with both.
      await post(admin, {
        number: 3,
        label: 'Tous',
        startsOn: '2061-05-01',
        endsOn: '2061-06-20',
      }).expect(409);
    });

    it('lets semesters overlap trimesters: they are another kind', async () => {
      await post(admin, {
        kind: 'semester',
        number: 1,
        label: '1er semestre',
        startsOn: '2060-09-01',
        endsOn: '2061-01-31',
      }).expect(201);
      await post(admin, {
        kind: 'semester',
        number: 2,
        label: '2e semestre',
        startsOn: '2061-01-15',
        endsOn: '2061-06-15',
      }).expect(409);
    });

    it('checks the dates when editing a period', async () => {
      const periods = (
        (await t.http().get('/api/school-years').set(bearer(admin)).expect(200))
          .body as SchoolYearDto[]
      ).find((y) => y.id === year.id)!.periods;
      const first = periods.find((p) => p.number === 1 && p.kind === 'trimester' && !p.sectionId)!;
      const res = await t
        .http()
        .patch(`/api/periods/${first.id}`)
        .set(bearer(coordinator))
        .send({ endsOn: '2061-01-10' })
        .expect(409);
      expect(message(res.body)).toMatch(/chevauche/);
      await t
        .http()
        .patch(`/api/periods/${first.id}`)
        .set(bearer(coordinator))
        .send({ endsOn: '2061-01-10', label: 'Trimestre 1' })
        .expect(409);
      await t
        .http()
        .patch(`/api/periods/${first.id}`)
        .set(bearer(coordinator))
        .send({ endsOn: '2060-12-10' })
        .expect(200);
      await t
        .http()
        .patch(`/api/periods/${first.id}`)
        .set(bearer(coordinator))
        .send({ startsOn: '2060-12-20' })
        .expect(400);
    });

    it('is also enforced by the database, whatever the API does', async () => {
      await expect(
        t.prisma.period.create({
          data: {
            schoolYearId: year.id,
            number: 4,
            label: 'Direct',
            startsOn: new Date('2060-10-01T00:00:00Z'),
            endsOn: new Date('2060-10-05T00:00:00Z'),
          },
        }),
      ).rejects.toThrow(/periods_no_overlap/);
    });

    it('keeps periods inside the school year', async () => {
      const res = await post(admin, {
        kind: 'semester',
        number: 2,
        label: 'Hors année',
        startsOn: '2061-06-01',
        endsOn: '2061-08-30',
      }).expect(400);
      expect(message(res.body)).toMatch(/comprise dans l’année/);
    });
  });

  describe('school years', () => {
    it('are edited by a coordinator, but never to leave a period outside', async () => {
      const res = await t
        .http()
        .patch(`/api/school-years/${year.id}`)
        .set(bearer(coordinator))
        .send({ endsOn: '2061-03-01' })
        .expect(409);
      expect(message(res.body)).toMatch(/sortiraient de l’année/);
      const ok = await t
        .http()
        .patch(`/api/school-years/${year.id}`)
        .set(bearer(coordinator))
        .send({ endsOn: '2061-07-15' })
        .expect(200);
      expect((ok.body as SchoolYearDto).endsOn).toBe('2061-07-15');
      await t
        .http()
        .patch(`/api/school-years/${year.id}`)
        .set(bearer(coordinator))
        .send({ startsOn: '2062-01-01' })
        .expect(400);
    });
  });

  describe('grades and report cards follow the period, not its dates', () => {
    let classId: string;
    let studentId: string;
    let studentEmail: string;
    let period: PeriodDto;
    let exam: EventDto;

    beforeAll(async () => {
      const years = (await t.http().get('/api/school-years').set(bearer(admin)).expect(200))
        .body as SchoolYearDto[];
      period = years
        .find((y) => y.id === year.id)!
        .periods.find((p) => p.number === 1 && p.kind === 'trimester' && !p.sectionId)!;

      const section = sections.find((s) => s.code === 'bac')!;
      const schoolClass = await t.prisma.schoolClass.create({
        data: {
          schoolYearId: year.id,
          sectionId: section.id,
          code: 'periodes',
          label: 'Classe des périodes',
        },
      });
      classId = schoolClass.id;
      const mathsTeacher = await t.prisma.teacher.findFirstOrThrow({
        where: { user: { email: MATHS_TEACHER } },
      });
      const classSubject = await t.prisma.classSubject.create({
        data: {
          classId,
          subjectId: 'mathematiques',
          coefficient: 5,
          assignments: { create: { teacherId: mathsTeacher.id } },
        },
      });
      expect(classSubject.id).toBeTruthy();
      studentEmail = 'eleve.periodes@demo.cdls.test';
      const user = await t.prisma.user.create({
        data: {
          email: studentEmail,
          passwordHash: UNUSABLE_PASSWORD_HASH,
          role: 'student',
          firstName: 'Élève',
          lastName: 'Périodes',
          student: { create: { enrollments: { create: { classId, schoolYearId: year.id } } } },
        },
        include: { student: true },
      });
      studentId = user.student!.id;
    });

    it('stores the period of a gradable event from its date, and none for the others', async () => {
      const examen = await activityTypeId(t.prisma, 'examen');
      const cours = await activityTypeId(t.prisma, 'cours');
      exam = (
        await t
          .http()
          .post('/api/events')
          .set(bearer(teacher))
          .send({
            activityTypeId: examen,
            title: 'Examen',
            subjectId: 'mathematiques',
            classId,
            date: '2060-10-12',
            coefficient: 2,
          })
          .expect(201)
      ).body as EventDto;
      expect(exam.periodId).toBe(period.id);

      const lesson = (
        await t
          .http()
          .post('/api/events')
          .set(bearer(teacher))
          .send({
            activityTypeId: cours,
            title: 'Cours',
            subjectId: 'mathematiques',
            classId,
            date: '2060-10-13',
          })
          .expect(201)
      ).body as EventDto;
      expect(lesson.periodId).toBeNull();
    });

    it('refuses a date no period covers, and a period of another year', async () => {
      const examen = await activityTypeId(t.prisma, 'examen');
      const body = {
        activityTypeId: examen,
        title: 'Hors période',
        subjectId: 'mathematiques',
        classId,
      };
      const none = await t
        .http()
        .post('/api/events')
        .set(bearer(teacher))
        .send({ ...body, date: '2061-07-10' })
        .expect(400);
      expect(message(none.body)).toMatch(/Aucune période/);
      const other = await t.prisma.period.findFirstOrThrow({
        where: { schoolYearId: { not: year.id } },
      });
      await t
        .http()
        .post('/api/events')
        .set(bearer(teacher))
        .send({ ...body, date: '2060-10-14', periodId: other.id })
        .expect(400);
    });

    it("moves no grade when the period's dates change, and a report card still counts it", async () => {
      await t
        .http()
        .put(`/api/events/${exam.id}/grades`)
        .set(bearer(teacher))
        .send({ entries: [{ studentId, score: 15 }] })
        .expect(200);
      await t
        .http()
        .post(`/api/events/${exam.id}/grades/publish`)
        .set(bearer(teacher))
        .send({ published: true })
        .expect(200);

      const grades = async () =>
        (
          (
            await t
              .http()
              .get(`/api/students/${studentId}/grades?periodId=${period.id}`)
              .set(bearer(admin))
              .expect(200)
          ).body as StudentGradesDto
        ).subjects;
      const before = await grades();
      expect(before).toHaveLength(1);
      // The weight comes from the class subject.
      expect(before[0]).toMatchObject({ subjectId: 'mathematiques', average: 15, coefficient: 5 });

      // The exam day (2060-10-12) is no longer inside the period's dates…
      await t
        .http()
        .patch(`/api/periods/${period.id}`)
        .set(bearer(coordinator))
        .send({ startsOn: '2060-10-20' })
        .expect(200);
      expect(await grades()).toEqual(before);
      // …and a date-based lookup would have lost it.
      const byDates = (
        await t
          .http()
          .get(`/api/students/${studentId}/grades?from=2060-10-20&to=2060-12-10`)
          .set(bearer(admin))
          .expect(200)
      ).body as StudentGradesDto;
      expect(byDates.subjects).toHaveLength(0);

      // Close the period: the report card is made from the stored period.
      await t.http().post(`/api/periods/${period.id}/close`).set(bearer(admin)).expect(200);
      const generated = await t
        .http()
        .post(`/api/periods/${period.id}/report-cards/generate`)
        .set(bearer(admin))
        .send({ classId })
        .expect(200);
      expect((generated.body as { count: number }).count).toBe(1);
      const cards = (
        await t
          .http()
          .get(`/api/periods/${period.id}/report-cards?classId=${classId}`)
          .set(bearer(admin))
          .expect(200)
      ).body as ReportCardDto[];
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ studentId, periodId: period.id, average: 15 });
      expect(cards[0]!.subjects[0]).toMatchObject({
        subjectId: 'mathematiques',
        coefficient: 5,
        gradeCount: 1,
      });
    });

    it('locks a closed period: no edit, no deletion, no grade change, no event change', async () => {
      const edit = await t
        .http()
        .patch(`/api/periods/${period.id}`)
        .set(bearer(coordinator))
        .send({ label: 'Retouché' })
        .expect(409);
      expect(message(edit.body)).toMatch(/clôturée/);
      await t.http().delete(`/api/periods/${period.id}`).set(bearer(admin)).expect(409);

      const grades = await t
        .http()
        .put(`/api/events/${exam.id}/grades`)
        .set(bearer(teacher))
        .send({ entries: [{ studentId, score: 9 }] })
        .expect(409);
      expect(message(grades.body)).toMatch(/clôturée/);
      await t
        .http()
        .post(`/api/events/${exam.id}/grades/publish`)
        .set(bearer(teacher))
        .send({ published: false })
        .expect(409);
      await t
        .http()
        .patch(`/api/events/${exam.id}`)
        .set(bearer(teacher))
        .send({ title: 'Changé' })
        .expect(409);
      await t.http().delete(`/api/events/${exam.id}`).set(bearer(teacher)).expect(409);

      // A new gradable event cannot join a closed period either.
      const examen = await activityTypeId(t.prisma, 'examen');
      await t
        .http()
        .post('/api/events')
        .set(bearer(teacher))
        .send({
          activityTypeId: examen,
          title: 'Tard',
          subjectId: 'mathematiques',
          classId,
          date: '2060-11-05',
        })
        .expect(409);
      expect(await t.prisma.grade.findFirstOrThrow({ where: { eventId: exam.id } })).toMatchObject({
        published: true,
      });
    });

    it('refuses to reopen once a report card is published', async () => {
      await t
        .http()
        .post(`/api/periods/${period.id}/report-cards/publish`)
        .set(bearer(admin))
        .send({})
        .expect(200);
      await t
        .http()
        .post(`/api/periods/${period.id}/close?closed=false`)
        .set(bearer(admin))
        .expect(409);
    });
  });
});
