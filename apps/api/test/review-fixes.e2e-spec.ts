import type {
  ApiError,
  ClassSubjectDto,
  CreatedUserResponse,
  ImportUsersResponse,
  SectionChangeRequestDto,
} from '@cdls/shared';
import {
  ADMIN,
  bearer,
  COORDINATOR,
  createTestApp,
  DOMAIN,
  MATHS_TEACHER,
  studentOf,
  type TestApp,
} from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);
const json = (v: unknown) => JSON.stringify(v, (_, x: unknown) => (typeof x === 'bigint' ? Number(x) : x));
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

  /** A class of the current year, for accounts created by these tests; their enrolments are closed at the end. */
  let currentClassId: string;
  const closeEnrolments = async () => {
    await t.prisma.enrollment.updateMany({
      where: { classId: currentClassId, leftOn: null },
      data: { leftOn: new Date('2026-09-06T00:00:00Z') },
    });
  };
  beforeAll(async () => {
    const current = await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
    currentClassId = (
      await t.prisma.schoolClass.create({
        data: { schoolYearId: current.id, sectionId: bacId, code: 'fix-current', label: 'Fix' },
      })
    ).id;
  });

  afterAll(async () => {
    await closeEnrolments();
    await t.close();
  });

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
  describe('H2: audit trail of account changes', () => {
    const trail = (action: string, entityId?: string) =>
      t.prisma.auditLog.findMany({ where: { action, ...(entityId ? { entityId } : {}) } });

    it('records account creation, password reset, disable and restore without any secret', async () => {
      const res = await t
        .http()
        .post('/api/users')
        .set(bearer(admin))
        .send({ role: 'teacher', firstName: 'Audit', lastName: 'Trace' })
        .expect(201);
      const { user, temporaryPassword } = res.body as CreatedUserResponse;
      const created = await trail('user.create', user.id);
      expect(created).toHaveLength(1);
      expect(created[0]!.actorId).not.toBeNull();

      await t
        .http()
        .patch(`/api/users/${user.id}`)
        .set(bearer(admin))
        .send({ password: 'Un-Autre-Mot-2026' })
        .expect(200);
      await t.http().patch(`/api/users/${user.id}`).set(bearer(admin)).send({ status: 'disabled' }).expect(200);
      await t.http().patch(`/api/users/${user.id}`).set(bearer(admin)).send({ status: 'active' }).expect(200);
      expect(await trail('user.password_reset', user.id)).toHaveLength(1);
      const statuses = await trail('user.status', user.id);
      expect(statuses.map((r) => [r.before, r.after])).toEqual([
        [{ status: 'active' }, { status: 'disabled' }],
        [{ status: 'disabled' }, { status: 'active' }],
      ]);

      const all = json(await t.prisma.auditLog.findMany({ where: { entityId: user.id } }));
      expect(all).not.toContain(temporaryPassword);
      expect(all).not.toContain('Un-Autre-Mot-2026');
      expect(all).not.toMatch(/argon2/);
    });

    it('records an import as one row with a count, never the people or their passwords', async () => {
      const last = `Audit${Date.now().toString(36)}`;
      const file = Buffer.from(
        ['lastName,firstName', `${last},Alice`, `${last},Bob`].join('\n'),
      );
      const before = (await trail('user.import')).length;
      const res = await t
        .http()
        .post('/api/users/import?role=teacher')
        .set(bearer(admin))
        .attach('file', file, { filename: 'p.csv', contentType: 'text/csv' })
        .expect(201);
      const created = (res.body as ImportUsersResponse).created;
      const rows = await trail('user.import');
      expect(rows).toHaveLength(before + 1);
      const row = rows.at(-1)!;
      expect(row.after).toEqual({ role: 'teacher', created: 2, skipped: 0 });
      const text = json(row);
      for (const c of created) {
        expect(text).not.toContain(c.temporaryPassword);
        expect(text).not.toContain(c.email);
      }
      expect(text).not.toContain(last.toLowerCase());
    });

    it('records section-change requests and rejections', async () => {
      const { studentId } = await studentOf(t.prisma, 'bac', 'seconde');
      const request = (
        await t
          .http()
          .post('/api/section-changes')
          .set(bearer(admin))
          .send({ studentId, toSection: 'nationale', reason: 'Audit' })
          .expect(201)
      ).body as SectionChangeRequestDto;
      const created = await trail('section_change.create', request.id);
      expect(created).toHaveLength(1);
      expect(created[0]!.after).toMatchObject({ studentId, byStudent: false });
      await t
        .http()
        .post(`/api/section-changes/${request.id}/reject`)
        .set(bearer(admin))
        .send({ note: 'Non.' })
        .expect(200);
      expect(await trail('section_change.reject', request.id)).toHaveLength(1);
      // A second rejection changes nothing and leaves no second row.
      await t
        .http()
        .post(`/api/section-changes/${request.id}/reject`)
        .set(bearer(admin))
        .send({ note: 'Encore non.' })
        .expect(409);
      expect(await trail('section_change.reject', request.id)).toHaveLength(1);
    });
  });

  describe('section changes: who may call what', () => {
    it('keeps /mine to students and refuses a student who asks for someone else', async () => {
      const mine = await studentOf(t.prisma, 'bac', 'seconde');
      const student = await t.token(mine.email);
      const other = await studentOf(t.prisma, 'nationale', 'secondaire-1');
      await t
        .http()
        .post('/api/section-changes')
        .set(bearer(student))
        .send({ studentId: other.studentId, toSection: 'bac', reason: 'Pour un autre' })
        .expect(403);
      for (const token of [maths, admin, coordinator])
        await t.http().get('/api/section-changes/mine').set(bearer(token)).expect(403);
      await t.http().get('/api/section-changes/mine').set(bearer(student)).expect(200);
      await t.http().get('/api/section-changes').set(bearer(student)).expect(403);
      expect(
        await t.prisma.sectionChangeRequest.count({ where: { studentId: other.studentId } }),
      ).toBe(0);
    });
  });
  describe('M1: every-section and section periods cannot overlap, even outside the service', () => {
    it('is refused by the database itself, in both orders, and allows adjacent dates', async () => {
      const { year, n } = await isolatedYear(); // already holds T1 for every section, n-09-01 to n-12-20
      const insert = (sectionId: string | null, number: number, from: string, to: string) =>
        t.prisma.$executeRaw`
          INSERT INTO periods (id, school_year_id, kind, section_id, number, label, starts_on, ends_on)
          VALUES (gen_random_uuid(), ${year.id}::uuid, 'trimester', ${sectionId}::uuid, ${number},
                  'raw', ${from}::date, ${to}::date)`;
      // A section period inside the every-section one.
      await expect(insert(bacId, 2, `${n}-10-01`, `${n}-10-31`)).rejects.toThrow(
        /periods_no_overlap/,
      );
      // After it: fine; then an every-section period reaching into it is refused (the other order).
      await insert(bacId, 2, `${n}-12-21`, `${n + 1}-03-01`);
      await expect(insert(null, 3, `${n + 1}-02-01`, `${n + 1}-03-15`)).rejects.toThrow(
        /periods_no_overlap/,
      );
      // Moving a row into an overlap is refused too (UPDATE).
      await expect(
        t.prisma.$executeRaw`
          UPDATE periods SET starts_on = ${`${n}-12-01`}::date
          WHERE school_year_id = ${year.id}::uuid AND section_id = ${bacId}::uuid`,
      ).rejects.toThrow(/periods_no_overlap/);
      // The service answers 409 as before.
      await t
        .http()
        .post(`/api/school-years/${year.id}/periods`)
        .set(bearer(admin))
        .send({ number: 3, label: 'X', sectionId: null, startsOn: `${n + 1}-02-01`, endsOn: `${n + 1}-03-15` })
        .expect(409);
    });
  });
});
