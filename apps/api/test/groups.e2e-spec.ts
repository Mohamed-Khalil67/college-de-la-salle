import type {
  ApiError,
  GroupDetailDto,
  GroupWithMembersDto,
  MyGroupDto,
} from '@cdls/shared';
import {
  ADMIN,
  bearer,
  COORDINATOR,
  createTestApp,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  studentOf,
  type TestApp,
} from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);

/**
 * Groups (phase 3): one group per division and student, who may manage which group (no IDOR through a
 * group id), memberships ending with the class, deleting what is in use.
 */
describe('Groups (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let maths: string;
  let french: string;
  let coordinator: string;
  /** Terminale (Bac français): the maths teacher teaches it. */
  let classId: string;
  /** A class nobody teaches: only the admin and the coordinator manage its groups. */
  let orphanClassId: string;
  let nationaleClassId: string;
  let students: string[] = [];
  const created: string[] = [];

  const post = (token: string, path: string, body: object) =>
    t.http().post(`/api/${path}`).set(bearer(token)).send(body);
  const get = (token: string, path: string) => t.http().get(`/api/${path}`).set(bearer(token));
  const group = async (token: string, label: string, division = 'TP', cls = classId) => {
    const res = await post(token, 'groups', { classId: cls, division, label }).expect(201);
    created.push((res.body as GroupDetailDto).id);
    return res.body as GroupDetailDto;
  };
  const cleanup = async () => {
    await t.prisma.timetableSlot.deleteMany({ where: { groupId: { in: created } } });
    await t.prisma.assessmentTarget.deleteMany({ where: { groupId: { in: created } } });
    await t.prisma.group.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    maths = await t.token(MATHS_TEACHER);
    french = await t.token(FRENCH_TEACHER);
    coordinator = await t.token(COORDINATOR);
    const p = t.prisma;
    const klass = await p.schoolClass.findFirstOrThrow({
      where: { code: 'terminale', section: { code: 'bac' }, schoolYear: { isCurrent: true } },
    });
    classId = klass.id;
    const national = await p.schoolClass.findFirstOrThrow({
      where: { code: 'secondaire-1', section: { code: 'nationale' }, schoolYear: { isCurrent: true } },
    });
    nationaleClassId = national.id;
    expect(
      await p.teachingAssignment.count({
        where: { teacher: { user: { email: FRENCH_TEACHER } }, classSubject: { classId: nationaleClassId } },
      }),
    ).toBe(0);
    const orphan = await p.schoolClass.create({
      data: {
        schoolYearId: klass.schoolYearId,
        sectionId: klass.sectionId,
        code: 'e2e-groups-orphan',
        label: 'Classe sans enseignant',
      },
    });
    orphanClassId = orphan.id;
    students = (
      await p.enrollment.findMany({
        where: { classId, leftOn: null },
        orderBy: { student: { user: { email: 'asc' } } },
        select: { studentId: true },
      })
    ).map((e) => e.studentId);
    expect(students.length).toBeGreaterThanOrEqual(6);
  });

  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await t.prisma.schoolClass.delete({ where: { id: orphanClassId } });
    await t.close();
  });

  describe('one group per division', () => {
    it('refuses a second group of the same division, naming the other group, and moves on request', async () => {
      const a = await group(maths, 'E2E TP A');
      const b = await group(maths, 'E2E TP B');
      await post(maths, `groups/${a.id}/members`, { studentIds: [students[0]] }).expect(201);

      const refused = await post(maths, `groups/${b.id}/members`, { studentIds: [students[0]] }).expect(409);
      expect(message(refused.body)).toContain('E2E TP A');
      expect(message(refused.body)).toContain('un groupe par division');

      const moved = await post(maths, `groups/${b.id}/members`, {
        studentIds: [students[0]],
        move: true,
      }).expect(201);
      expect((moved.body as GroupDetailDto).members.map((m) => m.id)).toEqual([students[0]]);
      expect(((await get(maths, `groups/${a.id}`).expect(200)).body as GroupDetailDto).memberCount).toBe(0);
      // The history is kept: the old membership is closed, not deleted.
      const old = await t.prisma.groupMember.findFirstOrThrow({
        where: { groupId: a.id, studentId: students[0]! },
      });
      expect(old.leftOn).not.toBeNull();
    });

    it('lets a student be in groups of different divisions', async () => {
      const tp = await group(maths, 'E2E TP A');
      const lv2 = await group(maths, 'E2E Allemand', 'E2E LV2');
      await post(maths, `groups/${tp.id}/members`, { studentIds: [students[1]] }).expect(201);
      await post(maths, `groups/${lv2.id}/members`, { studentIds: [students[1]] }).expect(201);
    });

    it('is idempotent for a student already in the group', async () => {
      const a = await group(maths, 'E2E TP A');
      await post(maths, `groups/${a.id}/members`, { studentIds: [students[2]] }).expect(201);
      const again = await post(maths, `groups/${a.id}/members`, { studentIds: [students[2]] }).expect(201);
      expect((again.body as GroupDetailDto).memberCount).toBe(1);
    });

    it('holds even when two requests race for the same student', async () => {
      const a = await group(maths, 'E2E TP A');
      const b = await group(maths, 'E2E TP B');
      const results = await Promise.all([
        post(maths, `groups/${a.id}/members`, { studentIds: [students[3]] }),
        post(maths, `groups/${b.id}/members`, { studentIds: [students[3]] }),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(
        await t.prisma.groupMember.count({ where: { studentId: students[3]!, leftOn: null, division: 'TP' } }),
      ).toBe(1);
    });

    it('refuses a student who is not enrolled in the class, and a duplicate group name', async () => {
      const a = await group(maths, 'E2E TP A');
      const stranger = await studentOf(t.prisma, 'nationale', 'secondaire-1');
      const res = await post(maths, `groups/${a.id}/members`, { studentIds: [stranger.studentId] }).expect(400);
      expect(message(res.body)).toContain('pas inscrit');
      const dup = await post(maths, 'groups', { classId, division: 'TP', label: 'E2E TP A' }).expect(409);
      expect(message(dup.body)).toContain('existe déjà');
    });

    it('removes a member softly', async () => {
      const a = await group(maths, 'E2E TP A');
      await post(maths, `groups/${a.id}/members`, { studentIds: [students[4]] }).expect(201);
      const res = await t
        .http()
        .delete(`/api/groups/${a.id}/members/${students[4]}`)
        .set(bearer(maths))
        .expect(200);
      expect((res.body as GroupDetailDto).memberCount).toBe(0);
      await t.http().delete(`/api/groups/${a.id}/members/${students[4]}`).set(bearer(maths)).expect(404);
      expect(await t.prisma.groupMember.count({ where: { groupId: a.id } })).toBe(1);
    });
  });

  describe('permissions', () => {
    it('lets an admin and a coordinator manage the groups of any class', async () => {
      const g = await group(admin, 'E2E TP A', 'TP', orphanClassId);
      await get(coordinator, `groups/${g.id}`).expect(200);
      const mine = await group(coordinator, 'E2E TP B', 'TP', orphanClassId);
      await t.http().patch(`/api/groups/${mine.id}`).set(bearer(coordinator)).send({ label: 'E2E TP C' }).expect(200);
      await t.http().delete(`/api/groups/${mine.id}`).set(bearer(coordinator)).expect(204);
      await get(coordinator, `groups?classId=${orphanClassId}`).expect(200);
    });

    it('lets a teacher manage the groups of a class they teach, and no other', async () => {
      const mine = await group(maths, 'E2E TP A');
      await get(maths, `groups?classId=${classId}`).expect(200);
      // A class the teacher does not teach: every route refuses.
      const foreign = await group(admin, 'E2E étranger', 'TP', nationaleClassId);
      await get(french, `groups?classId=${nationaleClassId}`).expect(403);
      await post(french, 'groups', { classId: nationaleClassId, division: 'TP', label: 'E2E X' }).expect(403);
      await get(french, `groups/${foreign.id}`).expect(403);
      await t.http().patch(`/api/groups/${foreign.id}`).set(bearer(french)).send({ label: 'Autre' }).expect(403);
      await t.http().delete(`/api/groups/${foreign.id}`).set(bearer(french)).expect(403);
      await post(french, `groups/${foreign.id}/members`, { studentIds: [students[0]] }).expect(403);
      await t.http().delete(`/api/groups/${foreign.id}/members/${students[0]}`).set(bearer(french)).expect(403);
      // The orphan class has no teacher at all.
      await get(maths, `groups?classId=${orphanClassId}`).expect(403);
      // Nothing changed.
      expect(((await get(admin, `groups/${foreign.id}`).expect(200)).body as GroupDetailDto).label).toBe('E2E étranger');
      expect(mine.classId).toBe(classId);
    });

    it('keeps students out of the management routes and shows them only their own memberships', async () => {
      const a = await group(maths, 'E2E TP A');
      const b = await group(maths, 'E2E TP B');
      const [s0, s1] = [students[0]!, students[1]!];
      await post(maths, `groups/${a.id}/members`, { studentIds: [s0] }).expect(201);
      await post(maths, `groups/${b.id}/members`, { studentIds: [s1] }).expect(201);
      const email = async (studentId: string) =>
        (await t.prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { user: true } })).user.email;
      const token = await t.token(await email(s0));
      await get(token, `groups?classId=${classId}`).expect(403);
      await get(token, `groups/${a.id}`).expect(403);
      await post(token, 'groups', { classId, division: 'TP', label: 'E2E pirate' }).expect(403);
      await post(token, `groups/${b.id}/members`, { studentIds: [s0], move: true }).expect(403);
      const mine = (await get(token, 'groups/mine').expect(200)).body as MyGroupDto[];
      expect(mine.map((g) => g.label)).toEqual(['E2E TP A']);
      // Staff have no « mine ».
      await get(maths, 'groups/mine').expect(403);
    });

    it('answers 404 for an unknown group and 400 for a bad id', async () => {
      await get(admin, 'groups/00000000-0000-4000-8000-000000000000').expect(404);
      await get(admin, 'groups/not-a-uuid').expect(400);
      await get(admin, 'groups').expect(400);
    });
  });

  describe('memberships follow the enrolment', () => {
    /** A student enrolled in the class for the test only. */
    const newcomer = async (cls: string) => {
      const p = t.prisma;
      const klass = await p.schoolClass.findUniqueOrThrow({ where: { id: cls } });
      const user = await p.user.create({
        data: {
          email: `e2e-group-${Date.now()}-${Math.random().toString(16).slice(2)}@demo.cdls.test`,
          passwordHash: 'x',
          role: 'student',
          firstName: 'Test',
          lastName: 'Groupe',
          student: {
            create: {
              sectionId: klass.sectionId,
              enrollments: { create: { classId: cls, schoolYearId: klass.schoolYearId } },
            },
          },
        },
        include: { student: { include: { enrollments: true } } },
      });
      return { studentId: user.student!.id, enrollmentId: user.student!.enrollments[0]!.id, userId: user.id };
    };
    const remove = (userId: string) => t.prisma.user.delete({ where: { id: userId } });

    it('closes the memberships when the student is unenrolled', async () => {
      const s = await newcomer(classId);
      const g = await group(maths, 'E2E TP A');
      await post(maths, `groups/${g.id}/members`, { studentIds: [s.studentId] }).expect(201);
      await t.http().delete(`/api/enrollments/${s.enrollmentId}`).set(bearer(admin)).expect(204);
      const row = await t.prisma.groupMember.findFirstOrThrow({ where: { studentId: s.studentId } });
      expect(row.leftOn).not.toBeNull();
      expect(((await get(admin, `groups/${g.id}`).expect(200)).body as GroupDetailDto).memberCount).toBe(0);
      await remove(s.userId);
    });

    it('closes the memberships of the old class when the student moves to another class', async () => {
      const other = await t.prisma.schoolClass.create({
        data: {
          schoolYearId: (await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } })).schoolYearId,
          sectionId: (await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } })).sectionId,
          code: 'e2e-groups-move',
          label: 'Classe de passage',
        },
      });
      const s = await newcomer(classId);
      const g = await group(maths, 'E2E TP A');
      await post(maths, `groups/${g.id}/members`, { studentIds: [s.studentId] }).expect(201);
      await post(admin, `classes/${other.id}/enrollments`, { studentId: s.studentId }).expect(201);
      expect(await t.prisma.groupMember.count({ where: { studentId: s.studentId, leftOn: null } })).toBe(0);
      await remove(s.userId);
      await t.prisma.schoolClass.delete({ where: { id: other.id } });
    });

    it('closes every membership when students graduate', async () => {
      const s = await newcomer(classId);
      const g = await group(maths, 'E2E TP A');
      await post(maths, `groups/${g.id}/members`, { studentIds: [s.studentId] }).expect(201);
      await post(admin, 'users/archive', {
        studentIds: [s.studentId],
        outcome: 'left',
        on: new Date().toISOString().slice(0, 10),
      }).expect(200);
      expect(await t.prisma.groupMember.count({ where: { studentId: s.studentId, leftOn: null } })).toBe(0);
      await remove(s.userId);
    });
  });

  describe('deleting and renaming', () => {
    it('deletes an unused group with its memberships, and audits it', async () => {
      const g = await group(maths, 'E2E TP A');
      await post(maths, `groups/${g.id}/members`, { studentIds: [students[0]] }).expect(201);
      await t.http().delete(`/api/groups/${g.id}`).set(bearer(maths)).expect(204);
      expect(await t.prisma.groupMember.count({ where: { groupId: g.id } })).toBe(0);
      expect(
        await t.prisma.auditLog.count({ where: { action: 'group.delete', entityId: g.id } }),
      ).toBe(1);
    });

    it('refuses to delete a group that work is assigned to', async () => {
      const g = await group(maths, 'E2E TP A');
      const type = await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'devoir' } });
      const ev = await t.http().post('/api/events').set(bearer(maths)).send({
        activityTypeId: type.id,
        title: 'E2E devoir de groupe',
        subjectId: 'mathematiques',
        classId,
        date: '2027-04-16',
        target: { groupIds: [g.id], studentIds: [] },
      });
      expect(ev.status).toBe(201);
      const res = await t.http().delete(`/api/groups/${g.id}`).set(bearer(maths)).expect(409);
      expect(message(res.body)).toContain('assignés à ce groupe');
      await t.http().delete(`/api/events/${(ev.body as { id: string }).id}`).set(bearer(maths)).expect(204);
      await t.http().delete(`/api/groups/${g.id}`).set(bearer(maths)).expect(204);
    });

    it('keeps the division of a group that work is assigned to', async () => {
      const g = await group(maths, 'E2E TP A');
      const type = await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'controle' } });
      const ev = await t.http().post('/api/events').set(bearer(maths)).send({
        activityTypeId: type.id,
        title: 'E2E contrôle de groupe',
        subjectId: 'mathematiques',
        classId,
        date: '2027-04-16',
        startTime: '15:00',
        endTime: '16:00',
        target: { groupIds: [g.id], studentIds: [] },
      });
      expect(ev.status).toBe(201);
      const res = await t.http().patch(`/api/groups/${g.id}`).set(bearer(maths)).send({ division: 'E2E LV2' }).expect(409);
      expect(message(res.body)).toContain('assignés à ce groupe');
      await t.http().delete(`/api/events/${(ev.body as { id: string }).id}`).set(bearer(maths)).expect(204);
      await t.http().delete(`/api/groups/${g.id}`).set(bearer(maths)).expect(204);
    });

    it('says which rule a change of division breaks', async () => {
      const a = await group(maths, 'E2E A', 'TP');
      await group(maths, 'E2E A', 'E2E LV2');
      const res = await t.http().patch(`/api/groups/${a.id}`).set(bearer(maths)).send({ division: 'E2E LV2' }).expect(409);
      expect(message(res.body)).toContain('existe déjà');
      const b = await group(maths, 'E2E B', 'TP');
      const other = await group(maths, 'E2E C', 'E2E LV2');
      await post(maths, `groups/${b.id}/members`, { studentIds: [students[0]] }).expect(201);
      await post(maths, `groups/${other.id}/members`, { studentIds: [students[0]] }).expect(201);
      const clash = await t.http().patch(`/api/groups/${b.id}`).set(bearer(maths)).send({ division: 'E2E LV2' }).expect(409);
      expect(message(clash.body)).toContain('un groupe par division');
    });

    it('renames a group and lists the groups by division', async () => {
      await group(maths, 'E2E B', 'TP');
      const a = await group(maths, 'E2E A', 'TP');
      await t.http().patch(`/api/groups/${a.id}`).set(bearer(maths)).send({ label: 'E2E Z' }).expect(200);
      const list = (await get(maths, `groups?classId=${classId}`).expect(200)).body as GroupWithMembersDto[];
      expect(list.map((g) => g.label)).toEqual(['E2E B', 'E2E Z']);
    });
  });
});
