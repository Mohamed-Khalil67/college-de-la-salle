import type {
  GroupDetailDto,
  RolloverPreview,
  RolloverRequest,
  RolloverResult,
  TimetableSlotInput,
} from '@cdls/shared';
import { ADMIN, bearer, createTestApp, type TestApp } from './helpers.js';
import { createRolloverSource, type RolloverFixture } from './rollover-fixture.js';

const ACK = [
  { code: 'hours_exceeded' as const, reason: 'Séance de test' },
  { code: 'exam_week' as const, reason: 'Séance de test' },
];
const stepOf = (p: { steps: readonly { id: string }[] }, id: string) =>
  p.steps.find((s) => s.id === id) as unknown as { create: number; existing: number; skipped: number };

/**
 * Phase 5 meets phase 3: the rollover copies the groups of each class, the memberships of the PROMOTED students
 * only, and the sessions of groups with the group of the new class (division kept, occupancy rebuilt).
 */
describe('Rollover and groups (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let fx: RolloverFixture;
  let req: RolloverRequest;
  const overrides = () => [
    { studentId: fx.students['bac/seconde']![0]!.id, action: 'repeat' as const },
    { studentId: fx.students['bac/premiere']![0]!.id, action: 'leave' as const },
  ];
  const preview = (body: object = { ...req, overrides: overrides() }) =>
    t.http().post('/api/rollover/preview').set(bearer(admin)).send(body);
  const apply = (body: object) => t.http().post('/api/rollover/apply').set(bearer(admin)).send(body);

  const counts = async () => ({
    groups: await t.prisma.group.count(),
    members: await t.prisma.groupMember.count(),
    slots: await t.prisma.timetableSlot.count(),
    occupancy: await t.prisma.occupancy.count(),
    targets: await t.prisma.assessmentTarget.count(),
    audit: await t.prisma.auditLog.count(),
  });

  const mkGroup = async (classId: string, division: string, label: string) =>
    (
      (await t.http().post('/api/groups').set(bearer(admin)).send({ classId, division, label }).expect(201))
        .body as GroupDetailDto
    ).id;
  const join = (groupId: string, students: readonly { id: string }[]) =>
    t
      .http()
      .post(`/api/groups/${groupId}/members`)
      .set(bearer(admin))
      .send({ studentIds: students.map((s) => s.id) })
      .expect(201);
  const slot = async (over: Partial<TimetableSlotInput>) => {
    const res = await t
      .http()
      .post('/api/timetable/slots')
      .set(bearer(admin))
      .send({
        activityTypeId: (await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'cours' } })).id,
        weekParity: null,
        division: null,
        validFrom: '2043-09-01',
        validTo: '2044-06-30',
        acknowledgedWarnings: ACK,
        ...over,
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    fx = await createRolloverSource(t.prisma, 'g', { label: '2043-2044', startsOn: '2043-09-01', endsOn: '2044-06-30' });
    req = { sourceYearId: fx.yearId, copyAssignments: true, copyTimetable: true };
    const [seconde, premiere, terminale] = [fx.classes['bac/seconde']!, fx.classes['bac/premiere']!, fx.classes['bac/terminale']!];
    const S = fx.students;
    // Seconde: the repeater and a promoted student take German; première: the leaver and a promoted student
    // take German, the promoted one is also in TP A; the terminale's graduates take German.
    await join(await mkGroup(seconde, 'LV2', 'Allemand'), S['bac/seconde']!);
    const premiereLv2 = await mkGroup(premiere, 'LV2', 'Allemand');
    await join(premiereLv2, S['bac/premiere']!);
    const tpA = await mkGroup(premiere, 'TP', 'A');
    const tpB = await mkGroup(premiere, 'TP', 'B');
    await join(tpA, [S['bac/premiere']![1]!]);
    await join(await mkGroup(terminale, 'LV2', 'Allemand'), S['bac/terminale']!);
    // TP A and TP B run at the same time (one division), with their own teachers and rooms.
    const cs = async (classId: string, subjectId: string) =>
      (await t.prisma.classSubject.findFirstOrThrow({ where: { classId, subjectId } })).id;
    await slot({ classSubjectId: await cs(premiere, 'mathematiques'), teacherId: fx.teacherIds.maths, roomId: fx.roomIds[0]!, weekday: 3, startTime: '10:00', endTime: '11:00', groupId: tpA } as never);
    await slot({ classSubjectId: await cs(premiere, 'francais'), teacherId: fx.teacherIds.french, roomId: fx.roomIds[1]!, weekday: 3, startTime: '10:00', endTime: '11:00', groupId: tpB } as never);
  });

  afterAll(() => t.close());

  it('the preview reports the groups and writes nothing', async () => {
    const before = await counts();
    const p = (await preview().expect(200)).body as RolloverPreview;
    expect(await counts()).toEqual(before);
    // 5 groups (seconde LV2, première LV2, TP A, TP B, terminale LV2); two memberships (seconde → première LV2,
    // première → terminale LV2); the repeater's and the TP A one (no TP A in terminale) are left out; 2 sessions.
    expect(stepOf(p, 'groups')).toMatchObject({ create: 5, existing: 0 });
    expect(stepOf(p, 'group_members')).toMatchObject({ create: 2, existing: 0, skipped: 2 });
    expect(stepOf(p, 'group_slots')).toMatchObject({ create: 2, existing: 0, skipped: 0 });
    expect(p.issues.filter((i) => i.level === 'conflict')).toEqual([]);
    // The core timetable step does not count the sessions of groups.
    expect(stepOf(p, 'timetable').create).toBe(3);
  });

  it('copies the groups, the promoted students and the group sessions, and nothing else', async () => {
    const before = await counts();
    const p = (await preview().expect(200)).body as RolloverPreview;
    const res = (await apply({ ...req, overrides: overrides(), planHash: p.planHash }).expect(201)).body as RolloverResult;
    expect(res.nothingToDo).toBe(false);
    const year = await t.prisma.schoolYear.findUniqueOrThrow({ where: { label: '2044-2045' } });
    const classes = await t.prisma.schoolClass.findMany({ where: { schoolYearId: year.id } });
    const byCode = new Map(classes.map((c) => [c.code, c.id]));

    // Groups: division and label on the copied classes.
    const groups = await t.prisma.group.findMany({ where: { classId: { in: classes.map((c) => c.id) } } });
    expect(groups.map((g) => `${classes.find((c) => c.id === g.classId)!.code}|${g.division}|${g.label}`).sort()).toEqual([
      'premiere|LV2|Allemand', 'premiere|TP|A', 'premiere|TP|B', 'seconde|LV2|Allemand', 'terminale|LV2|Allemand',
    ]);

    // Members: only the promoted students, one open membership, starting on the enrolment day.
    const members = await t.prisma.groupMember.findMany({ where: { classId: { in: classes.map((c) => c.id) } }, include: { group: true } });
    expect(members).toHaveLength(2);
    const S = fx.students;
    const promotedToPremiere = members.find((m) => m.studentId === S['bac/seconde']![1]!.id)!;
    expect(promotedToPremiere).toMatchObject({ classId: byCode.get('premiere'), division: 'LV2', leftOn: null });
    expect(promotedToPremiere.group.label).toBe('Allemand');
    expect(promotedToPremiere.joinedOn.toISOString().slice(0, 10)).toBe('2044-09-01');
    expect(members.find((m) => m.studentId === S['bac/premiere']![1]!.id)).toMatchObject({ classId: byCode.get('terminale') });
    // A repeater, a graduate and a leaver have no membership in the new year.
    for (const id of [S['bac/seconde']![0]!.id, S['bac/premiere']![0]!.id, S['bac/terminale']![0]!.id, S['bac/terminale']![1]!.id])
      expect(members.some((m) => m.studentId === id)).toBe(false);
    // The old year keeps its groups; a graduate's and a leaver's memberships were closed when they left.
    expect(await t.prisma.group.count({ where: { classId: fx.classes['bac/premiere']! } })).toBe(3);
    expect(await t.prisma.groupMember.count({ where: { studentId: S['bac/premiere']![0]!.id, leftOn: null } })).toBe(0);

    // Slots: the new group, its division, the whole new year, and the index rows carry the group.
    const slots = await t.prisma.timetableSlot.findMany({ where: { groupId: { in: groups.map((g) => g.id) } }, include: { group: true } });
    expect(slots).toHaveLength(2);
    for (const s of slots) {
      expect(s.division).toBe('TP');
      expect(s.group!.classId).toBe(byCode.get('premiere'));
      expect(s.validFrom.toISOString().slice(0, 10)).toBe('2044-09-01');
      expect(s.validTo.toISOString().slice(0, 10)).toBe('2045-06-30');
    }
    const rows = await t.prisma.occupancy.findMany({ where: { slotId: { in: slots.map((s) => s.id) } } });
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.every((r) => r.divisionKey === 'TP' && r.groupId !== null)).toBe(true);
    // TP A and TP B overlap (one division) without a conflict, and the rollover reported none.
    expect(res.issues.filter((i) => i.level === 'conflict')).toEqual([]);

    // Targets are never copied; the audit log has the groups row; the old year's groups are unchanged.
    const after = await counts();
    expect(after.targets).toBe(before.targets);
    expect(after.groups - before.groups).toBe(5);
    expect(after.members - before.members).toBe(2);
    expect(after.slots - before.slots).toBe(5);
    const trail = await t.prisma.auditLog.findMany({ where: { action: 'rollover.groups', entityId: year.id } });
    expect(trail).toHaveLength(1);
    expect(trail[0]!.after).toMatchObject({ groups: 5, members: 2, slots: 2, conflicts: 0 });
  });

  it('a second run does not put back a student a teacher took out of the new group', async () => {
    const promoted = fx.students['bac/seconde']![1]!.id;
    const closed = await t.prisma.groupMember.updateMany({ where: { studentId: promoted, leftOn: null, group: { schoolClass: { schoolYear: { label: '2044-2045' } } } }, data: { leftOn: new Date('2044-10-01T00:00:00Z') } });
    expect(closed.count).toBe(1);
    const again = (await preview({ ...req }).expect(200)).body as RolloverPreview;
    expect(stepOf(again, 'group_members')).toMatchObject({ create: 0 });
  });

  it('a second run changes nothing', async () => {
    const again = (await preview({ ...req }).expect(200)).body as RolloverPreview;
    for (const id of ['groups', 'group_members', 'group_slots']) expect(stepOf(again, id).create).toBe(0);
    expect(stepOf(again, 'groups').existing).toBe(5);
    expect(stepOf(again, 'group_slots').existing).toBe(2);
    const before = await counts();
    const res = (await apply({ ...req, planHash: again.planHash }).expect(201)).body as RolloverResult;
    expect(res.nothingToDo).toBe(true);
    expect(await counts()).toEqual({ ...before, audit: before.audit + 1 });
  });
});
