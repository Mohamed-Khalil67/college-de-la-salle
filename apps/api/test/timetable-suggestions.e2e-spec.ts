import type {
  TimetableBlockedError,
  TimetableCheckResult,
  TimetableRoomSuggestionDto,
  TimetableSlotInput,
  TimetableSuggestionDto,
  TimetableTimeSuggestionDto,
  TimetableWriteResult,
} from '@cdls/shared';
import { addDays, weekday } from '@cdls/shared';
import { toDay } from '../src/common/dates.js';
import {
  activityTypeId,
  ADMIN,
  bearer,
  createTestApp,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  type TestApp,
} from './helpers.js';

const blocked = (body: unknown) => body as TimetableBlockedError;
const rooms = (list: readonly TimetableSuggestionDto[]) =>
  list.filter((s): s is TimetableRoomSuggestionDto => s.kind === 'room');
const times = (list: readonly TimetableSuggestionDto[]) =>
  list.filter((s): s is TimetableTimeSuggestionDto => s.kind === 'time');

/** The fields a suggestion may carry: nothing about who holds the other rooms or times. */
const ROOM_KEYS = ['capacity', 'kind', 'label', 'roomId', 'roomKind', 'roomName', 'target'];
const TIME_KEYS = ['date', 'endTime', 'kind', 'label', 'startTime', 'target', 'weekday'];

/**
 * Suggestions on a hard conflict: free rooms of a compatible kind, the nearest free times in the periods
 * of the year (respecting holidays and group divisions); every one of them really is free, and a teacher
 * learns nothing about other people's sessions from them. The year of these tests starts after every
 * seeded year, so only the sessions made here occupy it.
 */
describe('Timetable suggestions (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let maths: string;
  const base = {} as {
    yearId: string;
    start: string;
    classA: string;
    classB: string;
    csMathsA: string;
    csFrenchA: string;
    csFrenchB: string;
    csPhysA: string;
    hany: string;
    claire: string;
    sherif: string;
    s1: string;
    s2: string;
    s3: string;
    lab: string;
    small: string;
    cours: string;
    tp: string;
    g1: string;
    g2: string;
  };

  const slot = (over: Partial<TimetableSlotInput> = {}): TimetableSlotInput => ({
    classSubjectId: base.csMathsA,
    teacherId: base.hany,
    roomId: base.s1,
    activityTypeId: base.cours,
    weekday: 1,
    startTime: '08:00',
    endTime: '09:00',
    validFrom: base.start,
    validTo: addDays(base.start, 120),
    weekParity: null,
    division: null,
    ...over,
  });
  const post = (token: string, body: object) =>
    t.http().post('/api/timetable/slots').set(bearer(token)).send(body);
  const check = async (token: string, body: object) =>
    (await t.http().post('/api/timetable/check').set(bearer(token)).send(body).expect(200))
      .body as TimetableCheckResult;
  const create = async (over: Partial<TimetableSlotInput> = {}) =>
    ((await post(admin, slot(over)).expect(201)).body as TimetableWriteResult).slot!;
  /** The day of this weekday in the `n`th week of the test year (week 0 holds its first day, a Sunday). */
  const dayOf = (n: number, wd: number) => addDays(base.start, 7 * n + wd);
  /** Saves; when only warnings stand in the way, acknowledges them. A hard conflict fails the test. */
  const save = async (send: (ack: object[]) => Promise<{ status: number; body: unknown }>) => {
    let res = await send([]);
    if (res.status === 409 && blocked(res.body).code === 'WARNINGS_NOT_ACKNOWLEDGED')
      res = await send(blocked(res.body).warnings.map((w) => ({ code: w.code, reason: 'Test' })));
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
  };

  const cleanup = () =>
    t.prisma.timetableSlot.deleteMany({
      where: { classSubject: { schoolClass: { schoolYearId: base.yearId } } },
    });

  /**
   * The periods of the year and who is busy (class B with Claire Dubois): Monday 08:00 in S1, 09:00 in S2,
   * 10:15 in S3; Tuesday 11:15 and 12:45 in S3; Sunday 09:00 in S2.
   */
  const background = async () => {
    const b = (wd: number, startTime: string, endTime: string, roomId: string) =>
      create({
        classSubjectId: base.csFrenchB,
        teacherId: base.claire,
        weekday: wd,
        startTime,
        endTime,
        roomId,
      });
    await b(1, '08:00', '09:00', base.s1);
    await b(1, '09:00', '10:00', base.s2);
    await b(1, '10:15', '11:15', base.s3);
    await b(2, '11:15', '12:15', base.s3);
    await b(2, '12:45', '13:45', base.s3);
    await b(0, '09:00', '10:00', base.s2);
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    maths = await t.token(MATHS_TEACHER);
    const p = t.prisma;
    const teacher = async (email: string) =>
      (await p.teacher.findFirstOrThrow({ where: { user: { email } } })).id;
    base.hany = await teacher(MATHS_TEACHER);
    base.claire = await teacher(FRENCH_TEACHER);
    base.sherif = await teacher('sherif.nassar@demo.cdls.test');
    const last = await p.schoolYear.findFirstOrThrow({ orderBy: { endsOn: 'desc' } });
    // The first Sunday at least a week after every other year.
    let start = addDays(toDay(last.endsOn), 7);
    while (weekday(start) !== 0) start = addDays(start, 1);
    base.start = start;
    const year = await p.schoolYear.create({
      data: {
        label: `SG ${start}`,
        startsOn: new Date(`${start}T00:00:00Z`),
        endsOn: new Date(`${addDays(start, 300)}T00:00:00Z`),
      },
    });
    base.yearId = year.id;
    const bac = await p.section.findFirstOrThrow({ where: { code: 'bac' } });
    const mk = async (code: string) =>
      (
        await p.schoolClass.create({
          data: { schoolYearId: year.id, sectionId: bac.id, code, label: `Classe ${code}` },
        })
      ).id;
    base.classA = await mk('sg-a');
    base.classB = await mk('sg-b');
    const cs = async (classId: string, subjectId: string, teacherId: string) =>
      (
        await p.classSubject.create({
          data: { classId, subjectId, assignments: { create: { teacherId } } },
        })
      ).id;
    base.csMathsA = await cs(base.classA, 'mathematiques', base.hany);
    base.csFrenchA = await cs(base.classA, 'francais', base.claire);
    base.csFrenchB = await cs(base.classB, 'francais', base.claire);
    base.csPhysA = await cs(base.classA, 'physique-chimie', base.sherif);
    const room = async (name: string, capacity: number, kind: 'classroom' | 'lab') =>
      (await p.room.create({ data: { name, capacity, kind } })).id;
    base.s1 = await room('SG Salle 1', 30, 'classroom');
    base.s2 = await room('SG Salle 2', 30, 'classroom');
    base.s3 = await room('SG Salle 3', 40, 'classroom');
    base.lab = await room('SG Labo', 30, 'lab');
    base.small = await room('SG Petite salle', 3, 'classroom');
    base.cours = await activityTypeId(p, 'cours');
    base.tp = await activityTypeId(p, 'tp');
    // Five students in class A: the room of 3 seats is too small for it.
    const students = await p.student.findMany({ take: 5, orderBy: { id: 'asc' } });
    for (const s of students)
      await p.enrollment.create({
        data: { studentId: s.id, classId: base.classA, schoolYearId: year.id },
      });
    const group = async (label: string) =>
      (await p.group.create({ data: { classId: base.classA, division: 'TP', label } })).id;
    base.g1 = await group('TP 1');
    base.g2 = await group('TP 2');
  });

  beforeEach(async () => {
    await cleanup();
    await background();
  });
  afterAll(async () => {
    await cleanup();
    await t.prisma.calendarDay.deleteMany({ where: { schoolYearId: base.yearId } });
    await t.close();
  });

  describe('a new series', () => {
    it('a taken room: free rooms that seat the class, and the nearest free times; each one saves', async () => {
      const res = await post(admin, slot()).expect(409);
      const body = blocked(res.body);
      expect(body.code).toBe('TIMETABLE_CONFLICT');
      expect(body.conflicts.map((c) => c.kind)).toEqual(['room']);

      const free = rooms(body.suggestions);
      expect(free.length).toBeGreaterThan(0);
      expect(free.length).toBeLessThanOrEqual(3);
      // Not the taken room, not the laboratory, not the room of 3 seats; classrooms that seat 5.
      expect(free.map((r) => r.roomId)).not.toContain(base.s1);
      expect(free.map((r) => r.roomId)).not.toContain(base.lab);
      expect(free.map((r) => r.roomId)).not.toContain(base.small);
      expect(free.every((r) => r.roomKind === 'classroom' && (r.capacity ?? 99) >= 5)).toBe(true);
      expect(free.every((r) => r.target === 'series')).toBe(true);

      // Monday 09:00 is the nearest period where Hany, class A and S1 are all free.
      const later = times(body.suggestions);
      expect(later[0]).toMatchObject({
        target: 'series',
        date: null,
        weekday: 1,
        startTime: '09:00',
        endTime: '10:00',
        label: 'le lundi, 09:00 – 10:00',
      });
      expect(later.length).toBeLessThanOrEqual(3);

      // The same answer from POST /timetable/check, and every suggestion really is free.
      const dry = await check(admin, { slot: slot() });
      expect(dry.canSave).toBe(false);
      expect(dry.suggestions).toEqual(body.suggestions);
      for (const r of free)
        expect((await check(admin, { slot: slot({ roomId: r.roomId }) })).canSave).toBe(true);
      for (const s of later)
        expect(
          (
            await check(admin, {
              slot: slot({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime }),
            })
          ).canSave,
        ).toBe(true);

      // Applying one saves.
      await save((ack) =>
        post(admin, { ...slot({ roomId: free[0]!.roomId }), acknowledgedWarnings: ack }),
      );
    });

    it('a busy teacher: no other room (it would not help), times when she is free', async () => {
      const res = await post(
        admin,
        slot({ classSubjectId: base.csFrenchA, teacherId: base.claire, roomId: base.s2 }),
      ).expect(409);
      const body = blocked(res.body);
      expect(body.conflicts.map((c) => c.kind)).toEqual(['teacher']);
      expect(rooms(body.suggestions)).toEqual([]);
      // Claire teaches class B on Monday at 08:00, 09:00 and 10:15: the nearest free period is 11:15.
      const later = times(body.suggestions);
      expect(later.map((s) => `${s.weekday} ${s.startTime}`)).toEqual([
        '1 11:15',
        '1 12:45',
        '0 08:00',
      ]);
      await save((ack) =>
        post(admin, {
          ...slot({
            classSubjectId: base.csFrenchA,
            teacherId: base.claire,
            roomId: base.s2,
            startTime: '11:15',
            endTime: '12:15',
          }),
          acknowledgedWarnings: ack,
        }),
      );
    });

    it('a TP is offered laboratories only', async () => {
      // TP 2 holds the laboratory on Wednesdays at 08:00; TP 1 (same division) may run beside it, elsewhere.
      await create({
        classSubjectId: base.csPhysA,
        teacherId: base.sherif,
        roomId: base.lab,
        activityTypeId: base.tp,
        weekday: 3,
        groupId: base.g2,
      });
      const res = await post(
        admin,
        slot({ activityTypeId: base.tp, roomId: base.lab, weekday: 3, groupId: base.g1 }),
      ).expect(409);
      const body = blocked(res.body);
      expect(body.conflicts.map((c) => c.kind)).toEqual(['room']);
      const free = rooms(body.suggestions);
      expect(free.length).toBeGreaterThan(0);
      expect(free.every((r) => r.roomKind === 'lab')).toBe(true);
      expect(free.map((r) => r.roomId)).not.toContain(base.lab);
      await save((ack) =>
        post(admin, {
          ...slot({
            activityTypeId: base.tp,
            roomId: free[0]!.roomId,
            weekday: 3,
            groupId: base.g1,
          }),
          acknowledgedWarnings: ack,
        }),
      );
    });

    it('an edit of the whole series is suggested the same way', async () => {
      const mine = await create({ weekday: 4 });
      const res = await t
        .http()
        .patch(`/api/timetable/slots/${mine.id}`)
        .set(bearer(admin))
        .send({ scope: 'all', changes: { weekday: 1 } })
        .expect(409);
      const later = times(blocked(res.body).suggestions);
      expect(later[0]).toMatchObject({ weekday: 1, startTime: '09:00' });
      await save((ack) =>
        t
          .http()
          .patch(`/api/timetable/slots/${mine.id}`)
          .set(bearer(admin))
          .send({
            scope: 'all',
            changes: { weekday: 1, startTime: '09:00', endTime: '10:00' },
            acknowledgedWarnings: ack,
          }),
      );
    });
  });

  describe('group divisions', () => {
    beforeEach(async () => {
      // TP 1 of class A on Sunday at 08:00.
      await create({
        classSubjectId: base.csPhysA,
        teacherId: base.sherif,
        roomId: base.lab,
        activityTypeId: base.tp,
        weekday: 0,
        groupId: base.g1,
      });
    });

    it('a session of the other group of the division may go beside it; the whole class may not', async () => {
      // Sunday 09:00: Claire and S2 are taken (class B). The nearest period, 08:00, holds TP 1.
      const forGroup = await post(
        admin,
        slot({
          classSubjectId: base.csFrenchA,
          teacherId: base.claire,
          roomId: base.s2,
          weekday: 0,
          startTime: '09:00',
          endTime: '10:00',
          groupId: base.g2,
        }),
      ).expect(409);
      expect(times(blocked(forGroup.body).suggestions)[0]).toMatchObject({
        weekday: 0,
        startTime: '08:00',
      });

      const forClass = await post(
        admin,
        slot({
          classSubjectId: base.csFrenchA,
          teacherId: base.claire,
          roomId: base.s2,
          weekday: 0,
          startTime: '09:00',
          endTime: '10:00',
        }),
      ).expect(409);
      const later = times(blocked(forClass.body).suggestions);
      expect(later.some((s) => s.weekday === 0 && s.startTime === '08:00')).toBe(false);
      expect(later[0]).toMatchObject({ weekday: 0, startTime: '10:15' });

      await save((ack) =>
        post(admin, {
          ...slot({
            classSubjectId: base.csFrenchA,
            teacherId: base.claire,
            roomId: base.s2,
            weekday: 0,
            startTime: '08:00',
            endTime: '09:00',
            groupId: base.g2,
          }),
          acknowledgedWarnings: ack,
        }),
      );
    });
  });

  describe('one session, by its teacher', () => {
    const week = 3;
    let mine: { id: string };
    beforeEach(async () => {
      // Hany's own lesson on Wednesdays at 08:00 in S2; a holiday on the Tuesday of the test week.
      mine = await create({ roomId: base.s2, weekday: 3 });
      await t.prisma.calendarDay.deleteMany({ where: { schoolYearId: base.yearId } });
      await t.prisma.calendarDay.create({
        data: {
          schoolYearId: base.yearId,
          type: 'holiday',
          label: 'Congé de test',
          startsOn: new Date(`${dayOf(week, 2)}T00:00:00Z`),
          endsOn: new Date(`${dayOf(week, 2)}T00:00:00Z`),
        },
      });
    });
    const move = (token: string, over: object) =>
      t
        .http()
        .post(`/api/timetable/slots/${mine.id}/exceptions`)
        .set(bearer(token))
        .send({ date: dayOf(week, 3), kind: 'moved', ...over });

    it('a move into a taken room: rooms and times of the same week, never on the holiday; applying one saves', async () => {
      const monday = dayOf(week, 1);
      const res = await move(maths, { newDate: monday, newStart: '09:00', newEnd: '10:00' }).expect(
        409,
      );
      const body = blocked(res.body);
      expect(body.conflicts.map((c) => c.kind)).toEqual(['room']);
      const later = times(body.suggestions);
      // S2 is free on that Monday at 08:00 (class B is in S1 then).
      expect(later[0]).toMatchObject({
        target: 'session',
        date: monday,
        startTime: '08:00',
        endTime: '09:00',
      });
      const sunday = dayOf(week, 0);
      expect(later.every((s) => s.date! >= sunday && s.date! <= addDays(sunday, 6))).toBe(true);
      expect(later.some((s) => s.date === dayOf(week, 2))).toBe(false);

      for (const s of later)
        expect(
          (
            await check(maths, {
              slotId: mine.id,
              scope: 'this',
              date: dayOf(week, 3),
              exception: {
                kind: 'moved',
                newDate: s.date,
                newStart: s.startTime,
                newEnd: s.endTime,
              },
            })
          ).canSave,
        ).toBe(true);
      const free = rooms(body.suggestions);
      expect(free.length).toBeGreaterThan(0);
      expect(free.every((r) => r.target === 'session')).toBe(true);
      for (const r of free)
        expect(
          (
            await check(maths, {
              slotId: mine.id,
              scope: 'this',
              date: dayOf(week, 3),
              exception: {
                kind: 'moved',
                newDate: monday,
                newStart: '09:00',
                newEnd: '10:00',
                newRoomId: r.roomId,
              },
            })
          ).canSave,
        ).toBe(true);

      await save((ack) =>
        move(maths, {
          newDate: later[0]!.date,
          newStart: later[0]!.startTime,
          newEnd: later[0]!.endTime,
          acknowledgedWarnings: ack,
        }),
      );
    });

    it('a room change into a taken room offers rooms only, each one free', async () => {
      // Class B in S3 on Wednesdays at 08:00, when Hany teaches class A in S2.
      await create({
        classSubjectId: base.csFrenchB,
        teacherId: base.claire,
        roomId: base.s3,
        weekday: 3,
      });
      const date = dayOf(week, 3);
      const change = (token: string, newRoomId: string, ack: object[] = []) =>
        t
          .http()
          .post(`/api/timetable/slots/${mine.id}/exceptions`)
          .set(bearer(token))
          .send({ date, kind: 'room_change', newRoomId, acknowledgedWarnings: ack });
      const res = await change(maths, base.s3).expect(409);
      const ways = blocked(res.body).suggestions;
      expect(times(ways)).toEqual([]);
      const free = rooms(ways);
      expect(free.length).toBeGreaterThan(0);
      expect(free.map((r) => r.roomId)).not.toContain(base.s3);
      // S2 is not « another » room: it is the session's own.
      expect(free.map((r) => r.roomId)).not.toContain(base.s2);
      for (const r of free)
        expect(
          (
            await check(maths, {
              slotId: mine.id,
              scope: 'this',
              date,
              exception: { kind: 'room_change', newRoomId: r.roomId },
            })
          ).canSave,
        ).toBe(true);
      await save((ack) => change(maths, free[0]!.roomId, ack));
    });

    it('tells a teacher nothing about other people beyond the conflict itself', async () => {
      const res = await move(maths, {
        newDate: dayOf(week, 1),
        newStart: '09:00',
        newEnd: '10:00',
      }).expect(409);
      const body = blocked(res.body);
      expect(body.suggestions.length).toBeGreaterThan(0);
      for (const s of body.suggestions)
        expect(Object.keys(s).sort()).toEqual(s.kind === 'room' ? ROOM_KEYS : TIME_KEYS);
      // Who holds S2 (Claire, class B, their slot) is only in the conflict, as before; never in the suggestions.
      const text = JSON.stringify(body.suggestions);
      const theirs = await t.prisma.timetableSlot.findMany({
        where: { classSubjectId: base.csFrenchB },
        select: { id: true },
      });
      for (const word of [
        'Dubois',
        'Claire',
        'sg-b',
        base.claire,
        base.classB,
        ...theirs.map((s) => s.id),
      ])
        expect(text).not.toContain(word);

      // Another teacher's session, or a series: refused before anything is suggested.
      const theirSlot = theirs[0]!.id;
      await t
        .http()
        .post('/api/timetable/check')
        .set(bearer(maths))
        .send({
          slotId: theirSlot,
          scope: 'this',
          date: dayOf(week, 1),
          exception: { kind: 'moved', newStart: '11:15', newEnd: '12:15' },
        })
        .expect(403);
      await t
        .http()
        .post('/api/timetable/check')
        .set(bearer(maths))
        .send({ slot: slot() })
        .expect(403);
      await t
        .http()
        .post('/api/timetable/check')
        .set(bearer(maths))
        .send({ slotId: mine.id, scope: 'all', changes: { weekday: 1 } })
        .expect(403);
    });
  });
});
