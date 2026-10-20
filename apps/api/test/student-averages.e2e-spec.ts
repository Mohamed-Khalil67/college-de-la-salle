import { generalAverage, type SessionResponse, type StudentGradesDto } from '@cdls/shared';
import { inject } from 'vitest';
import { bearer, createTestApp, studentOf, type TestApp } from './helpers.js';

/** What a student needs to compute the report card's general average themselves. */
describe('Student session and averages (e2e)', () => {
  let t: TestApp;
  let student: Awaited<ReturnType<typeof studentOf>>;

  beforeAll(async () => {
    t = await createTestApp();
    student = await studentOf(t.prisma, 'bac', 'premiere');
  });

  afterAll(() => t.close());

  it("puts the student's class in the session (login, me, refresh)", async () => {
    const login = await t
      .http()
      .post('/api/auth/login')
      .send({ email: student.email, password: inject('password') })
      .expect(200);
    const session = login.body as SessionResponse;
    expect(session.user).toMatchObject({
      role: 'student',
      studentId: student.studentId,
      classId: student.classId,
      teacherId: null,
    });
    const me = await t.http().get('/api/auth/me').set(bearer(session.accessToken)).expect(200);
    expect(me.body).toMatchObject({ classId: student.classId });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const refreshed = await t.http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    expect((refreshed.body as SessionResponse).user.classId).toBe(student.classId);
  });

  it("gives each subject its class coefficient, so the general average matches the report card's", async () => {
    const token = await t.token(student.email);
    const res = await t
      .http()
      .get(`/api/students/${student.studentId}/grades`)
      .set(bearer(token))
      .expect(200);
    const grades = res.body as StudentGradesDto;
    expect(grades.subjects.length).toBeGreaterThan(0);

    const assignments = await t.prisma.teachingAssignment.findMany({
      where: { classId: student.classId },
    });
    for (const subject of grades.subjects) {
      const weights = assignments
        .filter((a) => a.subjectId === subject.subjectId)
        .map((a) => Number(a.coefficient));
      expect(subject.coefficient).toBe(weights.length ? Math.max(...weights) : null);
    }
    expect(generalAverage(grades.subjects)).not.toBeNull();
  });
});
