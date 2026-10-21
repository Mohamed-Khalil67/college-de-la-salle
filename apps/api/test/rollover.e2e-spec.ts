import type {
  ApiError,
  RolloverPreview,
  RolloverRequest,
  RolloverResult,
  SchoolYearDto,
} from '@cdls/shared';
import {
  ADMIN,
  bearer,
  COORDINATOR,
  createTestApp,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  type TestApp,
} from './helpers.js';
import { createRolloverSource, type RolloverFixture } from './rollover-fixture.js';

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const body = (res: { body: unknown }) => res.body as Record<string, unknown>;

/** The next-year wizard: a preview that writes nothing, an apply that is one transaction, and the read-only year. */
describe('Rollover (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let coordinator: string;
  let teacher: string;
  let french: string;
  let student: string;
  let source: RolloverFixture;
  const request: RolloverRequest = { sourceYearId: '', copyAssignments: true, copyTimetable: true };

  const preview = (token: string, req: object = request) =>
    t.http().post('/api/rollover/preview').set(bearer(token)).send(req);
  const apply = (token: string, req: object) =>
    t.http().post('/api/rollover/apply').set(bearer(token)).send(req);

  /** Row counts of every table the rollover can write (a preview must leave them all as they were). */
  const counts = async () => ({
    years: await t.prisma.schoolYear.count(),
    classes: await t.prisma.schoolClass.count(),
    classSubjects: await t.prisma.classSubject.count(),
    assignments: await t.prisma.teachingAssignment.count(),
    periods: await t.prisma.period.count(),
    days: await t.prisma.calendarDay.count(),
    slots: await t.prisma.timetableSlot.count(),
    occupancy: await t.prisma.occupancy.count(),
    enrollments: await t.prisma.enrollment.count(),
    requests: await t.prisma.sectionChangeRequest.count(),
    audit: await t.prisma.auditLog.count(),
    archivedUsers: await t.prisma.user.count({ where: { status: 'archived' } }),
  });

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    coordinator = await t.token(COORDINATOR);
    teacher = await t.token(MATHS_TEACHER);
    french = await t.token(FRENCH_TEACHER);
    source = await createRolloverSource(t.prisma, 'a');
    (request as { sourceYearId: string }).sourceYearId = source.yearId;
  });

  afterAll(() => t.close());

  describe('permissions', () => {
    it('refuses teachers, coordinators and students, on both routes', async () => {
      const apply0 = { ...request, planHash: 'a'.repeat(64) };
      for (const token of [teacher, french, coordinator]) {
        await preview(token).expect(403);
        await apply(token, apply0).expect(403);
      }
      // A student account (the demo ones sign in with the seed password).
      const email = (
        await t.prisma.user.findFirstOrThrow({ where: { role: 'student', status: 'active', email: { endsWith: '@demo.cdls.test' }, NOT: { email: { startsWith: 'roll' } } } })
      ).email;
      student = await t.token(email);
      await preview(student).expect(403);
      await apply(student, apply0).expect(403);
    });

    it('needs a sign-in', async () => {
      await t.http().post('/api/rollover/preview').send(request).expect(401);
      await t.http().post('/api/rollover/apply').send(request).expect(401);
    });

    it('validates the body', async () => {
      await preview(admin, { ...request, sourceYearId: 'not-a-uuid' }).expect(400);
      await preview(admin, { ...request, copyAssignments: 'yes' }).expect(400);
      await preview(admin, { ...request, startsOn: '2040-13-45' }).expect(400);
      await preview(admin, { ...request, extra: 1 }).expect(400);
      await apply(admin, { ...request, planHash: 'nope' }).expect(400);
    });
  });

  describe('preview', () => {
    it('writes nothing and says what would be created', async () => {
      const before = await counts();
      const res = await preview(admin).expect(200);
      expect(await counts()).toEqual(before);

      const p = res.body as RolloverPreview;
      expect(p.planHash).toMatch(/^[0-9a-f]{64}$/);
      expect(p.newYear).toEqual({
        label: '2040-2041',
        startsOn: '2040-09-01',
        endsOn: '2041-06-30',
        exists: false,
      });
      const step = (id: string) => p.steps.find((s) => s.id === id)!;
      expect(step('year')).toMatchObject({ create: 1, existing: 0 });
      expect(step('classes')).toMatchObject({ create: 5, existing: 0 });
      expect(step('periods')).toMatchObject({ create: 3 });
      expect(step('calendar_days')).toMatchObject({ create: 2 });
      expect(step('class_subjects')).toMatchObject({ create: 8 });
      expect(step('assignments')).toMatchObject({ create: 8 });
      expect(step('timetable')).toMatchObject({ create: 3 });
      expect(step('students')).toMatchObject({ create: 10 });
      expect(step('groups')).toMatchObject({ create: 0 });
      expect(p.students).toHaveLength(10);
      expect(p.archivesSourceYear).toBe(true);
      // Terminal classes graduate by default, the others are promoted.
      const bySource = (label: string) => p.students.filter((s) => s.sourceClassLabel === label);
      expect(bySource('Terminale').every((s) => s.action === 'graduate' && s.targetClassLabel === null)).toBe(true);
      expect(bySource('2e secondaire').every((s) => s.action === 'graduate')).toBe(true);
      expect(bySource('Seconde').every((s) => s.action === 'promote' && s.targetClassLabel === 'Première')).toBe(true);
      expect(p.classes.find((c) => c.code === 'terminale')).toMatchObject({ nextLabel: null, studentCount: 2, targetClassId: null });
      // The holiday moved to non-leap February; moveable feasts are flagged for a check.
      expect(p.issues.some((i) => i.step === 'calendar_days' && i.message.includes('2041-02-28'))).toBe(true);
      expect(p.issues.some((i) => i.step === 'students' && i.message.includes('4 élèves'))).toBe(true);
    });

    it('gives the same hash for the same data and another one when the request changes', async () => {
      const a = (await preview(admin).expect(200)).body as RolloverPreview;
      const b = (await preview(admin).expect(200)).body as RolloverPreview;
      expect(a.planHash).toBe(b.planHash);
      const c = (await preview(admin, { ...request, copyTimetable: false }).expect(200)).body as RolloverPreview;
      expect(c.planHash).not.toBe(a.planHash);
      expect(c.steps.find((s) => s.id === 'timetable')).toMatchObject({ create: 0 });
    });

    it('lets the dates and the label be edited', async () => {
      const p = (
        await preview(admin, { ...request, label: '2041-2042', startsOn: '2041-09-10', endsOn: '2042-06-20' }).expect(200)
      ).body as RolloverPreview;
      expect(p.newYear).toMatchObject({ label: '2041-2042', startsOn: '2041-09-10', endsOn: '2042-06-20' });
      expect(p.issues.some((i) => i.step === 'periods' && /raccourcie/.test(i.message))).toBe(true);
    });

    it('refuses what cannot be planned (400, in French)', async () => {
      const message = async (req: object) => String((body(await preview(admin, req).expect(400)) as unknown as ApiError).message);
      expect(await message({ ...request, copyAssignments: false })).toMatch(/affectations/);
      expect(await message({ ...request, label: '2039-2040' })).toMatch(/autre nom/);
      expect(await message({ ...request, startsOn: '2040-09-01', endsOn: '2040-08-01' })).toMatch(/fin de l’année/);
      expect(await message({ ...request, startsOn: '2039-08-01' })).toMatch(/commencer après/);
      const first = source.students['bac/seconde']![0]!.id;
      expect(await message({ ...request, overrides: [{ studentId: first, action: 'graduate' }] })).toMatch(/classe terminale/);
      const last = source.students['bac/terminale']![0]!.id;
      expect(await message({ ...request, overrides: [{ studentId: last, action: 'promote' }] })).toMatch(/terminale/);
      expect(await message({ ...request, overrides: [{ studentId: first, action: 'leave' }, { studentId: first, action: 'repeat' }] })).toMatch(/deux fois/);
      await preview(admin, { ...request, sourceYearId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    });
  });

  describe('apply', () => {
    it('refuses a preview that no longer matches the data (409), and creates nothing', async () => {
      const p = (await preview(admin).expect(200)).body as RolloverPreview;
      // Someone changes a coefficient meanwhile.
      const cs = await t.prisma.classSubject.findFirstOrThrow({ where: { classId: source.classes['bac/seconde']!, subjectId: 'francais' } });
      await t.prisma.classSubject.update({ where: { id: cs.id }, data: { coefficient: 5 } });
      const before = await counts();
      const res = await apply(admin, { ...request, planHash: p.planHash }).expect(409);
      expect(body(res)).toMatchObject({ code: 'ROLLOVER_PREVIEW_STALE' });
      expect(String(body(res)['message'])).toMatch(/aperçu/);
      expect(await counts()).toEqual(before);
      await t.prisma.classSubject.update({ where: { id: cs.id }, data: { coefficient: 3 } });
      // A made-up hash is refused too.
      await apply(admin, { ...request, planHash: '0'.repeat(64) }).expect(409);
      expect(await counts()).toEqual(before);
    });

    it('creates the year, classes, subjects, periods, calendar, assignments, timetable and promotions in one go', async () => {
      const before = await counts();
      const p = (await preview(admin, { ...request, overrides: [
        { studentId: source.students['bac/seconde']![0]!.id, action: 'repeat' },
        { studentId: source.students['bac/premiere']![0]!.id, action: 'leave' },
        { studentId: source.students['nationale/secondaire-1']![0]!.id, action: 'section_change' },
      ] }).expect(200)).body as RolloverPreview;
      expect(await counts()).toEqual(before);

      const res = await apply(admin, { ...request, overrides: [
        { studentId: source.students['bac/seconde']![0]!.id, action: 'repeat' },
        { studentId: source.students['bac/premiere']![0]!.id, action: 'leave' },
        { studentId: source.students['nationale/secondaire-1']![0]!.id, action: 'section_change' },
      ], planHash: p.planHash }).expect(201);
      const result = res.body as RolloverResult;
      expect(result.nothingToDo).toBe(false);
      expect(result.studentCounts).toEqual({ promote: 3, repeat: 1, leave: 1, graduate: 4, section_change: 1 });
      expect(result.classes.every((c) => c.targetClassId)).toBe(true);

      const year = await t.prisma.schoolYear.findUniqueOrThrow({ where: { label: '2040-2041' } });
      expect(year.id).toBe(result.schoolYearId);
      expect(year.startsOn.toISOString().slice(0, 10)).toBe('2040-09-01');
      expect(year.isCurrent).toBe(false);
      const classes = await t.prisma.schoolClass.findMany({ where: { schoolYearId: year.id }, include: { section: true, nextClass: true } });
      expect(classes.map((c) => `${c.section.code}/${c.code}`).sort()).toEqual([
        'bac/premiere', 'bac/seconde', 'bac/terminale', 'nationale/secondaire-1', 'nationale/secondaire-2',
      ]);
      const byCode = new Map(classes.map((c) => [`${c.section.code}/${c.code}`, c]));
      expect(byCode.get('bac/seconde')!.nextClass?.code).toBe('premiere');
      expect(byCode.get('bac/premiere')!.nextClass?.code).toBe('terminale');
      expect(byCode.get('bac/terminale')!.nextClassId).toBeNull();
      expect(byCode.get('bac/premiere')!.nextClass!.schoolYearId).toBe(year.id);

      const subjects = await t.prisma.classSubject.findMany({ where: { classId: { in: classes.map((c) => c.id) } } });
      expect(subjects).toHaveLength(8);
      expect(subjects.filter((s) => s.subjectId === 'mathematiques').every((s) => Number(s.coefficient) === 4 && Number(s.hoursPerWeek) === 4)).toBe(true);
      expect(subjects.filter((s) => s.subjectId === 'francais').every((s) => Number(s.coefficient) === 3)).toBe(true);
      expect(await t.prisma.teachingAssignment.count({ where: { classSubject: { classId: { in: classes.map((c) => c.id) } } } })).toBe(8);

      const periods = await t.prisma.period.findMany({ where: { schoolYearId: year.id }, orderBy: { number: 'asc' } });
      expect(periods.map((x) => x.startsOn.toISOString().slice(0, 10))).toEqual(['2040-09-01', '2040-12-16', '2041-04-01']);
      expect(periods.every((x) => x.closedAt === null)).toBe(true);
      const days = await t.prisma.calendarDay.findMany({ where: { schoolYearId: year.id }, orderBy: { startsOn: 'asc' } });
      expect(days.map((d) => d.startsOn.toISOString().slice(0, 10))).toEqual(['2041-02-28', '2041-05-10']);
      expect(days[1]!.sectionId).not.toBeNull();

      const slots = await t.prisma.timetableSlot.findMany({ where: { classSubject: { classId: { in: classes.map((c) => c.id) } } } });
      expect(slots).toHaveLength(3);
      expect(slots.every((s) => s.validFrom.toISOString().slice(0, 10) === '2040-09-01' && s.validTo.toISOString().slice(0, 10) === '2041-06-30')).toBe(true);
      // The index holds the new sessions (and a 2041-02-28 holiday removes that day's).
      expect(await t.prisma.occupancy.count({ where: { slot: { id: { in: slots.map((s) => s.id) } } } })).toBeGreaterThan(100);

      // Students: placed in the next class, the repeater in the same level, graduates and the leaver archived.
      const enrolled = async (studentId: string) =>
        (await t.prisma.enrollment.findFirst({ where: { studentId, schoolYearId: year.id, leftOn: null }, include: { schoolClass: true } }))?.schoolClass.code ?? null;
      expect(await enrolled(source.students['bac/seconde']![0]!.id)).toBe('seconde');
      expect(await enrolled(source.students['bac/seconde']![1]!.id)).toBe('premiere');
      expect(await enrolled(source.students['bac/premiere']![0]!.id)).toBeNull();
      expect(await enrolled(source.students['bac/premiere']![1]!.id)).toBe('terminale');
      expect(await enrolled(source.students['nationale/secondaire-1']![0]!.id)).toBe('secondaire-2');
      expect(await enrolled(source.students['bac/terminale']![0]!.id)).toBeNull();
      const graduate = await t.prisma.student.findUniqueOrThrow({ where: { id: source.students['bac/terminale']![0]!.id }, include: { user: true } });
      expect(graduate.user.status).toBe('archived');
      expect(graduate.graduatedOn?.toISOString().slice(0, 10)).toBe('2040-06-30');
      const leaver = await t.prisma.student.findUniqueOrThrow({ where: { id: source.students['bac/premiere']![0]!.id }, include: { user: true } });
      expect(leaver.user.status).toBe('archived');
      expect(leaver.graduatedOn).toBeNull();
      // The section change is a pending request for the admin, the student is promoted meanwhile.
      const asked = await t.prisma.sectionChangeRequest.findFirstOrThrow({ where: { studentId: source.students['nationale/secondaire-1']![0]!.id } });
      expect(asked.status).toBe('pending');
      // The source enrolments stay as the old year's history.
      expect(await t.prisma.enrollment.count({ where: { studentId: source.students['bac/seconde']![1]!.id, schoolYearId: source.yearId } })).toBe(1);

      // Audited.
      const trail = await t.prisma.auditLog.findMany({ where: { entityId: year.id, action: 'rollover.apply' } });
      expect(trail).toHaveLength(1);
      expect(trail[0]!.actorId).not.toBeNull();
      expect(await t.prisma.auditLog.count({ where: { action: 'school_year.archive', entityId: source.yearId } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: 'student.graduated', after: { path: ['rollover'], equals: '2040-2041' } } })).toBe(4);
      expect(await t.prisma.auditLog.count({ where: { action: 'class.create', entityId: { in: classes.map((c) => c.id) } } })).toBe(5);

      const after = await counts();
      expect(after.classes - before.classes).toBe(5);
      expect(after.enrollments - before.enrollments).toBe(5);
    });

    it('archives the old year (status archived, not current)', async () => {
      const years = (await t.http().get('/api/school-years').set(bearer(admin)).expect(200)).body as SchoolYearDto[];
      const old = years.find((y) => y.id === source.yearId)!;
      expect(old).toMatchObject({ status: 'archived', isCurrent: false });
      expect(old.archivedAt).toBeTruthy();
      const next = years.find((y) => y.label === '2040-2041')!;
      expect(next.status).toBe('upcoming');
      // An archived year cannot be made current again.
      await t.http().post(`/api/school-years/${source.yearId}/current`).set(bearer(admin)).expect(409);
    });

    it('running it again changes nothing', async () => {
      const again = (await preview(admin).expect(200)).body as RolloverPreview;
      expect(again.newYear.exists).toBe(true);
      expect(again.steps.filter((s) => s.id !== 'archive' && s.id !== 'year').every((s) => s.create === 0 || s.id === 'students')).toBe(true);
      const before = await counts();
      const res = await apply(admin, { ...request, planHash: again.planHash }).expect(201);
      expect((res.body as RolloverResult).nothingToDo).toBe(true);
      expect((res.body as RolloverResult).steps.every((s) => s.create === 0)).toBe(true);
      expect(await counts()).toEqual({ ...before, audit: before.audit + 1 });
    });
  });

  describe('the old year is read-only (409, in French)', () => {
    const archived = (res: { body: unknown }) => {
      expect(body(res)).toMatchObject({ code: 'YEAR_ARCHIVED' });
      expect(String(body(res)['message'])).toMatch(/archivée.*lecture seule/);
    };

    it('refuses grades, events, attendance and timetable edits', async () => {
      // A year that is archived by hand holds the fixtures (the rollover test above archived the first one).
      const classId = source.classes['bac/seconde']!;
      const studentId = source.students['bac/seconde']![1]!.id;
      const type = await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'controle' } });
      const cours = await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'cours' } });
      const maths = source.teacherIds.maths;
      const period = await t.prisma.period.findFirstOrThrow({ where: { schoolYearId: source.yearId, number: 1 } });
      const test = await t.prisma.event.create({
        data: { activityTypeId: type.id, title: 'Contrôle', subjectId: 'mathematiques', classId, date: day('2039-10-05'), periodId: period.id, authorId: maths },
      });
      const lesson = await t.prisma.event.create({
        data: { activityTypeId: cours.id, title: 'Cours', subjectId: 'mathematiques', classId, date: day('2039-10-04'), startTime: '08:00', endTime: '09:00', authorId: maths },
      });
      const slot = await t.prisma.timetableSlot.findFirstOrThrow({ where: { classSubject: { classId } } });

      archived(await t.http().put(`/api/events/${test.id}/grades`).set(bearer(teacher)).send({ entries: [{ studentId, score: 12 }] }).expect(409));
      archived(await t.http().post(`/api/events/${test.id}/grades/publish`).set(bearer(teacher)).send({ published: true }).expect(409));
      archived(await t.http().put(`/api/events/${lesson.id}/attendance`).set(bearer(teacher)).send({ date: '2039-10-04', records: [{ studentId, status: 'absent' }] }).expect(409));
      archived(await t.http().post('/api/events').set(bearer(teacher)).send({ activityTypeId: type.id, title: 'Nouveau', subjectId: 'mathematiques', classId, date: '2039-11-05' }).expect(409));
      archived(await t.http().patch(`/api/events/${test.id}`).set(bearer(teacher)).send({ title: 'Autre' }).expect(409));
      archived(await t.http().delete(`/api/events/${test.id}`).set(bearer(teacher)).expect(409));
      const classSubject = await t.prisma.classSubject.findFirstOrThrow({ where: { classId, subjectId: 'mathematiques' } });
      archived(await t.http().post('/api/timetable/slots').set(bearer(admin)).send({ classSubjectId: classSubject.id, teacherId: maths, roomId: source.roomIds[2], activityTypeId: cours.id, weekday: 3, startTime: '10:00', endTime: '11:00', validFrom: '2039-09-01', validTo: '2040-06-30', weekParity: null, division: null }).expect(409));
      archived(await t.http().patch(`/api/timetable/slots/${slot.id}`).set(bearer(admin)).send({ scope: 'all', changes: { startTime: '08:30', endTime: '09:30' } }).expect(409));
      archived(await t.http().delete(`/api/timetable/slots/${slot.id}?scope=all`).set(bearer(admin)).expect(409));
      archived(await t.http().post(`/api/timetable/slots/${slot.id}/exceptions`).set(bearer(admin)).send({ date: '2039-10-09', kind: 'cancelled' }).expect(409));
      // Nothing was written; the current year (the demo one) still works.
      expect(await t.prisma.grade.count({ where: { eventId: test.id } })).toBe(0);
      expect(await t.prisma.attendance.count({ where: { eventId: lesson.id } })).toBe(0);
      const demo = await t.prisma.event.findFirstOrThrow({ where: { activityType: { code: 'examen' }, schoolClass: { schoolYear: { isCurrent: true } }, subjectId: 'mathematiques' } });
      const demoStudent = await t.prisma.enrollment.findFirstOrThrow({ where: { classId: demo.classId!, leftOn: null } });
      await t.http().put(`/api/events/${demo.id}/grades`).set(bearer(teacher)).send({ entries: [{ studentId: demoStudent.studentId, score: 14 }] }).expect(200);
    });

    it('also locks the class and its next-class link', async () => {
      await t.http().patch(`/api/classes/${source.classes['bac/seconde']!}`).set(bearer(admin)).send({ nextClassId: null }).expect(409);
    });
  });

  describe('timetable conflicts are reported, not fatal', () => {
    it('leaves a clashing slot out, copies the rest, and says why', async () => {
      const other = await createRolloverSource(t.prisma, 'b', { label: '2037-2038', startsOn: '2037-09-01', endsOn: '2038-06-30' });
      // The next year already exists with a manual session of the maths teacher on Monday 08:00 (class: seconde).
      const bac = await t.prisma.section.findUniqueOrThrow({ where: { code: 'bac' } });
      const cours = await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'cours' } });
      const target = await t.prisma.schoolYear.create({ data: { label: '2038-2039', startsOn: day('2038-09-01'), endsOn: day('2039-06-30') } });
      const seconde = await t.prisma.schoolClass.create({ data: { schoolYearId: target.id, sectionId: bac.id, code: 'seconde', label: 'Seconde' } });
      const cs = await t.prisma.classSubject.create({ data: { classId: seconde.id, subjectId: 'mathematiques', coefficient: 4, assignments: { create: { teacherId: other.teacherIds.maths } } } });
      const manual = await t.http().post('/api/timetable/slots').set(bearer(admin)).send({ classSubjectId: cs.id, teacherId: other.teacherIds.maths, roomId: other.roomIds[2], activityTypeId: cours.id, weekday: 1, startTime: '08:00', endTime: '09:00', validFrom: '2038-09-01', validTo: '2039-06-30', weekParity: null, division: null });
      expect(manual.status).toBe(201);
      const req = { sourceYearId: other.yearId, copyAssignments: true, copyTimetable: true };
      const p = (await preview(admin, req).expect(200)).body as RolloverPreview;
      expect(p.newYear.exists).toBe(true);
      expect(p.steps.find((s) => s.id === 'classes')).toMatchObject({ create: 4, existing: 1 });
      const conflicts = p.issues.filter((i) => i.level === 'conflict');
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]!.step).toBe('timetable');
      expect(conflicts[0]!.message).toMatch(/Séance non copiée/);
      expect(p.steps.find((s) => s.id === 'timetable')).toMatchObject({ create: 2, skipped: 1 });
      // Applying goes through: the conflict does not fail it.
      const res = await apply(admin, { ...req, planHash: p.planHash }).expect(201);
      expect((res.body as RolloverResult).issues.filter((i) => i.level === 'conflict')).toHaveLength(1);
      const slots = await t.prisma.timetableSlot.count({ where: { classSubject: { schoolClass: { schoolYearId: target.id } } } });
      expect(slots).toBe(3);
      // The existing class kept its own subject; the new classes got theirs.
      expect(await t.prisma.classSubject.count({ where: { classId: seconde.id } })).toBe(2);
    });
  });

  describe('the current year', () => {
    it('hands over: the new year becomes current when the source was', async () => {
      const demo = await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
      const cur = await createRolloverSource(t.prisma, 'c', { label: '2035-2036', startsOn: '2035-09-01', endsOn: '2036-06-30', isCurrent: false });
      try {
        await t.prisma.schoolYear.update({ where: { id: demo.id }, data: { isCurrent: false } });
        await t.prisma.schoolYear.update({ where: { id: cur.yearId }, data: { isCurrent: true } });
        const req = { sourceYearId: cur.yearId, copyAssignments: false, copyTimetable: false };
        const p = (await preview(admin, req).expect(200)).body as RolloverPreview;
        expect(p.makesNewYearCurrent).toBe(true);
        await apply(admin, { ...req, planHash: p.planHash }).expect(201);
        const years = await t.prisma.schoolYear.findMany({ where: { label: { in: ['2035-2036', '2036-2037'] } } });
        expect(years.find((y) => y.label === '2035-2036')).toMatchObject({ isCurrent: false });
        expect(years.find((y) => y.label === '2035-2036')!.archivedAt).not.toBeNull();
        expect(years.find((y) => y.label === '2036-2037')).toMatchObject({ isCurrent: true });
      } finally {
        await t.prisma.schoolYear.updateMany({ data: { isCurrent: false } });
        await t.prisma.schoolYear.update({ where: { id: demo.id }, data: { isCurrent: true } });
      }
    });
  });

  it('rolls the demo year over in a preview without writing or failing', async () => {
    const demo = await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
    const before = await counts();
    const res = await preview(admin, { sourceYearId: demo.id, copyAssignments: true, copyTimetable: true }).expect(200);
    const p = res.body as RolloverPreview;
    expect(await counts()).toEqual(before);
    expect(p.newYear.label).toBe('2027-2028');
    const open = await t.prisma.enrollment.count({
      where: { schoolYearId: demo.id, leftOn: null, student: { user: { status: { not: 'archived' } } } },
    });
    expect(open).toBeGreaterThanOrEqual(60);
    expect(p.students).toHaveLength(open);
    expect(p.steps.find((s) => s.id === 'classes')).toMatchObject({
      create: await t.prisma.schoolClass.count({ where: { schoolYearId: demo.id } }),
    });
    expect(p.issues.filter((i) => i.level === 'conflict')).toEqual([]);
    expect(p.steps.find((s) => s.id === 'timetable')!.create).toBeGreaterThan(100);
    expect(p.makesNewYearCurrent).toBe(true);
    // The students of a class without a next class graduate, the others are promoted.
    const terminal = await t.prisma.enrollment.count({
      where: { schoolYearId: demo.id, leftOn: null, student: { user: { status: { not: 'archived' } } }, schoolClass: { nextClassId: null } },
    });
    expect(terminal).toBeGreaterThanOrEqual(20);
    expect(p.students.filter((s) => s.action === 'graduate')).toHaveLength(terminal);
  });
});
