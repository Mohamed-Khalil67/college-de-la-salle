import type {
  ArchiveStudentsResponse,
  ClassDto,
  CreatedUserResponse,
  ImportPreviewResponse,
  ImportUsersResponse,
  Paginated,
  SectionChangeRequestDto,
  SessionResponse,
} from '@cdls/shared';
import { ADMIN, bearer, createTestApp, DOMAIN, MATHS_TEACHER, type TestApp } from './helpers.js';

const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const header = res.headers['set-cookie'] as string[] | undefined;
  return header?.find((c) => c.startsWith('cdls_refresh='))?.split(';')[0] ?? '';
};

const csv = (lines: string[]) => Buffer.from(lines.join('\n'));

/** Phase 4: generated e-mails, first sign-in, section changes, graduation. */
describe('Accounts (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let classes: ClassDto[];
  let gradeId: string | undefined;
  const classOf = (section: string, code: string) =>
    classes.find((c) => c.sectionCode === section && c.code === code)!;

  /** Creates a student through the API and returns the e-mail and temporary password. */
  async function newStudent(firstName: string, lastName: string, section: string, code: string) {
    const res = await t
      .http()
      .post('/api/users')
      .set(bearer(admin))
      .send({ role: 'student', firstName, lastName, classId: classOf(section, code).id })
      .expect(201);
    return res.body as CreatedUserResponse;
  }

  /** Signs in with the temporary password and chooses `password`; returns the new session. */
  async function firstSignIn(created: CreatedUserResponse, password: string) {
    const login = await t
      .http()
      .post('/api/auth/login')
      .send({ email: created.user.email, password: created.temporaryPassword })
      .expect(200);
    const res = await t
      .http()
      .post('/api/auth/password')
      .set(bearer((login.body as SessionResponse).accessToken))
      .set('Cookie', cookieOf(login))
      .send({ currentPassword: created.temporaryPassword, newPassword: password })
      .expect(200);
    return res.body as SessionResponse;
  }

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    classes = (await t.http().get('/api/classes').set(bearer(admin)).expect(200)).body as ClassDto[];
    // Classes of their own, so the seeded rosters stay as the other specs expect them.
    const model = { nationale: classOf('nationale', 'secondaire-1'), bac: classOf('bac', 'seconde') };
    for (const [section, code] of [
      ['nationale', 'e2e-nat-a'],
      ['nationale', 'e2e-nat-b'],
      ['bac', 'e2e-bac-a'],
    ] as const) {
      const res = await t
        .http()
        .post('/api/classes')
        .set(bearer(admin))
        .send({ schoolYearId: model[section].schoolYearId, sectionId: model[section].sectionId, code, label: code })
        .expect(201);
      classes.push(res.body as ClassDto);
    }
  });

  // Leave the shared database as the other specs expect it: no student left in the e2e classes (report
  // cards are generated for every class of the year) and no extra grade on a seeded exam.
  afterAll(async () => {
    const ids = classes.filter((c) => c.code.startsWith('e2e-') || c.code === 'archive-test').map((c) => c.id);
    await t.prisma.enrollment.updateMany({
      where: { classId: { in: ids }, leftOn: null },
      data: { leftOn: new Date('2026-09-06T00:00:00Z') },
    });
    if (gradeId) await t.prisma.grade.delete({ where: { id: gradeId } });
    await t.close();
  });

  describe('one-by-one creation', () => {
    it('generates prenom.nom@domain, numbered on collision, and sets the section', async () => {
      const first = await newStudent('Zoé', "D'Arcy Lefèvre", 'bac', 'e2e-bac-a');
      expect(first.user).toMatchObject({
        email: `zoe.d-arcy-lefevre@${DOMAIN}`,
        status: 'active',
        mustChangePassword: true,
        sectionCode: 'bac',
      });
      expect(first.temporaryPassword).toMatch(/^[\w-]{16}$/);
      const second = await newStudent('Zoe', "d'Arcy-Lefevre", 'bac', 'e2e-bac-a');
      expect(second.user.email).toBe(`zoe.d-arcy-lefevre2@${DOMAIN}`);
    });

    it('keeps an e-mail typed by the admin', async () => {
      const res = await t
        .http()
        .post('/api/users')
        .set(bearer(admin))
        .send({ role: 'teacher', firstName: 'Paul', lastName: 'Martin', email: 'P.Martin@Example.org' })
        .expect(201);
      expect((res.body as CreatedUserResponse).user.email).toBe('p.martin@example.org');
    });
  });

  describe('first sign-in', () => {
    it('blocks every route but /auth/me, /auth/logout and POST /auth/password', async () => {
      const created = await newStudent('Premier', 'Acces', 'nationale', 'e2e-nat-a');
      const login = await t
        .http()
        .post('/api/auth/login')
        .send({ email: created.user.email, password: created.temporaryPassword })
        .expect(200);
      const session = login.body as SessionResponse;
      expect(session.user).toMatchObject({
        mustChangePassword: true,
        sectionCode: 'nationale',
        classLabel: classOf('nationale', 'e2e-nat-a').label,
      });
      const token = session.accessToken;

      const blocked = await t
        .http()
        .get(`/api/students/${created.user.studentId}/grades`)
        .set(bearer(token))
        .expect(403);
      expect(blocked.body).toMatchObject({ error: 'PASSWORD_CHANGE_REQUIRED' });
      await t.http().get('/api/events/occurrences?from=2026-09-01&to=2026-09-30').set(bearer(token)).expect(403);
      await t.http().get('/api/section-changes/mine').set(bearer(token)).expect(403);
      await t.http().get('/api/auth/me').set(bearer(token)).expect(200);

      // The rules: current password, at least 10 characters, not the e-mail.
      const change = (body: object) =>
        t.http().post('/api/auth/password').set(bearer(token)).send(body);
      await change({ currentPassword: 'wrong-password', newPassword: 'Cedre-du-Liban-26' }).expect(400);
      await change({ currentPassword: created.temporaryPassword, newPassword: 'court' }).expect(400);
      await change({ currentPassword: created.temporaryPassword, newPassword: created.user.email }).expect(400);

      const changed = await change({
        currentPassword: created.temporaryPassword,
        newPassword: 'Cedre-du-Liban-26',
      })
        .set('Cookie', cookieOf(login))
        .expect(200);
      const fresh = changed.body as SessionResponse;
      expect(fresh.user.mustChangePassword).toBe(false);
      expect(cookieOf(changed)).not.toBe('');

      // The other sessions are over: the old refresh cookie and (from the next second) the old token.
      await t.http().post('/api/auth/refresh').set('Cookie', cookieOf(login)).expect(401);
      await t
        .http()
        .get(`/api/students/${created.user.studentId}/grades`)
        .set(bearer(fresh.accessToken))
        .expect(200);
      await t.http().post('/api/auth/refresh').set('Cookie', cookieOf(changed)).expect(200);
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: created.user.email, password: 'Cedre-du-Liban-26' })
        .expect(200);
      await t.http().post('/api/auth/logout').set('Cookie', cookieOf(changed)).expect(204);
    });

    it('applies to teachers and admins too, and again after an admin reset', async () => {
      const res = await t
        .http()
        .post('/api/users')
        .set(bearer(admin))
        .send({ role: 'admin', firstName: 'Secrétariat', lastName: 'Bac' })
        .expect(201);
      const created = res.body as CreatedUserResponse;
      const fresh = await firstSignIn(created, 'Secretariat-2026');
      await t.http().get('/api/users').set(bearer(fresh.accessToken)).expect(200);

      await t
        .http()
        .patch(`/api/users/${created.user.id}`)
        .set(bearer(admin))
        .send({ password: 'Temporaire-42xyz' })
        .expect(200);
      // The reset signs the user out at once…
      await t.http().get('/api/users').set(bearer(fresh.accessToken)).expect(401);
      const again = await t
        .http()
        .post('/api/auth/login')
        .send({ email: created.user.email, password: 'Temporaire-42xyz' })
        .expect(200);
      // …and the next sign-in must choose a password again.
      expect((again.body as SessionResponse).user.mustChangePassword).toBe(true);
      await t
        .http()
        .get('/api/users')
        .set(bearer((again.body as SessionResponse).accessToken))
        .expect(403);
    });
  });

  describe('roster import', () => {
    const header = 'lastName,firstName,section,class,studentNumber,birthDate';

    it('previews the generated e-mails and creates nothing when a line is invalid', async () => {
      const file = csv([
        header,
        "D'Arcy Lefèvre,Zoé,bac,e2e-bac-a,R-1,2010-03-15",
        'Gerges,Mina,nationale,inconnue,,',
        'El Sayed,Mariam,nationale,e2e-nat-b,,15/03/2009',
      ]);
      const preview = await t
        .http()
        .post('/api/users/import/preview?role=student')
        .set(bearer(admin))
        .attach('file', file, { filename: 'eleves.csv', contentType: 'text/csv' })
        .expect(200);
      const body = preview.body as ImportPreviewResponse;
      expect(body.errors).toEqual([expect.objectContaining({ line: 3 })]);
      // Two Zoé d'Arcy-Lefèvre were created above: this one is the third.
      expect(body.rows.map((r) => r.email)).toEqual([
        `zoe.d-arcy-lefevre3@${DOMAIN}`,
        `mariam.el-sayed@${DOMAIN}`,
      ]);
      expect(body.rows[1]).toMatchObject({ birthDate: '2009-03-15', sectionCode: 'nationale' });

      const before = await t.prisma.user.count();
      const refused = await t
        .http()
        .post('/api/users/import?role=student')
        .set(bearer(admin))
        .attach('file', file, { filename: 'eleves.csv', contentType: 'text/csv' })
        .expect(400);
      expect((refused.body as { errors: { line: number }[] }).errors).toEqual([
        expect.objectContaining({ line: 3 }),
      ]);
      expect(await t.prisma.user.count()).toBe(before);
    });

    it('imports students (semicolons, French headings) and teachers', async () => {
      const students = csv(['Nom;Prénom;Section;Classe;Matricule;Date de naissance', 'Naguib;Farida;bac;e2e-bac-a;R-2;']);
      const created = await t
        .http()
        .post('/api/users/import?role=student')
        .set(bearer(admin))
        .attach('file', students, { filename: 'eleves.csv', contentType: 'text/csv' })
        .expect(201);
      const [account] = (created.body as ImportUsersResponse).created;
      expect(account).toMatchObject({ email: `farida.naguib@${DOMAIN}`, role: 'student' });
      const user = await t.prisma.user.findUniqueOrThrow({
        where: { email: `farida.naguib@${DOMAIN}` },
        include: { student: { include: { section: true, enrollments: true } } },
      });
      expect(user).toMatchObject({ mustChangePassword: true, status: 'active' });
      expect(user.student?.section?.code).toBe('bac');
      expect(user.student?.enrollments).toHaveLength(1);

      const teachers = csv(['lastName,firstName', 'Lefèvre,Anne']);
      const imported = await t
        .http()
        .post('/api/users/import?role=teacher')
        .set(bearer(admin))
        .attach('file', teachers, { filename: 'profs.csv', contentType: 'text/csv' })
        .expect(201);
      expect((imported.body as ImportUsersResponse).created[0]).toMatchObject({
        email: `anne.lefevre@${DOMAIN}`,
        role: 'teacher',
      });
    });

    it('numbers homonyms across the database and the file; a second import changes no address', async () => {
      const last = `Homonyme${Date.now().toString(36)}`;
      // One homonym already in the database (typed by the secretariat, with accents and a space).
      const existing = await t
        .http()
        .post('/api/users')
        .set(bearer(admin))
        .send({ role: 'teacher', firstName: 'Adèle', lastName: last })
        .expect(201);
      const base = `adele.${last.toLowerCase()}`;
      expect((existing.body as CreatedUserResponse).user.email).toBe(`${base}@${DOMAIN}`);

      const file = csv([
        header,
        `${last},adele,bac,e2e-bac-a,H-1,`,
        `${last},ADÈLE,bac,e2e-bac-a,H-2,`,
      ]);
      const preview = (await t
        .http()
        .post('/api/users/import/preview?role=student')
        .set(bearer(admin))
        .attach('file', file, { filename: 'h.csv', contentType: 'text/csv' })
        .expect(200)).body as ImportPreviewResponse;
      expect(preview.rows.map((r) => [r.email, r.emailNumber, r.emailNote])).toEqual([
        [`${base}2@${DOMAIN}`, 2, 'car 1 homonyme'],
        [`${base}3@${DOMAIN}`, 3, 'car 2 homonymes'],
      ]);

      const first = await t
        .http()
        .post('/api/users/import?role=student')
        .set(bearer(admin))
        .attach('file', file, { filename: 'h.csv', contentType: 'text/csv' })
        .expect(201);
      expect((first.body as ImportUsersResponse).created.map((c) => c.email)).toEqual([
        `${base}2@${DOMAIN}`,
        `${base}3@${DOMAIN}`,
      ]);

      // The same roster again: both students are recognised by their student number, kept as they are.
      const again = (await t
        .http()
        .post('/api/users/import/preview?role=student')
        .set(bearer(admin))
        .attach('file', file, { filename: 'h.csv', contentType: 'text/csv' })
        .expect(200)).body as ImportPreviewResponse;
      expect(again.rows.map((r) => [r.email, r.alreadyImported])).toEqual([
        [`${base}2@${DOMAIN}`, true],
        [`${base}3@${DOMAIN}`, true],
      ]);
      const second = await t
        .http()
        .post('/api/users/import?role=student')
        .set(bearer(admin))
        .attach('file', file, { filename: 'h.csv', contentType: 'text/csv' })
        .expect(201);
      expect((second.body as ImportUsersResponse).created).toEqual([]);
      const emails = (await t.prisma.user.findMany({ where: { lastName: last }, orderBy: { createdAt: 'asc' } })).map(
        (u) => u.email,
      );
      expect(emails).toEqual([`${base}@${DOMAIN}`, `${base}2@${DOMAIN}`, `${base}3@${DOMAIN}`]);
    });

    it('gives distinct addresses to homonyms created at the same moment', async () => {
      const last = `Simultane${Date.now().toString(36)}`;
      const create = () =>
        t.http().post('/api/users').set(bearer(admin)).send({ role: 'teacher', firstName: 'Omar', lastName: last });
      const results = await Promise.all([create(), create(), create(), create()]);
      for (const res of results) expect(res.status).toBe(201);
      const emails = results.map((r) => (r.body as CreatedUserResponse).user.email).sort();
      const base = `omar.${last.toLowerCase()}`;
      expect(emails).toEqual([`${base}2@${DOMAIN}`, `${base}3@${DOMAIN}`, `${base}4@${DOMAIN}`, `${base}@${DOMAIN}`].sort());
    });

    it('is for admins only', async () => {
      const teacher = await t.token(MATHS_TEACHER);
      await t
        .http()
        .post('/api/users/import/preview?role=teacher')
        .set(bearer(teacher))
        .attach('file', csv(['lastName,firstName', 'X,Y']), { filename: 'x.csv', contentType: 'text/csv' })
        .expect(403);
    });
  });

  describe('section changes', () => {
    let student: CreatedUserResponse;
    let studentToken: string;

    beforeAll(async () => {
      student = await newStudent('Salma', 'Changement', 'nationale', 'e2e-nat-a');
      studentToken = (await firstSignIn(student, 'Salma-Change-2026')).accessToken;
    });

    it('allows one pending request per student; a student cannot approve', async () => {
      const created = await t
        .http()
        .post('/api/section-changes')
        .set(bearer(studentToken))
        .send({ toSection: 'bac', reason: 'Je souhaite préparer le Bac français.' })
        .expect(201);
      const request = created.body as SectionChangeRequestDto;
      expect(request).toMatchObject({
        status: 'pending',
        fromSection: 'nationale',
        toSection: 'bac',
        requestedByStudent: true,
      });

      // A second one, by the student or by the secretariat, is refused while it is pending.
      await t
        .http()
        .post('/api/section-changes')
        .set(bearer(studentToken))
        .send({ toSection: 'bac', reason: 'Encore' })
        .expect(409);
      await t
        .http()
        .post('/api/section-changes')
        .set(bearer(admin))
        .send({ studentId: student.user.studentId, toSection: 'bac', reason: 'Saisie secrétariat' })
        .expect(409);

      // A student may not decide, nor ask for someone else; a teacher may not either.
      const bacClass = classOf('bac', 'e2e-bac-a');
      await t
        .http()
        .post(`/api/section-changes/${request.id}/approve`)
        .set(bearer(studentToken))
        .send({ classId: bacClass.id })
        .expect(403);
      await t
        .http()
        .post(`/api/section-changes/${request.id}/approve`)
        .set(bearer(await t.token(MATHS_TEACHER)))
        .send({ classId: bacClass.id })
        .expect(403);
      await t.http().get('/api/section-changes').set(bearer(studentToken)).expect(403);
      const other = await t.prisma.student.findFirstOrThrow({ where: { id: { not: student.user.studentId! } } });
      await t
        .http()
        .post('/api/section-changes')
        .set(bearer(studentToken))
        .send({ studentId: other.id, toSection: 'bac', reason: 'x' })
        .expect(403);

      const mine = await t.http().get('/api/section-changes/mine').set(bearer(studentToken)).expect(200);
      expect((mine.body as SectionChangeRequestDto[]).map((r) => r.id)).toEqual([request.id]);
    });

    it('approval moves the student in one step and keeps their grades', async () => {
      const studentId = student.user.studentId!;
      const [pending] = (
        (await t.http().get('/api/section-changes?status=pending').set(bearer(admin)).expect(200))
          .body as Paginated<SectionChangeRequestDto>
      ).items.filter((r) => r.studentId === studentId);
      expect(pending).toBeDefined();

      // Give the student a grade in the old class, to check it survives.
      const oldClass = classOf('nationale', 'e2e-nat-a');
      const exam = await t.prisma.event.findFirstOrThrow({ where: { activityType: { code: 'examen' } } });
      gradeId = (await t.prisma.grade.create({
        data: { eventId: exam.id, studentId, score: 15, gradedById: exam.authorId, published: true },
      })).id;

      // A class of the old section is refused.
      await t
        .http()
        .post(`/api/section-changes/${pending!.id}/approve`)
        .set(bearer(admin))
        .send({ classId: classOf('nationale', 'e2e-nat-b').id })
        .expect(400);

      const bacClass = classOf('bac', 'e2e-bac-a');
      const approved = await t
        .http()
        .post(`/api/section-changes/${pending!.id}/approve`)
        .set(bearer(admin))
        .send({ classId: bacClass.id, note: 'Accord de la direction' })
        .expect(200);
      expect(approved.body).toMatchObject({ status: 'approved', newClassLabel: bacClass.label });

      const after = await t.prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        include: { section: true, enrollments: { orderBy: { enrolledOn: 'asc' } }, grades: true },
      });
      expect(after.section?.code).toBe('bac');
      expect(after.enrollments).toHaveLength(2);
      expect(after.enrollments.find((e) => e.classId === oldClass.id)?.leftOn).not.toBeNull();
      expect(after.enrollments.find((e) => e.classId === bacClass.id)?.leftOn).toBeNull();
      expect(after.grades).toHaveLength(1);
      expect(
        await t.prisma.auditLog.count({ where: { action: 'student.section_change', entityId: studentId } }),
      ).toBe(1);

      // Deciding twice is refused; a new request is possible again.
      await t
        .http()
        .post(`/api/section-changes/${pending!.id}/reject`)
        .set(bearer(admin))
        .send({ note: 'Trop tard' })
        .expect(409);
      const again = await t
        .http()
        .post('/api/section-changes')
        .set(bearer(admin))
        .send({ studentId, toSection: 'nationale', reason: 'Retour' })
        .expect(201);
      const rejected = await t
        .http()
        .post(`/api/section-changes/${(again.body as SectionChangeRequestDto).id}/reject`)
        .set(bearer(admin))
        .send({ note: 'Pas en cours d’année' })
        .expect(200);
      expect(rejected.body).toMatchObject({ status: 'rejected', decisionNote: 'Pas en cours d’année' });
    });

    it('refuses to enrol a student directly in a class of the other section', async () => {
      await t
        .http()
        .post(`/api/classes/${classOf('nationale', 'e2e-nat-b').id}/enrollments`)
        .set(bearer(admin))
        .send({ studentId: student.user.studentId })
        .expect(409);
    });
  });

  describe('graduation and leaving', () => {
    it('archived users cannot sign in, lose their sessions and are read-only', async () => {
      const created = await newStudent('Omar', 'Diplome', 'bac', 'e2e-bac-a');
      const session = await firstSignIn(created, 'Omar-Diplome-2027');
      await t
        .http()
        .post('/api/section-changes')
        .set(bearer(session.accessToken))
        .send({ toSection: 'nationale', reason: 'Avant le départ' })
        .expect(201);

      const archived = await t
        .http()
        .post('/api/users/archive')
        .set(bearer(admin))
        .send({ studentIds: [created.user.studentId], outcome: 'graduated', on: '2027-06-17' })
        .expect(200);
      expect((archived.body as ArchiveStudentsResponse).archived).toBe(1);

      await t
        .http()
        .post('/api/auth/login')
        .send({ email: created.user.email, password: 'Omar-Diplome-2027' })
        .expect(401);
      await t.http().get('/api/auth/me').set(bearer(session.accessToken)).expect(401);

      const user = await t.prisma.user.findUniqueOrThrow({
        where: { id: created.user.id },
        include: { student: { include: { enrollments: true, sectionChangeRequests: true } } },
      });
      expect(user.status).toBe('archived');
      expect(user.student?.graduatedOn?.toISOString().slice(0, 10)).toBe('2027-06-17');
      expect(user.student?.enrollments.every((e) => e.leftOn !== null)).toBe(true);
      expect(user.student?.sectionChangeRequests.map((r) => r.status)).toEqual(['rejected']);

      // Read-only: no edit, no enrolment, no request, until restored.
      await t
        .http()
        .patch(`/api/users/${created.user.id}`)
        .set(bearer(admin))
        .send({ firstName: 'Changé' })
        .expect(409);
      await t
        .http()
        .post(`/api/classes/${classOf('bac', 'e2e-bac-a').id}/enrollments`)
        .set(bearer(admin))
        .send({ studentId: created.user.studentId })
        .expect(409);
      await t
        .http()
        .post('/api/section-changes')
        .set(bearer(admin))
        .send({ studentId: created.user.studentId, toSection: 'nationale', reason: 'x' })
        .expect(409);
      const restored = await t
        .http()
        .patch(`/api/users/${created.user.id}`)
        .set(bearer(admin))
        .send({ status: 'active' })
        .expect(200);
      expect(restored.body).toMatchObject({ status: 'active', graduatedOn: null });
    });

    it('archives a whole class as having left', async () => {
      // A class of its own, so the seeded classes stay intact for the other specs.
      const nationale = classOf('nationale', 'secondaire-3');
      const made = await t
        .http()
        .post('/api/classes')
        .set(bearer(admin))
        .send({
          schoolYearId: nationale.schoolYearId,
          sectionId: nationale.sectionId,
          code: 'archive-test',
          label: 'Classe à archiver',
        })
        .expect(201);
      const schoolClass = made.body as ClassDto;
      classes.push(schoolClass);
      const a = await newStudent('Classe', 'Entiere', 'nationale', 'archive-test');
      const b = await newStudent('Classe', 'Entiere', 'nationale', 'archive-test');
      const res = await t
        .http()
        .post('/api/users/archive')
        .set(bearer(admin))
        .send({ classId: schoolClass.id, outcome: 'left', on: '2027-06-17' })
        .expect(200);
      expect((res.body as ArchiveStudentsResponse).archived).toBe(2);
      for (const created of [a, b]) {
        const user = await t.prisma.user.findUniqueOrThrow({
          where: { id: created.user.id },
          include: { student: true },
        });
        expect(user.status).toBe('archived');
        expect(user.student?.graduatedOn).toBeNull();
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: created.user.email, password: created.temporaryPassword })
          .expect(401);
      }
      expect(await t.prisma.enrollment.count({ where: { classId: schoolClass.id, leftOn: null } })).toBe(0);
    });

    it('refuses a request naming both students and a class, or neither', async () => {
      await t
        .http()
        .post('/api/users/archive')
        .set(bearer(admin))
        .send({ outcome: 'left', on: '2027-06-17' })
        .expect(400);
    });
  });

  describe('coordinator with a temporary password', () => {
    it('cannot edit the structure until the password is chosen, and loses access when disabled', async () => {
      const created = (
        await t
          .http()
          .post('/api/users')
          .set(bearer(admin))
          .send({ role: 'teacher', firstName: 'Coord', lastName: 'Temporaire' })
          .expect(201)
      ).body as CreatedUserResponse;
      await t
        .http()
        .patch(`/api/users/${created.user.id}`)
        .set(bearer(admin))
        .send({ isCoordinator: true })
        .expect(200);
      const login = await t
        .http()
        .post('/api/auth/login')
        .send({ email: created.user.email, password: created.temporaryPassword })
        .expect(200);
      const temporary = (login.body as SessionResponse).accessToken;
      // The coordinator role does not bypass the forced password change.
      const blocked = await t
        .http()
        .post('/api/rooms')
        .set(bearer(temporary))
        .send({ name: 'Salle temporaire', kind: 'classroom' })
        .expect(403);
      expect((blocked.body as { error: string }).error).toBe('PASSWORD_CHANGE_REQUIRED');

      const session = await firstSignIn(created, 'Un-bon-mot-de-passe-2026');
      const room = await t
        .http()
        .post('/api/rooms')
        .set(bearer(session.accessToken))
        .send({ name: 'Salle temporaire', kind: 'classroom' })
        .expect(201);
      // Section changes and user management stay with the admin.
      await t.http().get('/api/section-changes').set(bearer(session.accessToken)).expect(403);
      await t.http().get('/api/users').set(bearer(session.accessToken)).expect(403);

      await t
        .http()
        .patch(`/api/users/${created.user.id}`)
        .set(bearer(admin))
        .send({ status: 'disabled' })
        .expect(200);
      await t
        .http()
        .post('/api/rooms')
        .set(bearer(session.accessToken))
        .send({ name: 'Salle bloquée', kind: 'classroom' })
        .expect(401);
      await t.http().delete(`/api/rooms/${(room.body as { id: string }).id}`).set(bearer(admin));
    });
  });
});
