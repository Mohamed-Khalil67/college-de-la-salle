import type { ApiError, ClassSubjectDto } from '@cdls/shared';
import {
  ADMIN,
  bearer,
  COORDINATOR,
  createTestApp,
  MATHS_TEACHER,
  type TestApp,
} from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Fixes from the independent review (H1, H2, M1…), each in its own isolated school year. */
describe('Review fixes (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let coordinator: string;
  let maths: string;
  let bacId: string;
  let yearSeq = 0;

  /** A throwaway school year with a class of the bac section and one period covering it. */
  async function isolatedYear() {
    const n = 2070 + yearSeq++ * 2;
    const year = await t.prisma.schoolYear.create({
      data: { label: `${n}-${n + 1}`, startsOn: day(`${n}-09-01`), endsOn: day(`${n + 1}-06-30`) },
    });
    const schoolClass = await t.prisma.schoolClass.create({
      data: { schoolYearId: year.id, sectionId: bacId, code: `fix-${n}`, label: `Fix ${n}` },
    });
    const period = await t.prisma.period.create({
      data: {
        schoolYearId: year.id,
        number: 1,
        label: 'T1',
        startsOn: day(`${n}-09-01`),
        endsOn: day(`${n}-12-20`),
      },
    });
    return { year, schoolClass, period, n };
  }

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    coordinator = await t.token(COORDINATOR);
    maths = await t.token(MATHS_TEACHER);
    bacId = (await t.prisma.section.findFirstOrThrow({ where: { code: 'bac' } })).id;
  });

  afterAll(() => t.close());

  describe('H1: coefficients freeze with the period', () => {
    it('refuses a coefficient change and a copy overwrite once a period is closed or has report cards', async () => {
      const { schoolClass, period } = await isolatedYear();
      const other = await t.prisma.schoolClass.create({
        data: {
          schoolYearId: schoolClass.schoolYearId,
          sectionId: bacId,
          code: 'fix-source',
          label: 'Source',
        },
      });
      const post = (classId: string, subjectId: string, coefficient: number) =>
        t
          .http()
          .post(`/api/classes/${classId}/subjects`)
          .set(bearer(admin))
          .send({ subjectId, coefficient })
          .expect(201);
      const target = (await post(schoolClass.id, 'mathematiques', 2)).body as ClassSubjectDto;
      await post(other.id, 'mathematiques', 5);
      const patch = (token: string, coefficient: number) =>
        t.http().patch(`/api/class-subjects/${target.id}`).set(bearer(token)).send({ coefficient });

      // Open period: the coordinator (who does not teach it) may edit.
      await patch(coordinator, 3).expect(200);

      // A coordinator teaching the subject in that class leaves the coefficient to an admin.
      const coordinatorTeacher = await t.prisma.teacher.findFirstOrThrow({
        where: { user: { email: { startsWith: 'ingy.samir@' } } },
      });
      await t.prisma.teachingAssignment.create({
        data: { teacherId: coordinatorTeacher.id, classSubjectId: target.id },
      });
      await patch(coordinator, 4).expect(403);
      await patch(admin, 4).expect(200);
      // The hours are not weights.
      await t
        .http()
        .patch(`/api/class-subjects/${target.id}`)
        .set(bearer(coordinator))
        .send({ hoursPerWeek: 3 })
        .expect(200);
      await t.prisma.teachingAssignment.deleteMany({ where: { classSubjectId: target.id } });

      // Report cards exist (period still open): frozen.
      const student = await t.prisma.student.findFirstOrThrow();
      const card = await t.prisma.reportCard.create({
        data: { studentId: student.id, periodId: period.id, classId: schoolClass.id },
      });
      const cards = await patch(coordinator, 6).expect(409);
      expect(message(cards.body)).toMatch(/coefficients ne peuvent plus changer/);
      await t.prisma.reportCard.delete({ where: { id: card.id } });
      await patch(coordinator, 6).expect(200);

      // Closed period: frozen, also for copy.
      await t.http().post(`/api/periods/${period.id}/close`).set(bearer(admin)).expect(200);
      const closed = await patch(admin, 7).expect(409);
      expect(message(closed.body)).toMatch(/clôturée/);
      await t
        .http()
        .post(`/api/classes/${schoolClass.id}/subjects/copy`)
        .set(bearer(coordinator))
        .send({ fromClassId: other.id })
        .expect(409);
      const unchanged = await t.prisma.classSubject.findUniqueOrThrow({ where: { id: target.id } });
      expect(Number(unchanged.coefficient)).toBe(6);
      // Same coefficient: nothing to protect, so a no-op edit still passes.
      await patch(admin, 6).expect(200);
    });
  });
});
