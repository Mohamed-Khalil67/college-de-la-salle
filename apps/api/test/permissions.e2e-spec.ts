import type { OccurrenceDto, StudentGradesDto } from '@cdls/shared';
import {
  ADMIN,
  bearer,
  createTestApp,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  seededEvent,
  studentOf,
  type TestApp,
} from './helpers.js';

/** The firestore.rules guarantees, enforced by the API. */
describe('Permissions (e2e)', () => {
  let t: TestApp;
  let bacStudent: Awaited<ReturnType<typeof studentOf>>;
  let nationaleStudent: Awaited<ReturnType<typeof studentOf>>;

  beforeAll(async () => {
    t = await createTestApp();
    bacStudent = await studentOf(t.prisma, 'bac', 'premiere');
    nationaleStudent = await studentOf(t.prisma, 'nationale', 'secondaire-1');
  });

  afterAll(() => t.close());

  describe('a student', () => {
    it("gets 403 on another student's grades", async () => {
      const token = await t.token(bacStudent.email);
      await t
        .http()
        .get(`/api/students/${nationaleStudent.studentId}/grades`)
        .set(bearer(token))
        .expect(403);
      await t
        .http()
        .get(`/api/students/${nationaleStudent.studentId}/attendance`)
        .set(bearer(token))
        .expect(403);
      await t
        .http()
        .get(`/api/students/${nationaleStudent.studentId}/report-cards`)
        .set(bearer(token))
        .expect(403);
    });

    it('sees only their own published grades', async () => {
      const token = await t.token(bacStudent.email);
      const res = await t
        .http()
        .get(`/api/students/${bacStudent.studentId}/grades`)
        .set(bearer(token))
        .expect(200);
      const grades = (res.body as StudentGradesDto).subjects.flatMap((s) => s.grades);
      expect(grades.length).toBeGreaterThan(0);
      expect(
        grades.every((g) => g.grade.published && g.grade.studentId === bacStudent.studentId),
      ).toBe(true);
      // The seeded contrôle is still a draft: it must not show.
      expect(grades.some((g) => g.event.kind === 'controle')).toBe(false);
    });

    it('only sees the events of their class, their section and the whole school', async () => {
      const token = await t.token(bacStudent.email);
      const res = await t
        .http()
        .get('/api/events/occurrences?from=2026-09-01&to=2026-12-31')
        .set(bearer(token))
        .expect(200);
      const events = (res.body as OccurrenceDto[]).map((o) => o.event);
      const bac = await t.prisma.section.findUniqueOrThrow({ where: { code: 'bac' } });
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect([null, bacStudent.classId]).toContain(e.classId);
        expect([null, bac.id]).toContain(e.sectionId);
      }
      const other = await seededEvent(t.prisma, nationaleStudent.classId, 'examen');
      await t.http().get(`/api/events/${other.id}`).set(bearer(token)).expect(404);
    });

    it('cannot use staff routes', async () => {
      const token = await t.token(bacStudent.email);
      await t.http().get('/api/users').set(bearer(token)).expect(403);
      const exam = await seededEvent(t.prisma, bacStudent.classId, 'examen');
      await t.http().get(`/api/events/${exam.id}/grades`).set(bearer(token)).expect(403);
      await t
        .http()
        .post('/api/events')
        .set(bearer(token))
        .send({ kind: 'cours', title: 'x', date: '2026-11-01' })
        .expect(403);
    });
  });

  describe('a teacher', () => {
    it("can't grade a class they don't teach", async () => {
      const token = await t.token(FRENCH_TEACHER);
      const exam = await seededEvent(t.prisma, nationaleStudent.classId, 'examen');
      await t.http().get(`/api/events/${exam.id}/grades`).set(bearer(token)).expect(403);
      await t
        .http()
        .put(`/api/events/${exam.id}/grades`)
        .set(bearer(token))
        .send({ entries: [{ studentId: nationaleStudent.studentId, score: 20 }] })
        .expect(403);
      await t
        .http()
        .post(`/api/events/${exam.id}/grades/publish`)
        .set(bearer(token))
        .send({ published: false })
        .expect(403);
    });

    it("can't grade a subject they don't teach, even in a class they teach", async () => {
      const token = await t.token(FRENCH_TEACHER);
      const mathsExam = await seededEvent(t.prisma, bacStudent.classId, 'examen', 'mathematiques');
      await t
        .http()
        .put(`/api/events/${mathsExam.id}/grades`)
        .set(bearer(token))
        .send({ entries: [{ studentId: bacStudent.studentId, score: 1 }] })
        .expect(403);
    });

    it('grades their own class and subject', async () => {
      const token = await t.token(MATHS_TEACHER);
      const exam = await seededEvent(t.prisma, nationaleStudent.classId, 'examen', 'mathematiques');
      const res = await t
        .http()
        .get(`/api/events/${exam.id}/grades`)
        .set(bearer(token))
        .expect(200);
      expect((res.body as { rows: unknown[] }).rows).toHaveLength(10);
    });

    it("can't read a student they don't teach, or take attendance in another class", async () => {
      const token = await t.token(FRENCH_TEACHER);
      await t
        .http()
        .get(`/api/students/${nationaleStudent.studentId}/grades`)
        .set(bearer(token))
        .expect(403);
      const course = await seededEvent(
        t.prisma,
        nationaleStudent.classId,
        'cours',
        'mathematiques',
      );
      await t
        .http()
        .put(`/api/events/${course.id}/attendance`)
        .set(bearer(token))
        .send({
          date: '2026-10-18',
          records: [{ studentId: nationaleStudent.studentId, status: 'absent' }],
        })
        .expect(403);
    });

    it("can't create events for another class or edit another teacher's event", async () => {
      const token = await t.token(FRENCH_TEACHER);
      await t
        .http()
        .post('/api/events')
        .set(bearer(token))
        .send({
          kind: 'examen',
          title: 'Intrus',
          classId: nationaleStudent.classId,
          date: '2026-11-10',
        })
        .expect(403);
      const mathsExam = await seededEvent(t.prisma, bacStudent.classId, 'examen', 'mathematiques');
      await t
        .http()
        .patch(`/api/events/${mathsExam.id}`)
        .set(bearer(token))
        .send({ title: 'Changé' })
        .expect(403);
    });

    it('cannot manage users', async () => {
      const token = await t.token(MATHS_TEACHER);
      await t
        .http()
        .post('/api/users')
        .set(bearer(token))
        .send({ email: 'x@demo.cdls.test', role: 'admin', firstName: 'X', lastName: 'Y' })
        .expect(403);
    });
  });

  describe('an admin', () => {
    it('reads any student and any grade sheet', async () => {
      const token = await t.token(ADMIN);
      await t
        .http()
        .get(`/api/students/${nationaleStudent.studentId}/grades`)
        .set(bearer(token))
        .expect(200);
      const exam = await seededEvent(t.prisma, bacStudent.classId, 'examen');
      await t.http().get(`/api/events/${exam.id}/grades`).set(bearer(token)).expect(200);
    });
  });
});
