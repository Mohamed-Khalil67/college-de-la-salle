import type {
  ApiError,
  GroupDetailDto,
  TimetableBlockedError,
  TimetableCheckResult,
  TimetableOccurrenceDto,
  TimetableSlotInput,
  TimetableWriteResult,
} from '@cdls/shared';
import { ADMIN, bearer, createTestApp, FRENCH_TEACHER, MATHS_TEACHER, type TestApp } from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);
const blocked = (body: unknown) => body as TimetableBlockedError;

const ACK = [{ code: 'hours_exceeded' as const, reason: 'Séance de test' }];

/** A Monday inside the demo school year, outside every holiday. */
const WEEK = { from: '2027-03-07', to: '2027-03-13' };

/**
 * Groups in the timetable: groups of one division run at the same time, everything else still clashes; the
 * division comes from the group; a student sees their groups' sessions and the whole class's; the room
 * warning counts the group.
 */
describe('Timetable and groups (e2e)', () => {
  let t: TestApp;
  let admin: string;
  const base = {} as {
    classId: string;
    csMaths: string;
    csPhys: string;
    csFrench: string;
    hany: string;
    sherif: string;
    claire: string;
    r1: string;
    r2: string;
    r3: string;
    cours: string;
  };
  let groupA: GroupDetailDto;
  let groupB: GroupDetailDto;
  let lv2: GroupDetailDto;
  let students: { id: string; email: string }[] = [];
  const groupIds: string[] = [];
  const extraRooms: string[] = [];

  const slot = (over: Partial<TimetableSlotInput> = {}): TimetableSlotInput => ({
    classSubjectId: base.csMaths,
    teacherId: base.hany,
    roomId: base.r1,
    activityTypeId: base.cours,
    weekday: 1,
    startTime: '17:00',
    endTime: '18:00',
    validFrom: '2026-09-06',
    validTo: '2027-06-17',
    weekParity: null,
    division: null,
    // The demo class already has its hours: the weekly volume warning is accepted with a reason.
    acknowledgedWarnings: ACK,
    ...over,
  } as TimetableSlotInput);
  const post = (body: object) =>
    t.http().post('/api/timetable/slots').set(bearer(admin)).send(body);
  const create = async (over: Partial<TimetableSlotInput> = {}) =>
    ((await post(slot(over)).expect(201)).body as TimetableWriteResult).slot!;
  const mkGroup = async (division: string, label: string, cls = base.classId) => {
    const res = await t
      .http()
      .post('/api/groups')
      .set(bearer(admin))
      .send({ classId: cls, division, label })
      .expect(201);
    groupIds.push((res.body as GroupDetailDto).id);
    return res.body as GroupDetailDto;
  };
  const add = (g: GroupDetailDto, who: { id: string }[]) =>
    t
      .http()
      .post(`/api/groups/${g.id}/members`)
      .set(bearer(admin))
      .send({ studentIds: who.map((s) => s.id) })
      .expect(201);
  const sessions = async (token: string, query = `classId=${base.classId}`) =>
    (
      await t
        .http()
        .get(`/api/timetable/occurrences?${query}&from=${WEEK.from}&to=${WEEK.to}`)
        .set(bearer(token))
        .expect(200)
    ).body as TimetableOccurrenceDto[];
  const cleanup = async () => {
    await t.prisma.timetableSlot.deleteMany({
      where: { classSubject: { classId: base.classId }, startTime: { gte: '17:00' } },
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    const p = t.prisma;
    const klass = await p.schoolClass.findFirstOrThrow({
      where: { code: 'terminale', section: { code: 'bac' }, schoolYear: { isCurrent: true } },
    });
    base.classId = klass.id;
    const cs = async (subjectId: string) =>
      p.classSubject.findUniqueOrThrow({
        where: { classId_subjectId: { classId: klass.id, subjectId } },
        include: { assignments: true },
      });
    const [maths, phys, french] = await Promise.all([cs('mathematiques'), cs('physique-chimie'), cs('francais')]);
    base.csMaths = maths.id;
    base.csPhys = phys.id;
    base.csFrench = french.id;
    base.hany = maths.assignments[0]!.teacherId;
    base.sherif = phys.assignments[0]!.teacherId;
    base.claire = french.assignments[0]!.teacherId;
    const room = async (name: string, capacity: number) => {
      const r = await p.room.create({ data: { name, capacity, kind: 'classroom' } });
      extraRooms.push(r.id);
      return r.id;
    };
    base.r1 = await room('E2E TG 1', 30);
    base.r2 = await room('E2E TG 2', 30);
    base.r3 = await room('E2E TG 3', 30);
    base.cours = (await p.activityType.findUniqueOrThrow({ where: { code: 'cours' } })).id;
    students = (
      await p.enrollment.findMany({
        where: { classId: klass.id, leftOn: null },
        orderBy: { student: { user: { email: 'asc' } } },
        include: { student: { include: { user: true } } },
      })
    ).map((e) => ({ id: e.studentId, email: e.student.user.email }));
  });

  beforeEach(async () => {
    groupA = await mkGroup('TP', 'E2E TP A');
    groupB = await mkGroup('TP', 'E2E TP B');
    lv2 = await mkGroup('LV2', 'E2E Allemand');
    await add(groupA, students.slice(0, 5));
    await add(groupB, students.slice(5, 10));
  });
  afterEach(async () => {
    await cleanup();
    await t.prisma.group.deleteMany({ where: { id: { in: groupIds } } });
    groupIds.length = 0;
  });
  afterAll(async () => {
    await t.prisma.room.deleteMany({ where: { id: { in: extraRooms } } });
    await t.close();
  });

  it('lets the groups of one division run at the same time, and derives the division from the group', async () => {
    const a = await create({ groupId: groupA.id });
    expect(a).toMatchObject({ groupId: groupA.id, groupLabel: 'E2E TP A', division: 'TP' });
    const b = await create({
      groupId: groupB.id,
      classSubjectId: base.csPhys,
      teacherId: base.sherif,
      roomId: base.r2,
    });
    expect(b.division).toBe('TP');
    // A client from phase 2 sends only a division: it still works, and the groups still share it.
    await create({
      division: 'TP',
      classSubjectId: base.csFrench,
      teacherId: base.claire,
      roomId: base.r3,
    });
  });

  it('still refuses every other overlap of a class with a group', async () => {
    await create({ groupId: groupA.id });
    const other = {
      classSubjectId: base.csPhys,
      teacherId: base.sherif,
      roomId: base.r2,
    };
    // The whole class at the same time.
    const whole = await post(slot(other));
    expect(whole.status).toBe(409);
    expect(blocked(whole.body).conflicts.map((c) => c.kind)).toContain('class');
    // A group of another division.
    expect((await post(slot({ ...other, groupId: lv2.id }))).status).toBe(409);
    // The same group in two places at once, even with another teacher and room.
    const same = await post(slot({ ...other, groupId: groupA.id }));
    expect(same.status).toBe(409);
    expect(blocked(same.body).conflicts.map((c) => c.kind)).toContain('class');
    // The room and the teacher stay exclusive inside a division.
    expect((await post(slot({ groupId: groupB.id, classSubjectId: base.csPhys, teacherId: base.sherif }))).status).toBe(409);
  });

  it('refuses a division that is not the group’s, and a group of another class', async () => {
    const wrong = await post(slot({ groupId: groupA.id, division: 'LV2' }));
    expect(wrong.status).toBe(400);
    expect(message(wrong.body)).toContain('division');
    const foreign = await t.prisma.group.findFirstOrThrow({ where: { schoolClass: { code: 'premiere' } } });
    const other = await post(slot({ groupId: foreign.id }));
    expect(other.status).toBe(400);
    expect(message(other.body)).toContain('groupe de la classe');
    const same = await post(slot({ groupId: groupA.id, division: 'TP' }));
    expect(same.status).toBe(201);
  });

  it('shows a student the sessions of their group and of the whole class, nothing else', async () => {
    await create({ groupId: groupA.id });
    await create({ groupId: groupB.id, classSubjectId: base.csPhys, teacherId: base.sherif, roomId: base.r2 });
    await create({ weekday: 2, classSubjectId: base.csFrench, teacherId: base.claire, roomId: base.r3 });
    const inA = await t.token(students[0]!.email);
    const inB = await t.token(students[9]!.email);
    const label = (o: TimetableOccurrenceDto) => o.groupLabel ?? 'classe';
    const seenA = (await sessions(inA)).filter((o) => o.current.startTime === '17:00').map(label).sort();
    const seenB = (await sessions(inB)).filter((o) => o.current.startTime === '17:00').map(label).sort();
    expect(seenA).toEqual(['E2E TP A', 'classe']);
    expect(seenB).toEqual(['E2E TP B', 'classe']);
    // Staff see everything of the class.
    expect((await sessions(admin)).filter((o) => o.current.startTime === '17:00')).toHaveLength(3);
    // A student who joins another group sees that one's sessions from then on.
    await t.http().delete(`/api/groups/${groupB.id}/members/${students[9]!.id}`).set(bearer(admin)).expect(200);
    await t
      .http()
      .post(`/api/groups/${groupA.id}/members`)
      .set(bearer(admin))
      .send({ studentIds: [students[9]!.id] })
      .expect(201);
    const after = (await sessions(inB)).filter((o) => o.current.startTime === '17:00').map(label).sort();
    expect(after).toEqual(['E2E TP A', 'classe']);
  });

  it('warns about a room that is too small for the group, not for the class', async () => {
    const small = await t.prisma.room.create({ data: { name: 'E2E TG petite', capacity: 6, kind: 'classroom' } });
    extraRooms.push(small.id);
    const check = async (over: Partial<TimetableSlotInput>) => {
      const { acknowledgedWarnings: _ack, ...input } = slot({ roomId: small.id, ...over }) as TimetableSlotInput & {
        acknowledgedWarnings?: unknown;
      };
      return (
        await t.http().post('/api/timetable/check').set(bearer(admin)).send({ slot: input }).expect(200)
      ).body as TimetableCheckResult;
    };
    // Ten students in the class, 6 seats: the whole class does not fit.
    const whole = await check({});
    expect(whole.warnings.map((w) => w.code)).toContain('room_capacity');
    expect(whole.warnings.find((w) => w.code === 'room_capacity')!.message).toContain('10 élèves');
    // A group of five fits.
    const five = await check({ groupId: groupA.id });
    expect(five.warnings.map((w) => w.code)).not.toContain('room_capacity');
    // A group of eight does not, and the message names the group and counts its members.
    const big = await mkGroup('E2E gros', 'E2E gros');
    await add(big, students.slice(0, 8));
    const crowded = await check({ groupId: big.id });
    const w = crowded.warnings.find((x) => x.code === 'room_capacity');
    expect(w?.message).toContain('8 élèves');
    expect(w?.message).toContain('E2E gros');
  });

  it('keeps a group that has sessions: no delete, no new division; the series can change group', async () => {
    const a = await create({ groupId: groupA.id });
    const del = await t.http().delete(`/api/groups/${groupA.id}`).set(bearer(admin)).expect(409);
    expect(message(del.body)).toContain('séances');
    const division = await t
      .http()
      .patch(`/api/groups/${groupA.id}`)
      .set(bearer(admin))
      .send({ division: 'LV2' })
      .expect(409);
    expect(message(division.body)).toContain('séances');
    await t.http().patch(`/api/groups/${groupA.id}`).set(bearer(admin)).send({ label: 'E2E TP Alpha' }).expect(200);
    const moved = await t
      .http()
      .patch(`/api/timetable/slots/${a.id}`)
      .set(bearer(admin))
      .send({ scope: 'all', changes: { groupId: groupB.id }, acknowledgedWarnings: ACK })
      .expect(200);
    expect((moved.body as TimetableWriteResult).slot).toMatchObject({ groupId: groupB.id, division: 'TP' });
    // Without a group the series is the whole class again.
    const whole = await t
      .http()
      .patch(`/api/timetable/slots/${(moved.body as TimetableWriteResult).slot!.id}`)
      .set(bearer(admin))
      .send({ scope: 'all', changes: { groupId: null }, acknowledgedWarnings: ACK });
    expect(whole.status, message(whole.body)).toBe(200);
    expect((whole.body as TimetableWriteResult).slot).toMatchObject({ groupId: null, division: null });
  });

  it('lets a timed test for one group run beside the parallel group, and still clashes with its own', async () => {
    // TP A has a lesson on Mondays 17:00. A test for TP B at that time only holds the TP division of the class.
    await create({ groupId: groupA.id });
    const teacher = await t.token(MATHS_TEACHER);
    const controle = (await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'controle' } })).id;
    const made: string[] = [];
    const test = async (groupIds: string[]) => {
      const res = await t
        .http()
        .post('/api/events')
        .set(bearer(teacher))
        .send({
          activityTypeId: controle,
          title: 'E2E contrôle de groupe',
          subjectId: 'mathematiques',
          classId: base.classId,
          date: '2027-03-08',
          startTime: '17:00',
          endTime: '18:00',
          target: { groupIds, studentIds: [] },
        });
      if (res.status === 201) made.push((res.body as { id: string }).id);
      return res;
    };
    try {
      expect((await test([groupB.id])).status).toBe(201);
      const rows = await t.prisma.occupancy.findMany({ where: { eventId: made[0] } });
      expect(rows).toMatchObject([{ divisionKey: 'TP', groupId: groupB.id }]);
      // The same group twice, the whole class, and another division all still clash with the lesson.
      expect((await test([groupA.id])).status).toBe(409);
      expect((await test([])).status).toBe(409);
      expect((await test([lv2.id])).status).toBe(409);
    } finally {
      await t.prisma.event.deleteMany({ where: { id: { in: made } } });
    }
  });

  it('lets only the structure editors put a group on a session', async () => {
    for (const email of [MATHS_TEACHER, FRENCH_TEACHER]) {
      const token = await t.token(email);
      const res = await t
        .http()
        .post('/api/timetable/slots')
        .set(bearer(token))
        .send(slot({ groupId: groupA.id }));
      expect(res.status).toBe(403);
    }
  });
});
