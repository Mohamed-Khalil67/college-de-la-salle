import {
  addDays,
  ABSENCE_MAX_CHOICES,
  type AbsencePreviewDto,
  type ApplyAbsenceResult,
  type PlannerRoomsNowDto,
  type PlannerTeacherDto,
  type PlannerTimetablesDto,
  type PlannerTodayDto,
  type TimetableWarningDto,
  weekday,
} from '@cdls/shared';
import { schoolToday } from '../src/common/dates.js';
import {
  ADMIN,
  bearer,
  createTestApp,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  PLANNER,
  studentOf,
  type TestApp,
} from './helpers.js';

const TODAY = schoolToday();
const day = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * The planner's page and « Professeur absent »: admin or planner only; the lessons of an absent teacher with
 * who is free; one transaction for all the choices (a clash writes nothing); audit rows and notifications
 * with the change.
 */
describe('Planner (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let planner: string;
  let maths: string;
  let student: string;
  let mathsTeacherId: string;
  let since: Date;
  /** A window a month ahead, away from the sessions other specs touch. */
  const from = addDays(TODAY, 28);
  const to = addDays(TODAY, 34);

  const preview = async (token = planner, teacherId = mathsTeacherId) =>
    (
      await t
        .http()
        .get('/api/planner/absence')
        .query({ teacherId, from, to })
        .set(bearer(token))
        .expect(200)
    ).body as AbsencePreviewDto;

  /** Puts every session of the window back to the weekly rule (through the API so the index follows). */
  async function restoreAll(): Promise<void> {
    const rows = await t.prisma.slotException.findMany({
      where: { date: { gte: day(from), lte: day(to) } },
    });
    for (const ex of rows)
      await t.http().delete(`/api/timetable/exceptions/${ex.id}`).set(bearer(admin)).expect(200);
  }

  beforeAll(async () => {
    since = new Date(Date.now() - 2000);
    t = await createTestApp();
    admin = await t.token(ADMIN);
    planner = await t.token(PLANNER);
    maths = await t.token(MATHS_TEACHER);
    student = await t.token((await studentOf(t.prisma, 'bac', 'premiere')).email);
    mathsTeacherId = (
      await t.prisma.teacher.findFirstOrThrow({ where: { user: { email: MATHS_TEACHER } } })
    ).id;
  });

  afterAll(async () => {
    await restoreAll();
    await t.prisma.notification.deleteMany({ where: { createdAt: { gte: since } } });
    await t.close();
  });

  describe('who may use it', () => {
    it('refuses a student and a teacher who is not planner, accepts the planner and the admin', async () => {
      const french = await t.token(FRENCH_TEACHER);
      for (const [token, status] of [
        [student, 403],
        [maths, 403],
        [french, 403],
        [planner, 200],
        [admin, 200],
      ] as const) {
        await t.http().get('/api/planner/today').set(bearer(token)).expect(status);
        await t.http().get('/api/planner/rooms-now').set(bearer(token)).expect(status);
        await t.http().get('/api/planner/timetables').set(bearer(token)).expect(status);
        await t.http().get('/api/planner/teachers').set(bearer(token)).expect(status);
      }
      await t
        .http()
        .get('/api/planner/absence')
        .query({ teacherId: mathsTeacherId, from, to })
        .set(bearer(maths))
        .expect(403);
      await t
        .http()
        .post('/api/planner/absence')
        .set(bearer(maths))
        .send({ teacherId: mathsTeacherId, from, to, choices: [] })
        .expect(403);
    });
  });

  describe('the lessons of an absent teacher', () => {
    it('lists the active teachers by name for a planner, who may not list users', async () => {
      const res = await t.http().get('/api/planner/teachers').set(bearer(planner)).expect(200);
      const teachers = res.body as PlannerTeacherDto[];
      expect(teachers.length).toBeGreaterThan(1);
      expect(teachers.some((x) => x.teacherId === mathsTeacherId)).toBe(true);
      const names = teachers.map((x) => x.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
      await t.http().get('/api/users').set(bearer(planner)).expect(403);
    });

    it('lists them in order, with teachers free at that time and never the absent one', async () => {
      const result = await preview();
      expect(result.teacherId).toBe(mathsTeacherId);
      expect(result.sessions.length).toBeGreaterThan(2);
      const keys = result.sessions.map((s) => `${s.date} ${s.startTime}`);
      expect(keys).toEqual([...keys].sort());
      for (const s of result.sessions) {
        expect(s.freeTeachers.every((f) => f.teacherId !== mathsTeacherId)).toBe(true);
        const same = s.freeTeachers.map((f) => f.sameSubject);
        expect(same).toEqual([...same].sort((a, b) => Number(b) - Number(a)));
        expect(s.currentKind).toBeNull();
      }
    });

    it('refuses past days, a range over a month and an unknown teacher', async () => {
      await t
        .http()
        .get('/api/planner/absence')
        .query({ teacherId: mathsTeacherId, from: addDays(TODAY, -1), to })
        .set(bearer(planner))
        .expect(400);
      await t
        .http()
        .get('/api/planner/absence')
        .query({ teacherId: mathsTeacherId, from, to: addDays(from, 40) })
        .set(bearer(planner))
        .expect(400);
      await t
        .http()
        .get('/api/planner/absence')
        .query({ teacherId: '019e0000-0000-7000-8000-000000000000', from, to })
        .set(bearer(planner))
        .expect(404);
    });
  });

  describe('Professeur absent', () => {
    it('saves cancel, substitute and study together, tells the people concerned and audits it', async () => {
      const result = await preview();
      const [first, second, third] = result.sessions;
      const cover = second!.freeTeachers[0]!;
      const supervisor = third!.freeTeachers[0]!;
      const res = await t
        .http()
        .post('/api/planner/absence')
        .set(bearer(planner))
        .send({
          teacherId: mathsTeacherId,
          from,
          to,
          reason: 'Formation',
          choices: [
            { slotId: first!.slotId, date: first!.date, kind: 'cancelled' },
            {
              slotId: second!.slotId,
              date: second!.date,
              kind: 'substitute',
              teacherId: cover.teacherId,
            },
            {
              slotId: third!.slotId,
              date: third!.date,
              kind: 'study',
              teacherId: supervisor.teacherId,
            },
          ],
        })
        .expect(200);
      const body = res.body as ApplyAbsenceResult;
      expect([body.cancelled, body.substituted, body.study]).toEqual([1, 1, 1]);
      expect(body.notified).toBeGreaterThan(0);

      const saved = await t.prisma.slotException.findMany({
        where: { slotId: { in: [first!.slotId, second!.slotId, third!.slotId] } },
      });
      const kindOf = (slotId: string, date: string) =>
        saved.find((e) => e.slotId === slotId && e.date.getTime() === day(date).getTime())?.kind;
      expect(kindOf(first!.slotId, first!.date)).toBe('cancelled');
      expect(kindOf(second!.slotId, second!.date)).toBe('substitute');
      expect(kindOf(third!.slotId, third!.date)).toBe('study');
      expect(saved.find((e) => e.kind === 'study')?.newTeacherId).toBe(supervisor.teacherId);

      // One summary row and one row per lesson, written with the change.
      const audits = await t.prisma.auditLog.findMany({
        where: {
          createdAt: { gte: since },
          action: { in: ['teacher_absence.apply', 'slot_exception.upsert'] },
        },
      });
      expect(audits.filter((a) => a.action === 'teacher_absence.apply')).toHaveLength(1);
      expect(
        audits.filter((a) => a.action === 'slot_exception.upsert').length,
      ).toBeGreaterThanOrEqual(3);

      // The students and the covering teacher were told, with the right kind.
      const notes = await t.prisma.notification.findMany({
        where: {
          createdAt: { gte: since },
          kind: { in: ['session_cancelled', 'session_substituted', 'session_study'] },
        },
      });
      expect(new Set(notes.map((n) => n.kind))).toEqual(
        new Set(['session_cancelled', 'session_substituted', 'session_study']),
      );
      const coverUser = (
        await t.prisma.teacher.findUniqueOrThrow({ where: { id: cover.teacherId } })
      ).userId;
      expect(notes.some((n) => n.userId === coverUser && n.kind === 'session_substituted')).toBe(
        true,
      );

      // The day's page now lists them, students told.
      const today = (
        await t
          .http()
          .get('/api/planner/today')
          .query({ date: first!.date })
          .set(bearer(admin))
          .expect(200)
      ).body as PlannerTodayDto;
      const change = today.changes.find((c) => c.slotId === first!.slotId);
      expect(change).toMatchObject({ kind: 'cancelled', notified: true });

      // The preview now says what each lesson is.
      const again = await preview();
      expect(
        again.sessions.find((s) => s.slotId === first!.slotId && s.date === first!.date)
          ?.currentKind,
      ).toBe('cancelled');
      await restoreAll();
    });

    it('writes nothing when one choice clashes (a covering teacher already busy)', async () => {
      const result = await preview();
      const [first, second] = result.sessions;
      const free = new Set(second!.freeTeachers.map((f) => f.teacherId));
      const busy = await t.prisma.teacher.findFirstOrThrow({
        where: { id: { notIn: [mathsTeacherId, ...free] }, user: { status: 'active' } },
      });
      const before = await t.prisma.slotException.count();
      const notesBefore = await t.prisma.notification.count();
      const res = await t
        .http()
        .post('/api/planner/absence')
        .set(bearer(planner))
        .send({
          teacherId: mathsTeacherId,
          from,
          to,
          choices: [
            { slotId: first!.slotId, date: first!.date, kind: 'cancelled' },
            { slotId: second!.slotId, date: second!.date, kind: 'substitute', teacherId: busy.id },
          ],
        })
        .expect(409);
      expect((res.body as { code: string }).code).toBe('TIMETABLE_CONFLICT');
      expect(await t.prisma.slotException.count()).toBe(before);
      expect(await t.prisma.notification.count()).toBe(notesBefore);
    });

    it('refuses a missing cover, a lesson of another teacher, a session out of the dates and a duplicate', async () => {
      const result = await preview();
      const first = result.sessions[0]!;
      const send = (choices: object[], extra: object = {}) =>
        t
          .http()
          .post('/api/planner/absence')
          .set(bearer(planner))
          .send({ teacherId: mathsTeacherId, from, to, choices, ...extra });
      await send([{ slotId: first.slotId, date: first.date, kind: 'substitute' }]).expect(400);
      await send([{ slotId: first.slotId, date: first.date, kind: 'study' }]).expect(400);
      await send([
        { slotId: first.slotId, date: first.date, kind: 'substitute', teacherId: mathsTeacherId },
      ]).expect(400);
      await send([{ slotId: first.slotId, date: addDays(to, 3), kind: 'cancelled' }]).expect(400);
      await send([
        { slotId: first.slotId, date: first.date, kind: 'cancelled' },
        { slotId: first.slotId, date: first.date, kind: 'cancelled' },
      ]).expect(400);
      const other = await t.prisma.timetableSlot.findFirstOrThrow({
        where: { teacherId: { not: mathsTeacherId } },
      });
      await send([{ slotId: other.id, date: first.date, kind: 'cancelled' }]).expect(400);
      await send([], {}).expect(400);
      await send([{ slotId: first.slotId, date: first.date, kind: 'cancelled' }], {
        from: addDays(TODAY, -2),
      }).expect(400);
    });

    it('refuses a cover or a study on a lesson already moved or re-roomed, but still cancels it', async () => {
      const [first] = (await preview()).sessions;
      const free = (
        await t
          .http()
          .get('/api/timetable/free-rooms')
          .query({ date: first!.date, startTime: first!.startTime, endTime: first!.endTime })
          .set(bearer(admin))
          .expect(200)
      ).body as { id: string }[];
      const room = free.find((r) => r.id !== first!.roomId)!;
      expect(room).toBeTruthy();
      await t
        .http()
        .post(`/api/timetable/slots/${first!.slotId}/exceptions`)
        .set(bearer(admin))
        .send({ date: first!.date, kind: 'room_change', newRoomId: room.id })
        .expect(201);
      const supervisor = (await preview()).sessions.find(
        (x) => x.slotId === first!.slotId && x.date === first!.date,
      )!.freeTeachers[0]!;
      const send = (kind: string) =>
        t
          .http()
          .post('/api/planner/absence')
          .set(bearer(planner))
          .send({
            teacherId: mathsTeacherId,
            from,
            to,
            choices: [
              { slotId: first!.slotId, date: first!.date, kind, teacherId: supervisor.teacherId },
            ],
          });
      for (const kind of ['substitute', 'study']) {
        const res = await send(kind).expect(400);
        expect((res.body as { message: string }).message).toContain('rétablissez-la d’abord');
      }
      await t
        .http()
        .post('/api/planner/absence')
        .set(bearer(planner))
        .send({
          teacherId: mathsTeacherId,
          from,
          to,
          choices: [{ slotId: first!.slotId, date: first!.date, kind: 'cancelled' }],
        })
        .expect(200);
      await restoreAll();
    });

    it('refuses a cover or supervisor whose account is not active', async () => {
      const [first] = (await preview()).sessions;
      const cover = first!.freeTeachers[0]!;
      const teacher = await t.prisma.teacher.findUniqueOrThrow({ where: { id: cover.teacherId } });
      await t.prisma.user.update({ where: { id: teacher.userId }, data: { status: 'disabled' } });
      try {
        const res = await t
          .http()
          .post('/api/planner/absence')
          .set(bearer(planner))
          .send({
            teacherId: mathsTeacherId,
            from,
            to,
            choices: [
              {
                slotId: first!.slotId,
                date: first!.date,
                kind: 'substitute',
                teacherId: cover.teacherId,
              },
            ],
          })
          .expect(400);
        expect((res.body as { message: string }).message).toContain('plus actif');
      } finally {
        await t.prisma.user.update({ where: { id: teacher.userId }, data: { status: 'active' } });
      }
    });

    it('a study in a room someone holds is a 409 and writes nothing; taking a study away tells the supervisor', async () => {
      const [first] = (await preview()).sessions;
      const busy = await t.prisma.$queryRaw<{ room_id: string }[]>`
        SELECT o.room_id FROM occupancy o
        WHERE o.room_id IS NOT NULL AND o.room_id IS DISTINCT FROM ${first!.roomId}::uuid
          AND o.during && tsrange(${`${first!.date} ${first!.startTime}`}::timestamp, ${`${first!.date} ${first!.endTime}`}::timestamp)
        LIMIT 1`;
      expect(busy[0]).toBeTruthy();
      const supervisor = first!.freeTeachers[0]!;
      const body = (roomId?: string) => ({
        teacherId: mathsTeacherId,
        from,
        to,
        choices: [
          {
            slotId: first!.slotId,
            date: first!.date,
            kind: 'study',
            teacherId: supervisor.teacherId,
            roomId,
          },
        ],
      });
      const before = await t.prisma.slotException.count();
      const clash = await t
        .http()
        .post('/api/planner/absence')
        .set(bearer(planner))
        .send(body(busy[0]!.room_id))
        .expect(409);
      expect((clash.body as { code: string }).code).toBe('TIMETABLE_CONFLICT');
      expect(await t.prisma.slotException.count()).toBe(before);

      await t.http().post('/api/planner/absence').set(bearer(planner)).send(body()).expect(200);
      const supervisorUser = (
        await t.prisma.teacher.findUniqueOrThrow({ where: { id: supervisor.teacherId } })
      ).userId;
      const ex = await t.prisma.slotException.findFirstOrThrow({
        where: { slotId: first!.slotId, date: day(first!.date), kind: 'study' },
      });
      await t.http().delete(`/api/timetable/exceptions/${ex.id}`).set(bearer(admin)).expect(200);
      const told = await t.prisma.notification.findMany({
        where: { userId: supervisorUser, kind: 'session_restored', createdAt: { gte: since } },
      });
      expect(told.length).toBeGreaterThan(0);
    });

    it('commits the most choices allowed in one transaction within the timeout, and refuses one more', async () => {
      // The demo teacher has about a dozen lessons in two weeks: give them evening lessons (12 a day, Sunday to Thursday)
      // so that two weeks hold well over the limit. Removed in the end, with their exceptions.
      const classSubject = await t.prisma.classSubject.findFirstOrThrow({
        where: { assignments: { some: { teacherId: mathsTeacherId } } },
      });
      const type = await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'cours' } });
      const ids: string[] = [];
      for (let weekday = 0; weekday <= 4; weekday++)
        for (let k = 0; k < 12; k++) {
          const start = 18 * 60 + k * 20;
          const clock = (m: number) =>
            `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          ids.push(
            (
              await t.prisma.timetableSlot.create({
                data: {
                  classSubjectId: classSubject.id,
                  teacherId: mathsTeacherId,
                  activityTypeId: type.id,
                  weekday,
                  startTime: clock(start),
                  endTime: clock(start + 20),
                  validFrom: day(addDays(from, -1)),
                  validTo: day(addDays(from, 20)),
                },
              })
            ).id,
          );
        }
      const wide = addDays(from, 13);
      try {
        const all = (
          await t
            .http()
            .get('/api/planner/absence')
            .query({ teacherId: mathsTeacherId, from, to: wide })
            .set(bearer(planner))
            .expect(200)
        ).body as AbsencePreviewDto;
        const choices = all.sessions
          .slice(0, ABSENCE_MAX_CHOICES)
          .map((x) => ({ slotId: x.slotId, date: x.date, kind: 'cancelled' }));
        expect(choices).toHaveLength(ABSENCE_MAX_CHOICES);
        const started = Date.now();
        const res = await t
          .http()
          .post('/api/planner/absence')
          .set(bearer(planner))
          .send({ teacherId: mathsTeacherId, from, to: wide, choices })
          .expect(200);
        expect((res.body as ApplyAbsenceResult).cancelled).toBe(ABSENCE_MAX_CHOICES);
        expect(Date.now() - started).toBeLessThan(20_000);
        const tooMany = Array.from({ length: ABSENCE_MAX_CHOICES + 1 }, () => choices[0]!);
        await t
          .http()
          .post('/api/planner/absence')
          .set(bearer(planner))
          .send({ teacherId: mathsTeacherId, from, to: wide, choices: tooMany })
          .expect(400);
      } finally {
        await t.prisma.timetableSlot.deleteMany({ where: { id: { in: ids } } });
        await t.prisma.notification.deleteMany({ where: { createdAt: { gte: since } } });
      }
    });

    it('the database refuses a study without a supervisor', async () => {
      const slot = await t.prisma.timetableSlot.findFirstOrThrow({
        where: { teacherId: mathsTeacherId },
      });
      await expect(
        t.prisma.slotException.create({
          data: { slotId: slot.id, date: day(addDays(TODAY, 60)), kind: 'study' },
        }),
      ).rejects.toThrow();
      await expect(
        t.prisma.slotException.create({
          data: {
            slotId: slot.id,
            date: day(addDays(TODAY, 60)),
            kind: 'study',
            newTeacherId: mathsTeacherId,
            newStart: '08:00',
            newEnd: '09:00',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('the blocks of the page', () => {
    it('lists the rooms free now with the time they stay free', async () => {
      const res = (await t.http().get('/api/planner/rooms-now').set(bearer(planner)).expect(200))
        .body as PlannerRoomsNowDto;
      expect(res.date).toBe(TODAY);
      expect(res.time).toMatch(/^\d\d:\d\d$/);
      expect(res.total).toBeGreaterThan(0);
      expect(res.free.length).toBeLessThanOrEqual(res.total);
      for (const r of res.free)
        expect(r.freeUntil === null || /^\d\d:\d\d$/.test(r.freeUntil)).toBe(true);
    });

    it('says how complete the timetable is, class by class', async () => {
      const res = (await t.http().get('/api/planner/timetables').set(bearer(planner)).expect(200))
        .body as PlannerTimetablesDto;
      expect(res.yearLabel).toBeTruthy();
      expect(res.classes.length).toBeGreaterThan(0);
      expect(res.teachersTotal).toBeGreaterThan(0);
      expect(res.teachersPlaced).toBeLessThanOrEqual(res.teachersTotal);
      for (const c of res.classes) expect(c.complete).toBe(c.missing.length === 0);
    });

    it("gives the whole school's warnings when no class, teacher or room is asked", async () => {
      const res = await t
        .http()
        .get('/api/timetable/warnings')
        .query({ from: TODAY, to: addDays(TODAY, 13) })
        .set(bearer(planner))
        .expect(200);
      expect(Array.isArray(res.body as TimetableWarningDto[])).toBe(true);
      await t
        .http()
        .get('/api/timetable/warnings')
        .query({ from: TODAY, to: addDays(TODAY, 40) })
        .set(bearer(planner))
        .expect(400);
      await t
        .http()
        .get('/api/timetable/warnings')
        .query({ from: TODAY, to: addDays(TODAY, 13) })
        .set(bearer(maths))
        .expect(403);
    });
  });

  describe('a moved lesson in the changes of a day', () => {
    it('is listed once, on the day it moved to, with what it was before', async () => {
      await restoreAll();
      const lesson = (await preview()).sessions.find((s) => s.currentKind === null)!;
      // Another school day of the following fortnight, in the evening, long after the school day: nothing clashes.
      // (A holiday refuses the move; the next day is tried.)
      let target = '';
      for (let i = 1; i <= 13 && !target; i++) {
        const candidate = addDays(lesson.date, i);
        if (weekday(candidate) > 4) continue;
        const res = await t
          .http()
          .post(`/api/timetable/slots/${lesson.slotId}/exceptions`)
          .set(bearer(admin))
          .send({ date: lesson.date, kind: 'moved', newDate: candidate, newStart: '21:30', newEnd: '22:30' });
        if (res.status === 201) target = candidate;
      }
      expect(target).not.toBe('');
      const on = async (date: string) =>
        (
          (
            await t
              .http()
              .get('/api/planner/today')
              .query({ date })
              .set(bearer(planner))
              .expect(200)
          ).body as PlannerTodayDto
        ).changes.filter((c) => c.slotId === lesson.slotId);

      const there = await on(target);
      expect(there).toHaveLength(1);
      expect(there[0]).toMatchObject({
        kind: 'moved',
        startTime: '21:30',
        endTime: '22:30',
        movedFrom: { date: lesson.date, startTime: lesson.startTime, endTime: lesson.endTime },
      });
      expect(await on(lesson.date)).toHaveLength(0);
      await restoreAll();
    });
  });
});
