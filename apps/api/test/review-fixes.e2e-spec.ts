import type {
  ApiError,
  ClassSubjectDto,
  CreatedUserResponse,
  ImportPreviewResponse,
  ImportUsersResponse,
  SessionResponse,
  SectionChangeRequestDto,
} from '@cdls/shared';
import type { AuthUser } from '../src/common/auth-user.js';
import { UsersService } from '../src/users/users.service.js';
import { ActivityTypesService } from '../src/activity-types/activity-types.service.js';
import {
  activityTypeId,
  ADMIN,
  bearer,
  COORDINATOR,
  createTestApp,
  DOMAIN,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  seededEvent,
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
  let natClassId: string | undefined;
  const closeEnrolments = async () => {
    await t.prisma.enrollment.updateMany({
      where: { classId: { in: [currentClassId, ...(natClassId ? [natClassId] : [])] }, leftOn: null },
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
  describe('M2: sign-in limits per account, temporary passwords expire', () => {
    const create = async (firstName: string) =>
      (
        await t
          .http()
          .post('/api/users')
          .set(bearer(admin))
          .send({ role: 'teacher', firstName, lastName: `Expire${Date.now().toString(36)}` })
          .expect(201)
      ).body as CreatedUserResponse;
    const login = (email: string, password: string) =>
      t.http().post('/api/auth/login').send({ email, password });

    it('counts sign-in attempts by address and e-mail: one account locks, the others still sign in', async () => {
      const before = process.env['LOGIN_THROTTLE_LIMIT'];
      process.env['LOGIN_THROTTLE_LIMIT'] = '3';
      try {
        const a = await create('Limite');
        const b = await create('Limite');
        for (let i = 0; i < 3; i++) await login(a.user.email, 'faux').expect(401);
        await login(a.user.email, 'faux').expect(429);
        // A classmate behind the same address is not locked out.
        await login(b.user.email, b.temporaryPassword).expect(200);
      } finally {
        if (before === undefined) delete process.env['LOGIN_THROTTLE_LIMIT'];
        else process.env['LOGIN_THROTTLE_LIMIT'] = before;
      }
    });

    it('refuses an expired temporary password with a clear message, and a reset restarts the clock', async () => {
      const created = await create('Perime');
      const days = (row: { temporaryPasswordExpiresAt: Date | null }) =>
        Math.round((row.temporaryPasswordExpiresAt!.getTime() - Date.now()) / 86_400_000);
      expect(days(await t.prisma.user.findUniqueOrThrow({ where: { id: created.user.id } }))).toBe(14);

      await t.prisma.user.update({
        where: { id: created.user.id },
        data: { temporaryPasswordExpiresAt: new Date(Date.now() - 1000) },
      });
      const wrong = await login(created.user.email, 'faux').expect(401);
      expect(message(wrong.body)).toMatch(/incorrect/);
      const expired = await login(created.user.email, created.temporaryPassword).expect(401);
      expect(message(expired.body)).toMatch(/expiré.*secrétariat/);

      await t
        .http()
        .patch(`/api/users/${created.user.id}`)
        .set(bearer(admin))
        .send({ password: 'Nouveau-Provisoire-1' })
        .expect(200);
      expect(days(await t.prisma.user.findUniqueOrThrow({ where: { id: created.user.id } }))).toBe(14);
      await login(created.user.email, 'Nouveau-Provisoire-1').expect(200);
    });

    it('clears the expiry once the person has chosen a password', async () => {
      const created = await create('Choisi');
      const session = (await login(created.user.email, created.temporaryPassword).expect(200))
        .body as SessionResponse;
      await t
        .http()
        .post('/api/auth/password')
        .set(bearer(session.accessToken))
        .send({ currentPassword: created.temporaryPassword, newPassword: 'Mon-Mot-De-Passe-2026' })
        .expect(200);
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: created.user.id } });
      expect(row).toMatchObject({ mustChangePassword: false, temporaryPasswordExpiresAt: null });
    });
  });

  describe('disable and restore', () => {
    it('refuses an access token issued before the account was disabled, even after it is restored', async () => {
      const created = (
        await t
          .http()
          .post('/api/users')
          .set(bearer(admin))
          .send({ role: 'teacher', firstName: 'Reactive', lastName: `Jeton${Date.now().toString(36)}` })
          .expect(201)
      ).body as CreatedUserResponse;
      const old = (
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: created.user.email, password: created.temporaryPassword })
          .expect(200)
      ).body as SessionResponse;
      await t.http().get('/api/auth/me').set(bearer(old.accessToken)).expect(200);
      const set = (status: 'disabled' | 'active') =>
        t.http().patch(`/api/users/${created.user.id}`).set(bearer(admin)).send({ status }).expect(200);
      await set('disabled');
      await t.http().get('/api/auth/me').set(bearer(old.accessToken)).expect(401);
      await set('active');
      await t.http().get('/api/auth/me').set(bearer(old.accessToken)).expect(401);
      // A fresh sign-in works.
      const fresh = (
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: created.user.email, password: created.temporaryPassword })
          .expect(200)
      ).body as SessionResponse;
      await t.http().get('/api/auth/me').set(bearer(fresh.accessToken)).expect(200);
    });
  });
  describe('M3 and M4: re-imports, homonyms, CSV errors', () => {
    const upload = (role: 'teacher' | 'student', lines: string[], query = '', preview = false) =>
      t
        .http()
        .post(`/api/users/import${preview ? '/preview' : ''}?role=${role}${query}`)
        .set(bearer(admin))
        .attach('file', Buffer.from(lines.join('\n')), { filename: 'f.csv', contentType: 'text/csv' });
    const unique = () => Date.now().toString(36);

    it('skips a teacher already present, and creates a genuine homonym only on request', async () => {
      const last = `Reimport${unique()}`;
      const file = ['lastName,firstName', `${last},Yasmine`];
      const first = await upload('teacher', file).expect(201);
      expect((first.body as ImportUsersResponse).created).toHaveLength(1);

      const preview = (await upload('teacher', file, '', true).expect(200)).body as ImportPreviewResponse;
      expect(preview.rows[0]).toMatchObject({
        alreadyImported: true,
        matchedBy: 'name',
        createAnyway: false,
        emailNumber: 0,
      });
      expect(((await upload('teacher', file).expect(201)).body as ImportUsersResponse).created).toEqual([]);
      expect(await t.prisma.user.count({ where: { lastName: last } })).toBe(1);

      // Accents, case and spacing do not make a new person.
      await upload('teacher', ['lastName,firstName', `${last.toUpperCase()},YASMINE`])
        .expect(201)
        .expect((r) => expect((r.body as ImportUsersResponse).created).toEqual([]));

      // The explicit choice for line 2 creates the homonym, numbered.
      const forced = (await upload('teacher', file, '&createAnyway=2').expect(201)).body as ImportUsersResponse;
      expect(forced.created.map((c) => c.email)).toEqual([`yasmine.${last.toLowerCase()}2@${DOMAIN}`]);
      expect(await t.prisma.user.count({ where: { lastName: last } })).toBe(2);
      await upload('teacher', file, '&createAnyway=x').expect(400);
    });

    it('treats students without a number as present only in the same section and class', async () => {
      const last = `Eleve${unique()}`;
      const head = 'lastName,firstName,section,class';
      const here = [head, `${last},Karim,bac,fix-current`];
      expect(((await upload('student', here).expect(201)).body as ImportUsersResponse).created).toHaveLength(1);
      expect(((await upload('student', here).expect(201)).body as ImportUsersResponse).created).toEqual([]);
      const elsewhere = [head, `${last},Karim,bac,seconde`];
      const other = (await upload('student', elsewhere, '', true).expect(200)).body as ImportPreviewResponse;
      expect(other.rows[0]).toMatchObject({ alreadyImported: false, matchedBy: null, emailNumber: 2 });
    });

    it('answers a generic French message for a malformed CSV and counts real lines', async () => {
      const bad = await upload('teacher', ['lastName,firstName', '"unclosed,Alice']).expect(400);
      expect(message(bad.body)).toMatch(/illisible/);
      expect(message(bad.body)).not.toMatch(/quote|record|csv_/i);

      // A quoted cell over lines 2-3 and a blank line: the bad row is on line 5.
      const res = await upload('teacher', [
        'lastName,firstName',
        '"Multi',
        `line",Alice${unique()}`,
        '',
        ',Bob',
      ]).expect(400);
      expect((res.body as { errors: { line: number }[] }).errors.map((e) => e.line)).toEqual([5]);
    });

    it('reads only the addresses of the names concerned, not every account', async () => {
      const spy = vi.spyOn(t.prisma.user, 'findMany');
      try {
        await upload('teacher', ['lastName,firstName', `Lecture${unique()},Zied`], '', true).expect(200);
        const wheres = spy.mock.calls.map((c) => JSON.stringify(c[0]?.where ?? {}));
        expect(wheres.length).toBeGreaterThan(0);
        for (const w of wheres) expect(w).toMatch(/startsWith|insensitive/);
      } finally {
        spy.mockRestore();
      }
    });

    it('gives distinct addresses to a parallel import and POST /users for the same name', async () => {
      const last = `Parallele${unique()}`;
      const users = t.app.get(UsersService);
      const adminUser = await t.prisma.user.findFirstOrThrow({ where: { email: ADMIN } });
      const actor = { id: adminUser.id, role: 'admin' } as AuthUser;
      const [created, imported] = await Promise.all([
        t.http().post('/api/users').set(bearer(admin)).send({ role: 'teacher', firstName: 'Nabil', lastName: last }),
        // Through the service: the import route's own limit (10 a minute) is spent by the tests above.
        users.importCsv(Buffer.from(`lastName,firstName
${last},Nabil`), 'teacher', actor),
      ]);
      expect(created.status).toBe(201);
      const emails = [
        (created.body as CreatedUserResponse).user.email,
        ...imported.created.map((c) => c.email),
      ];
      expect(new Set(emails).size).toBe(emails.length);
      expect(await t.prisma.user.count({ where: { lastName: last } })).toBe(emails.length);
    });
  });
  describe('LOW: one-day periods', () => {
    it('accepts a period whose end is its start, like the database, and refuses an end before it', async () => {
      const { year, n } = await isolatedYear();
      const body = { number: 2, label: 'Examen', startsOn: `${n + 1}-01-10`, endsOn: `${n + 1}-01-10` };
      const res = await t
        .http()
        .post(`/api/school-years/${year.id}/periods`)
        .set(bearer(admin))
        .send({ ...body, kind: 'semester' })
        .expect(201);
      const id = (res.body as { id: string }).id;
      await t
        .http()
        .patch(`/api/periods/${id}`)
        .set(bearer(admin))
        .send({ startsOn: `${n + 1}-01-11` })
        .expect(400);
      await t
        .http()
        .patch(`/api/periods/${id}`)
        .set(bearer(admin))
        .send({ startsOn: `${n + 1}-01-09`, endsOn: `${n + 1}-01-09` })
        .expect(200);
    });
  });
  /** A class with maths, its teacher, one gradable event in an open period and one enrolled student. */
  async function gradingSetup() {
    const base = await isolatedYear();
    const teacher = await t.prisma.teacher.findFirstOrThrow({
      where: { user: { email: { startsWith: 'hany.mansour@' } } },
    });
    const classSubject = await t.prisma.classSubject.create({
      data: { classId: base.schoolClass.id, subjectId: 'mathematiques', coefficient: 2 },
    });
    await t.prisma.teachingAssignment.create({
      data: { teacherId: teacher.id, classSubjectId: classSubject.id },
    });
    const event = await t.prisma.event.create({
      data: {
        activityTypeId: await activityTypeId(t.prisma, 'examen'),
        title: 'Examen',
        subjectId: 'mathematiques',
        classId: base.schoolClass.id,
        date: day(`${base.n}-10-05`),
        periodId: base.period.id,
        authorId: teacher.id,
      },
    });
    const student = await studentOf(t.prisma, 'bac', 'seconde');
    await t.prisma.enrollment.create({
      data: {
        studentId: student.studentId,
        classId: base.schoolClass.id,
        schoolYearId: base.year.id,
      },
    });
    return { ...base, teacher, event, studentId: student.studentId };
  }

  describe('activity type flags and event creation', () => {
    it('the flags stay locked while an event using the type is being written', async () => {
      const type = (
        await t
          .http()
          .post('/api/activity-types')
          .set(bearer(maths))
          .send({
            label: `Course${Date.now().toString(36)}`,
            colour: 'brick',
            icon: 'edit',
            gradable: false,
            repeatable: false,
            homework: false,
          })
          .expect(201)
      ).body as { id: string };
      const teacher = await t.prisma.teacher.findFirstOrThrow({
        where: { user: { email: { startsWith: 'hany.mansour@' } } },
      });
      const service = t.app.get(ActivityTypesService);
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));
      let release!: () => void;
      const hold = new Promise<void>((resolve) => (release = resolve));
      // An event creation in flight: shared lock on the type, the event inserted, not yet committed.
      const creating = t.prisma.$transaction(
        async (tx) => {
          await service.lockForEvent(tx, type.id);
          await tx.event.create({
            data: {
              activityTypeId: type.id,
              title: 'En vol',
              date: day('2071-01-05'),
              authorId: teacher.id,
            },
          });
          locked();
          await hold;
        },
        { timeout: 20_000 },
      );
      await lockTaken;
      let answered: number | null = null;
      const patching = t
        .http()
        .patch(`/api/activity-types/${type.id}`)
        .set(bearer(maths))
        .send({ gradable: true })
        .then((res) => (answered = res.status));
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(answered).toBeNull(); // waiting for the creation, not deciding on a stale count
      release();
      await creating;
      await patching;
      expect(answered).toBe(409);
      const after = await t.prisma.activityType.findUniqueOrThrow({ where: { id: type.id } });
      expect(after.gradable).toBe(false);
    });
  });

  describe('events: who may write what', () => {
    it("refuses a teacher who doesn't teach the class, and a graded event for a subject outside the class", async () => {
      const french = await t.token(FRENCH_TEACHER);
      const nationale = await studentOf(t.prisma, 'nationale', 'secondaire-1');
      const cours = await activityTypeId(t.prisma, 'cours');
      await t
        .http()
        .post('/api/events')
        .set(bearer(french))
        .send({
          activityTypeId: cours,
          title: 'Pas le leur',
          classId: nationale.classId,
          date: '2026-11-03',
        })
        .expect(403);
      const mathsExam = await seededEvent(t.prisma, nationale.classId, 'examen', 'mathematiques');
      await t
        .http()
        .patch(`/api/events/${mathsExam.id}`)
        .set(bearer(french))
        .send({ title: 'Détourné' })
        .expect(403);
      const unchanged = await t.prisma.event.findUniqueOrThrow({ where: { id: mathsExam.id } });
      expect(unchanged.title).toBe(mathsExam.title);

      // A graded event for a subject the class does not have (and the teacher does not teach there).
      const bac = await studentOf(t.prisma, 'bac', 'seconde');
      const examen = await activityTypeId(t.prisma, 'examen');
      const before = await t.prisma.event.count();
      const res = await t
        .http()
        .post('/api/events')
        .set(bearer(maths))
        .send({
          activityTypeId: examen,
          title: 'Hors matière',
          subjectId: 'arabe',
          classId: bac.classId,
          date: '2026-11-04',
        });
      expect([400, 403]).toContain(res.status);
      expect(await t.prisma.event.count()).toBe(before);
    });
  });

  describe('section changes: concurrent approvals', () => {
    it('lets exactly one of two parallel approvals win and opens exactly one enrolment', async () => {
      const current = await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
      const nationaleId = (await t.prisma.section.findFirstOrThrow({ where: { code: 'nationale' } }))
        .id;
      const target = await t.prisma.schoolClass.create({
        data: { schoolYearId: current.id, sectionId: nationaleId, code: 'fix-nat', label: 'Fix nat' },
      });
      natClassId = target.id;
      const student = (
        await t
          .http()
          .post('/api/users')
          .set(bearer(admin))
          .send({
            role: 'student',
            firstName: 'Course',
            lastName: `Approbation${Date.now().toString(36)}`,
            classId: currentClassId,
          })
          .expect(201)
      ).body as CreatedUserResponse;
      const request = (
        await t
          .http()
          .post('/api/section-changes')
          .set(bearer(admin))
          .send({ studentId: student.user.studentId, toSection: 'nationale', reason: 'Parallèle' })
          .expect(201)
      ).body as SectionChangeRequestDto;
      const approve = () =>
        t
          .http()
          .post(`/api/section-changes/${request.id}/approve`)
          .set(bearer(admin))
          .send({ classId: target.id });
      const results = await Promise.all([approve(), approve()]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const studentId = student.user.studentId!;
      const open = await t.prisma.enrollment.findMany({
        where: { studentId, schoolYearId: current.id, leftOn: null },
      });
      expect(open.map((e) => e.classId)).toEqual([target.id]);
      expect(await t.prisma.enrollment.count({ where: { studentId, classId: target.id } })).toBe(1);
      expect(
        await t.prisma.auditLog.count({
          where: { action: 'student.section_change', entityId: studentId },
        }),
      ).toBe(1);
    });
  });

  describe('grades and closing a period at the same moment', () => {
    it('never saves a grade into a period that closed first, and never loses one it accepted', async () => {
      for (let round = 0; round < 6; round++) {
        const setup = await gradingSetup();
        const put = () =>
          t
            .http()
            .put(`/api/events/${setup.event.id}/grades`)
            .set(bearer(maths))
            .send({ entries: [{ studentId: setup.studentId, score: 12 }] });
        const close = () =>
          t.http().post(`/api/periods/${setup.period.id}/close`).set(bearer(admin));
        const [saved, closed] = await Promise.all([put(), close()]);
        expect(closed.status).toBe(200);
        const grades = await t.prisma.grade.count({ where: { eventId: setup.event.id } });
        if (saved.status === 200) expect(grades).toBe(1);
        else {
          expect(saved.status).toBe(409);
          expect(grades).toBe(0);
        }
        // Once closed, the period stays locked.
        await put().expect(409);
        expect(await t.prisma.grade.count({ where: { eventId: setup.event.id } })).toBe(grades);
      }
    });
  });
});
