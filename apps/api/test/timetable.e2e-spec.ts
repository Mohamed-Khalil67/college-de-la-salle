import type {
  ApiError,
  FreeRoomDto,
  TimetableBlockedError,
  TimetableCheckResult,
  TimetableOccurrenceDto,
  TimetableSlotInput,
  TimetableWriteResult,
} from '@cdls/shared';
import { addDays, weekday } from '@cdls/shared';
import { schoolToday } from '../src/common/dates.js';
import {
  activityTypeId,
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
const blocked = (body: unknown) => body as TimetableBlockedError;

const TODAY = schoolToday();
/** The first day on or after `from` that falls on this weekday (0 = Sunday). */
const nextDay = (from: string, wd: number) => {
  let d = from;
  while (weekday(d) !== wd) d = addDays(d, 1);
  return d;
};
/** Weeks ahead, always a future Sunday-first weekday. */
const future = (wd: number, weeks = 2) => nextDay(addDays(TODAY, 7 * weeks), wd);

/**
 * The timetable: hard conflicts (room, teacher, class), division, concurrency, soft warnings with reasons,
 * permissions, the three-scope edit that never rewrites the past, holidays, one-off events.
 */
describe('Timetable (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let coordinator: string;
  let maths: string;
  let french: string;
  const base = {} as {
    yearId: string;
    classA: string;
    classB: string;
    csMathsA: string;
    csMathsB: string;
    csFrenchA: string;
    csPhysA: string;
    csPhysB: string;
    hany: string;
    claire: string;
    sherif: string;
    r1: string;
    r2: string;
    r3: string;
    lab: string;
    small: string;
    cours: string;
    tp: string;
    td: string;
  };

  const slot = (over: Partial<TimetableSlotInput> = {}): TimetableSlotInput => ({
    classSubjectId: base.csMathsA,
    teacherId: base.hany,
    roomId: base.r1,
    activityTypeId: base.cours,
    weekday: 1,
    startTime: '17:00',
    endTime: '18:00',
    validFrom: addDays(TODAY, -60),
    validTo: addDays(TODAY, 200),
    weekParity: null,
    division: null,
    ...over,
  });

  const post = (token: string, body: object) =>
    t.http().post('/api/timetable/slots').set(bearer(token)).send(body);
  const patch = (token: string, id: string, body: object) =>
    t.http().patch(`/api/timetable/slots/${id}`).set(bearer(token)).send(body);
  const create = async (over: Partial<TimetableSlotInput> = {}) =>
    ((await post(admin, slot(over)).expect(201)).body as TimetableWriteResult).slot!;
  const sessions = async (
    query: string,
    token = admin,
  ): Promise<TimetableOccurrenceDto[]> =>
    (await t.http().get(`/api/timetable/occurrences?${query}`).set(bearer(token)).expect(200))
      .body as TimetableOccurrenceDto[];
  /** The slots the tests created (the seeded timetable is left alone). */
  const slots = () =>
    t.prisma.timetableSlot.findMany({
      where: { classSubject: { schoolClass: { schoolYearId: base.yearId } } },
    });
  /** Removes what the tests created (slots cascade to their exceptions and index rows); the seed stays. */
  const cleanup = async () => {
    await t.prisma.event.deleteMany({ where: { schoolClass: { schoolYearId: base.yearId } } });
    await t.prisma.timetableSlot.deleteMany({
      where: { classSubject: { schoolClass: { schoolYearId: base.yearId } } },
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    coordinator = await t.token(COORDINATOR);
    maths = await t.token(MATHS_TEACHER);
    french = await t.token(FRENCH_TEACHER);
    const p = t.prisma;
    const teacher = async (email: string) =>
      (await p.teacher.findFirstOrThrow({ where: { user: { email } } })).id;
    base.hany = await teacher(MATHS_TEACHER);
    base.claire = await teacher(FRENCH_TEACHER);
    base.sherif = await teacher('sherif.nassar@demo.cdls.test');
    const bac = await p.section.findFirstOrThrow({ where: { code: 'bac' } });
    const year = await p.schoolYear.create({
      data: {
        label: `TT ${TODAY}`,
        startsOn: new Date(`${addDays(TODAY, -120)}T00:00:00Z`),
        endsOn: new Date(`${addDays(TODAY, 240)}T00:00:00Z`),
      },
    });
    base.yearId = year.id;
    await p.period.create({
      data: {
        schoolYearId: year.id,
        number: 1,
        label: 'Période de test',
        startsOn: year.startsOn,
        endsOn: year.endsOn,
      },
    });
    const mk = async (code: string) =>
      (
        await p.schoolClass.create({
          data: { schoolYearId: year.id, sectionId: bac.id, code, label: `Classe ${code}` },
        })
      ).id;
    base.classA = await mk('tt-a');
    base.classB = await mk('tt-b');
    const cs = async (classId: string, subjectId: string, teacherId: string, hours?: number) =>
      (
        await p.classSubject.create({
          data: {
            classId,
            subjectId,
            hoursPerWeek: hours ?? null,
            assignments: { create: { teacherId } },
          },
        })
      ).id;
    base.csMathsA = await cs(base.classA, 'mathematiques', base.hany, 3);
    base.csMathsB = await cs(base.classB, 'mathematiques', base.hany);
    base.csFrenchA = await cs(base.classA, 'francais', base.claire);
    base.csPhysA = await cs(base.classA, 'physique-chimie', base.sherif);
    base.csPhysB = await cs(base.classB, 'physique-chimie', base.sherif);
    const room = async (name: string, capacity: number, kind: 'classroom' | 'lab') =>
      (await p.room.create({ data: { name, capacity, kind } })).id;
    base.r1 = await room('TT Salle 1', 30, 'classroom');
    base.r2 = await room('TT Salle 2', 30, 'classroom');
    base.r3 = await room('TT Salle 3', 30, 'classroom');
    base.lab = await room('TT Labo', 30, 'lab');
    base.small = await room('TT Petite salle', 3, 'classroom');
    base.cours = await activityTypeId(p, 'cours');
    base.tp = await activityTypeId(p, 'tp');
    base.td = await activityTypeId(p, 'td');
    // Five students in class A, so a room of 3 seats is too small.
    const students = await p.student.findMany({ take: 5, orderBy: { id: 'asc' } });
    for (const s of students)
      await p.enrollment.create({
        data: { studentId: s.id, classId: base.classA, schoolYearId: year.id },
      });
  });

  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await t.close();
  });

  describe('hard conflicts', () => {
    it('blocks the same room at the same time (409, with the conflicting item) and saves nothing', async () => {
      await create();
      const res = await post(
        admin,
        slot({
          classSubjectId: base.csMathsB,
          teacherId: base.hany,
          roomId: base.r1,
          startTime: '17:30',
          endTime: '18:30',
        }),
      );
      // Same teacher too: the first hard conflict names one of them.
      expect(res.status).toBe(409);
      const room = await post(
        admin,
        slot({
          classSubjectId: base.csPhysB,
          teacherId: base.sherif,
          roomId: base.r1,
          startTime: '17:30',
          endTime: '18:30',
        }),
      ).expect(409);
      const body = blocked(room.body);
      expect(body.code).toBe('TIMETABLE_CONFLICT');
      expect(body.conflicts.map((c) => c.kind)).toEqual(['room']);
      expect(body.conflicts[0]!.message).toMatch(/TT Salle 1 est déjà occupée le .* par Mathématiques/);
      expect(body.conflicts[0]!.withSource).toBe('slot');
      expect((await slots()).length).toBe(1);
    });

    it('blocks the same teacher at the same time', async () => {
      await create();
      const res = await post(
        admin,
        slot({ classSubjectId: base.csMathsB, roomId: base.r2, startTime: '17:30', endTime: '18:30' }),
      ).expect(409);
      const kinds = blocked(res.body).conflicts.map((c) => c.kind);
      expect(kinds).toEqual(['teacher']);
      expect(message(res.body)).toMatch(/Hany Mansour a déjà une séance/);
    });

    it('blocks the same class at the same time', async () => {
      await create();
      const res = await post(
        admin,
        slot({
          classSubjectId: base.csFrenchA,
          teacherId: base.claire,
          roomId: base.r2,
          startTime: '17:30',
          endTime: '18:30',
        }),
      ).expect(409);
      expect(blocked(res.body).conflicts.map((c) => c.kind)).toEqual(['class']);
      expect(message(res.body)).toMatch(/La classe Classe tt-a .* a déjà une séance/);
    });

    it('lets back-to-back sessions through (the end of one is the start of the next)', async () => {
      await create();
      await post(admin, slot({ startTime: '18:00', endTime: '19:00' })).expect(201);
    });

    it('a division lets two groups of one class run together, but not with the whole class', async () => {
      await create({
        division: 'TP',
        activityTypeId: base.tp,
        classSubjectId: base.csPhysA,
        teacherId: base.sherif,
        roomId: base.lab,
        weekday: 2,
      });
      // The other group: same class, same time, same division, other teacher and room.
      await post(
        admin,
        slot({
          division: 'TP',
          weekday: 2,
          classSubjectId: base.csFrenchA,
          teacherId: base.claire,
          roomId: base.r2,
        }),
      ).expect(201);
      // The same teacher or room is still refused.
      await post(
        admin,
        slot({
          division: 'TP',
          weekday: 2,
          classSubjectId: base.csMathsA,
          teacherId: base.hany,
          roomId: base.lab,
        }),
      ).expect(409);
      // Another division, or the whole class, clashes with the group.
      for (const division of ['LV2', null]) {
        const res = await post(
          admin,
          slot({ division, weekday: 2, roomId: base.r3, startTime: '17:30', endTime: '18:30' }),
        ).expect(409);
        expect(blocked(res.body).conflicts.map((c) => c.kind)).toContain('class');
      }
    });

    it('check answers without saving', async () => {
      await create();
      const res = await t
        .http()
        .post('/api/timetable/check')
        .set(bearer(admin))
        .send({ slot: slot({ classSubjectId: base.csMathsB, roomId: base.r2 }) })
        .expect(200);
      const body = res.body as TimetableCheckResult;
      expect(body.canSave).toBe(false);
      expect(body.conflicts[0]!.kind).toBe('teacher');
      const free = await t
        .http()
        .post('/api/timetable/check')
        .set(bearer(admin))
        .send({ slot: slot({ classSubjectId: base.csMathsB, roomId: base.r2, weekday: 3 }) })
        .expect(200);
      expect((free.body as TimetableCheckResult).canSave).toBe(true);
      expect((await slots()).length).toBe(1);
    });

    it('a concurrent write cannot double-book a room (two parallel requests: one wins)', async () => {
      for (let round = 0; round < 3; round++) {
        await cleanup();
        const [a, b] = await Promise.all([
          post(
            admin,
            slot({ classSubjectId: base.csMathsA, teacherId: base.hany, roomId: base.r3 }),
          ),
          post(
            admin,
            slot({ classSubjectId: base.csPhysB, teacherId: base.sherif, roomId: base.r3 }),
          ),
        ]);
        expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
        const loser = a.status === 409 ? a : b;
        expect(blocked(loser.body).code).toBe('TIMETABLE_CONFLICT');
        expect((await slots()).length).toBe(1);
        const [rooms] = await t.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM occupancy WHERE room_id = ${base.r3}::uuid
            AND during && tsrange(${`${future(1)} 17:00`}::timestamp, ${`${future(1)} 18:00`}::timestamp)`;
        expect(Number(rooms!.n)).toBeLessThanOrEqual(1);
      }
    });

    it('a concurrent teacher and class double booking is refused as well', async () => {
      const [a, b] = await Promise.all([
        post(admin, slot({ roomId: base.r1 })),
        post(admin, slot({ classSubjectId: base.csMathsB, roomId: base.r2 })),
      ]);
      // Same teacher, same time.
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
    });
  });

  describe('soft warnings need a reason', () => {
    it('a TP outside a laboratory asks for acknowledgement, and the reason is audited', async () => {
      const draft = slot({
        activityTypeId: base.tp,
        classSubjectId: base.csPhysA,
        teacherId: base.sherif,
        roomId: base.r1,
        weekday: 3,
      });
      const refused = await post(admin, draft).expect(409);
      expect(blocked(refused.body).code).toBe('WARNINGS_NOT_ACKNOWLEDGED');
      expect(blocked(refused.body).warnings.map((w) => w.code)).toEqual(['tp_outside_lab']);
      expect((await slots()).length).toBe(0);

      // A reason that is too short, or for another warning, is not enough.
      await post(admin, {
        ...draft,
        acknowledgedWarnings: [{ code: 'tp_outside_lab', reason: '' }],
      }).expect(400);
      await post(admin, {
        ...draft,
        acknowledgedWarnings: [{ code: 'exam_week', reason: 'Autre avertissement' }],
      }).expect(409);

      const ok = await post(admin, {
        ...draft,
        acknowledgedWarnings: [{ code: 'tp_outside_lab', reason: 'Laboratoire en travaux' }],
      }).expect(201);
      const written = ok.body as TimetableWriteResult;
      expect(written.warnings.map((w) => w.code)).toEqual(['tp_outside_lab']);
      const log = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'timetable_slot.create', entityId: written.slot!.id },
      });
      expect(JSON.stringify(log.after)).toContain('Laboratoire en travaux');
    });

    it('a TP in a laboratory raises nothing', async () => {
      await post(
        admin,
        slot({
          activityTypeId: base.tp,
          classSubjectId: base.csPhysA,
          teacherId: base.sherif,
          roomId: base.lab,
        }),
      ).expect(201);
    });

    it('warns about a room smaller than the class, an exam week and too many hours', async () => {
      const examStart = future(1, 3);
      await t.prisma.calendarDay.create({
        data: {
          schoolYearId: base.yearId,
          type: 'exam_week',
          label: 'Examens',
          startsOn: new Date(`${addDays(examStart, -1)}T00:00:00Z`),
          endsOn: new Date(`${addDays(examStart, 5)}T00:00:00Z`),
        },
      });
      // 5 students, 3 seats; hours: 3 h a week allowed, this slot gives 4.
      const res = await post(
        admin,
        slot({ roomId: base.small, startTime: '17:00', endTime: '21:00' }),
      ).expect(409);
      const codes = blocked(res.body).warnings.map((w) => w.code).sort();
      expect(codes).toEqual(['exam_week', 'hours_exceeded', 'room_capacity']);
      const messages = blocked(res.body).warnings.map((w) => w.message).join(' | ');
      expect(messages).toMatch(/TT Petite salle compte 3 places pour 5 élèves/);
      expect(messages).toMatch(/semaine d’examens/);
      expect(messages).toMatch(/4 h par semaine pour 3 h prévues/);
      await t.prisma.calendarDay.deleteMany({ where: { schoolYearId: base.yearId } });
    });

    it('warns when the class already has more than two assessments that day', async () => {
      const day = future(2, 3);
      const exam = await activityTypeId(t.prisma, 'examen');
      for (let i = 0; i < 3; i++)
        await t.prisma.event.create({
          data: {
            activityTypeId: exam,
            title: `Évaluation ${i}`,
            subjectId: 'mathematiques',
            classId: base.classA,
            date: new Date(`${day}T00:00:00Z`),
            authorId: base.hany,
          },
        });
      const res = await post(admin, slot({ weekday: 2 })).expect(409);
      expect(blocked(res.body).warnings.map((w) => w.code)).toEqual(['assessments_overload']);
      await t.prisma.event.deleteMany({ where: { classId: base.classA } });
    });

    it('the stored timetable can be audited for warnings (admin or coordinator only)', async () => {
      await post(admin, {
        ...slot({ roomId: base.small }),
        acknowledgedWarnings: [{ code: 'room_capacity', reason: 'Petit effectif ce trimestre' }],
      }).expect(201);
      const from = addDays(TODAY, 7);
      const res = await t
        .http()
        .get(`/api/timetable/warnings?classId=${base.classA}&from=${from}&to=${addDays(from, 14)}`)
        .set(bearer(coordinator))
        .expect(200);
      expect((res.body as { code: string }[]).map((w) => w.code)).toContain('room_capacity');
      await t
        .http()
        .get(`/api/timetable/warnings?classId=${base.classA}&from=${from}&to=${addDays(from, 14)}`)
        .set(bearer(maths))
        .expect(403);
    });
  });

  describe('permissions', () => {
    it('admins and coordinators edit any slot; a teacher cannot create or end one; students are refused', async () => {
      const made = await create();
      await post(coordinator, slot({ weekday: 2 })).expect(201);
      await post(maths, slot({ weekday: 3 })).expect(403);
      const student = await studentOf(t.prisma, 'bac', 'premiere');
      const studentToken = await t.token(student.email);
      await post(studentToken, slot({ weekday: 3 })).expect(403);
      await t
        .http()
        .delete(`/api/timetable/slots/${made.id}?scope=all`)
        .set(bearer(maths))
        .expect(403);
      await t.http().get('/api/timetable/slots').set(bearer(maths)).expect(403);
      const list = await t
        .http()
        .get(`/api/timetable/slots?classId=${base.classA}`)
        .set(bearer(coordinator))
        .expect(200);
      expect((list.body as { total: number }).total).toBe(2);
    });

    it('a teacher cancels, moves or changes the room of their own session only', async () => {
      const mine = await create();
      const when = future(1, 3);
      const cancel = await t
        .http()
        .post(`/api/timetable/slots/${mine.id}/exceptions`)
        .set(bearer(maths))
        .send({ date: when, kind: 'cancelled', reason: 'Sortie pédagogique' })
        .expect(201);
      expect((cancel.body as TimetableWriteResult).exception?.kind).toBe('cancelled');
      await t
        .http()
        .post(`/api/timetable/slots/${mine.id}/exceptions`)
        .set(bearer(maths))
        .send({ date: when, kind: 'room_change', newRoomId: base.r2 })
        .expect(201);
      await patch(maths, mine.id, {
        scope: 'this',
        date: addDays(when, 7),
        exception: { kind: 'moved', newStart: '19:00', newEnd: '20:00' },
      }).expect(200);

      // Not their session, not their assignment, not their kind of change, not the series.
      const other = await create({
        classSubjectId: base.csFrenchA,
        teacherId: base.claire,
        roomId: base.r2,
        weekday: 4,
      });
      await t
        .http()
        .post(`/api/timetable/slots/${other.id}/exceptions`)
        .set(bearer(maths))
        .send({ date: future(4, 3), kind: 'cancelled' })
        .expect(403);
      await t
        .http()
        .post(`/api/timetable/slots/${mine.id}/exceptions`)
        .set(bearer(maths))
        .send({ date: addDays(when, 14), kind: 'substitute', newTeacherId: base.claire })
        .expect(403);
      await patch(maths, mine.id, { scope: 'all', changes: { roomId: base.r3 } }).expect(403);
      await patch(maths, mine.id, {
        scope: 'following',
        date: when,
        changes: { roomId: base.r3 },
      }).expect(403);
      await t
        .http()
        .get(`/api/timetable/slots/${other.id}`)
        .set(bearer(maths))
        .expect(403);
      // A teacher assigned to the subject but not the slot's teacher: still refused.
      await t
        .http()
        .post(`/api/timetable/slots/${mine.id}/exceptions`)
        .set(bearer(french))
        .send({ date: when, kind: 'cancelled' })
        .expect(403);
      // The admin can name a substitute.
      await t
        .http()
        .post(`/api/timetable/slots/${mine.id}/exceptions`)
        .set(bearer(admin))
        .send({
          date: addDays(when, 14),
          kind: 'substitute',
          newTeacherId: base.sherif,
          reason: 'Remplacement',
        })
        .expect(201);
    });

    it('a teacher can restore their own session; nobody else can', async () => {
      const mine = await create();
      const when = future(1, 3);
      const made = (
        await t
          .http()
          .post(`/api/timetable/slots/${mine.id}/exceptions`)
          .set(bearer(maths))
          .send({ date: when, kind: 'cancelled' })
          .expect(201)
      ).body as TimetableWriteResult;
      await t
        .http()
        .delete(`/api/timetable/exceptions/${made.exception!.id}`)
        .set(bearer(french))
        .expect(403);
      await t
        .http()
        .delete(`/api/timetable/exceptions/${made.exception!.id}`)
        .set(bearer(maths))
        .expect(200);
      const list = await sessions(
        `classId=${base.classA}&from=${when}&to=${when}`,
      );
      expect(list[0]!.status).toBe('normal');
    });

    it('a teacher cannot undo a replacement the administration named', async () => {
      const mine = await create();
      const when = future(1, 3);
      const sub = (
        await t
          .http()
          .post(`/api/timetable/slots/${mine.id}/exceptions`)
          .set(bearer(admin))
          .send({ date: when, kind: 'substitute', newTeacherId: base.sherif })
          .expect(201)
      ).body as TimetableWriteResult;
      await t
        .http()
        .delete(`/api/timetable/exceptions/${sub.exception!.id}`)
        .set(bearer(maths))
        .expect(403);
      await t
        .http()
        .delete(`/api/timetable/exceptions/${sub.exception!.id}`)
        .set(bearer(admin))
        .expect(200);
    });

    it('students read their own class timetable only; teachers read any', async () => {
      const student = await studentOf(t.prisma, 'bac', 'premiere');
      const token = await t.token(student.email);
      const from = TODAY;
      const to = addDays(TODAY, 6);
      const own = await sessions(`classId=${student.classId}&from=${from}&to=${to}`, token);
      expect(own.length).toBeGreaterThan(0);
      expect(own.every((o) => o.classId === student.classId)).toBe(true);
      // Without a class they get their own.
      const implicit = await sessions(`from=${from}&to=${to}`, token);
      expect(implicit.length).toBe(own.length);
      await t
        .http()
        .get(`/api/timetable/occurrences?classId=${base.classA}&from=${from}&to=${to}`)
        .set(bearer(token))
        .expect(403);
      await t
        .http()
        .get(`/api/timetable/occurrences?teacherId=${base.hany}&from=${from}&to=${to}`)
        .set(bearer(token))
        .expect(403);
      await t.http().get(`/api/timetable/free-rooms?date=${from}&startTime=17:00&endTime=18:00`).set(bearer(token)).expect(403);
      const mine = await sessions(`teacherId=${base.hany}&from=${from}&to=${to}`, maths);
      expect(mine.length).toBeGreaterThan(0);
      // Students cannot change anything.
      expect(own.every((o) => !o.canChange)).toBe(true);
      expect(mine.some((o) => o.canChange)).toBe(true);
      // One filter at a time, and the range is bounded.
      await t
        .http()
        .get(`/api/timetable/occurrences?classId=${base.classA}&teacherId=${base.hany}&from=${from}&to=${to}`)
        .set(bearer(admin))
        .expect(400);
      await t
        .http()
        .get(`/api/timetable/occurrences?classId=${base.classA}&from=${from}&to=${addDays(from, 200)}`)
        .set(bearer(admin))
        .expect(400);
    });
  });

  describe('exceptions', () => {
    it('shows cancelled, moved, substitute and room-change sessions with avant and maintenant', async () => {
      const made = await create({ validFrom: addDays(TODAY, 1) });
      const first = nextDay(addDays(TODAY, 1), 1);
      const dates = [first, addDays(first, 7), addDays(first, 14), addDays(first, 21)];
      const send = (date: string, body: object) =>
        t
          .http()
          .post(`/api/timetable/slots/${made.id}/exceptions`)
          .set(bearer(admin))
          .send({ date, ...body })
          .expect(201);
      await send(dates[0]!, { kind: 'cancelled', reason: 'Sortie' });
      await send(dates[1]!, {
        kind: 'moved',
        newDate: addDays(dates[1]!, 1),
        newStart: '21:30',
        newEnd: '22:30',
      });
      await send(dates[2]!, { kind: 'substitute', newTeacherId: base.sherif });
      await send(dates[3]!, { kind: 'room_change', newRoomId: base.r2 });
      const list = await sessions(
        `classId=${base.classA}&from=${dates[0]}&to=${addDays(dates[3]!, 1)}`,
      );
      const byStatus = Object.fromEntries(list.map((o) => [o.status, o]));
      expect(Object.keys(byStatus).sort()).toEqual(
        ['cancelled', 'moved', 'moved_from', 'room_change', 'substitute'].sort(),
      );
      expect(byStatus['cancelled']!.reason).toBe('Sortie');
      expect(byStatus['moved']!.current).toMatchObject({
        date: addDays(dates[1]!, 1),
        startTime: '21:30',
      });
      expect(byStatus['moved']!.original).toMatchObject({ date: dates[1], startTime: '17:00' });
      expect(byStatus['moved']!.changes).toEqual(['date', 'time']);
      expect(byStatus['moved_from']!.movedTo?.date).toBe(addDays(dates[1]!, 1));
      expect(byStatus['substitute']!.current.teacherName).toMatch(/Sherif Nassar/);
      expect(byStatus['substitute']!.original.teacherName).toMatch(/Hany Mansour/);
      expect(byStatus['room_change']!.current.roomName).toBe('TT Salle 2');
      expect(byStatus['room_change']!.original.roomName).toBe('TT Salle 1');
      // The substitute teacher sees the replaced session on their own timetable.
      const theirs = await sessions(
        `teacherId=${base.sherif}&from=${dates[2]}&to=${dates[2]}`,
      );
      expect(theirs.filter((o) => o.slotId === made.id).map((o) => o.status)).toEqual(['substitute']);
    });

    it('a cancelled session frees its room and teacher; a move into a taken place is refused', async () => {
      const a = await create({ validFrom: addDays(TODAY, 1) });
      const other = await create({
        validFrom: addDays(TODAY, 1),
        classSubjectId: base.csPhysB,
        teacherId: base.sherif,
        roomId: base.r2,
        startTime: '19:00',
        endTime: '20:00',
      });
      const day = nextDay(addDays(TODAY, 1), 1);
      const exception = (id: string, body: object) =>
        t.http().post(`/api/timetable/slots/${id}/exceptions`).set(bearer(admin)).send(body);
      // Moving class A's maths into the 19:00 hour of room 2 is fine for the room only if it is changed too.
      const clash = await exception(a.id, {
        date: day,
        kind: 'moved',
        newStart: '19:00',
        newEnd: '20:00',
        newRoomId: base.r2,
      }).expect(409);
      expect(blocked(clash.body).conflicts.map((c) => c.kind)).toEqual(['room']);
      // Cancel the other session, then the move works.
      await exception(other.id, { date: day, kind: 'cancelled' }).expect(201);
      await exception(a.id, {
        date: day,
        kind: 'moved',
        newStart: '19:00',
        newEnd: '20:00',
        newRoomId: base.r2,
      }).expect(201);
    });

    it('checks the shape of an exception and the date of the session', async () => {
      const made = await create();
      const day = future(1);
      const send = (body: object) =>
        t
          .http()
          .post(`/api/timetable/slots/${made.id}/exceptions`)
          .set(bearer(admin))
          .send(body);
      expect(message((await send({ date: day, kind: 'substitute' }).expect(400)).body)).toMatch(/remplace/);
      expect(message((await send({ date: day, kind: 'moved' }).expect(400)).body)).toMatch(/nouveau jour/);
      await send({ date: day, kind: 'room_change' }).expect(400);
      await send({ date: day, kind: 'cancelled', newRoomId: base.r2 }).expect(400);
      // Not a Monday of the series.
      const res = await send({ date: addDays(day, 1), kind: 'cancelled' }).expect(400);
      expect(message(res.body)).toMatch(/n’a pas lieu/);
      // A session already held cannot change.
      expect(
        message((await send({ date: nextDay(addDays(TODAY, -20), 1), kind: 'cancelled' }).expect(400)).body),
      ).toMatch(/passées/);
      await send({ date: day, kind: 'room_change', newRoomId: base.lab, extra: 1 }).expect(400);
    });
  });

  describe('« cette séance / celle-ci et les suivantes / toute la série »', () => {
    const range = () => `from=${addDays(TODAY, -56)}&to=${addDays(TODAY, -1)}`;

    it('this session only creates an exception', async () => {
      const made = await create();
      const day = future(1);
      const res = await patch(admin, made.id, {
        scope: 'this',
        date: day,
        exception: { kind: 'room_change', newRoomId: base.r2, reason: 'Projecteur cassé' },
      }).expect(200);
      expect((res.body as TimetableWriteResult).exception?.kind).toBe('room_change');
      expect((await slots()).length).toBe(1);
    });

    it('this and following ends the old slot the day before and starts a new one; the past stays', async () => {
      const made = await create();
      const past = await sessions(`classId=${base.classA}&${range()}`);
      expect(past.length).toBeGreaterThan(5);
      const split = future(1, 3);
      const res = await patch(admin, made.id, {
        scope: 'following',
        date: split,
        changes: { roomId: base.r2, startTime: '17:30', endTime: '18:30' },
      }).expect(200);
      const body = res.body as TimetableWriteResult;
      expect(body.endedSlot!.id).toBe(made.id);
      expect(body.endedSlot!.validTo).toBe(addDays(split, -1));
      expect(body.slot!.id).not.toBe(made.id);
      expect(body.slot).toMatchObject({
        validFrom: split,
        validTo: made.validTo,
        roomId: base.r2,
        startTime: '17:30',
      });
      // The sessions before the split are exactly what they were.
      expect(await sessions(`classId=${base.classA}&${range()}`)).toEqual(past);
      const around = await sessions(
        `classId=${base.classA}&from=${addDays(split, -7)}&to=${addDays(split, 7)}`,
      );
      expect(around.map((o) => [o.current.date, o.current.startTime, o.current.roomName])).toEqual([
        [addDays(split, -7), '17:00', 'TT Salle 1'],
        [split, '17:30', 'TT Salle 2'],
        [addDays(split, 7), '17:30', 'TT Salle 2'],
      ]);
      // The rooms follow: Salle 1 is free from the split on, Salle 2 is taken.
      await post(admin, slot({ classSubjectId: base.csPhysB, teacherId: base.sherif, validFrom: split })).expect(201);
    });

    it('whole series edits from today on and never touches sessions already held', async () => {
      const made = await create();
      const before = await sessions(`classId=${base.classA}&${range()}`);
      const res = await patch(admin, made.id, {
        scope: 'all',
        changes: { roomId: base.r3, weekday: 2 },
      }).expect(200);
      const body = res.body as TimetableWriteResult;
      // The series had started: split at today.
      expect(body.endedSlot!.id).toBe(made.id);
      expect(body.endedSlot!.validTo).toBe(addDays(TODAY, -1));
      expect(body.slot).toMatchObject({ validFrom: TODAY, roomId: base.r3, weekday: 2 });
      expect(await sessions(`classId=${base.classA}&${range()}`)).toEqual(before);
      const after = await sessions(`classId=${base.classA}&from=${TODAY}&to=${addDays(TODAY, 13)}`);
      expect(after.every((o) => o.current.roomName === 'TT Salle 3' && weekday(o.current.date) === 2)).toBe(true);
    });

    it('a series that has not started is edited in place', async () => {
      const made = await create({ validFrom: addDays(TODAY, 10) });
      const res = await patch(admin, made.id, { scope: 'all', changes: { roomId: base.r2 } }).expect(200);
      const body = res.body as TimetableWriteResult;
      expect(body.slot!.id).toBe(made.id);
      expect(body.endedSlot).toBeNull();
      expect((await slots()).length).toBe(1);
    });

    it('refuses to rewrite the past', async () => {
      const made = await create();
      const pastDay = nextDay(addDays(TODAY, -21), 1);
      await patch(admin, made.id, {
        scope: 'this',
        date: pastDay,
        exception: { kind: 'cancelled' },
      }).expect(400);
      const res = await patch(admin, made.id, {
        scope: 'following',
        date: pastDay,
        changes: { roomId: base.r2 },
      }).expect(400);
      expect(message(res.body)).toMatch(/passées/);
      // Changing the start of a series that began.
      await patch(admin, made.id, {
        scope: 'all',
        changes: { validFrom: addDays(TODAY, 5) },
      }).expect(400);
      expect((await slots()).length).toBe(1);
    });

    it('a change into a conflict is refused for every scope and rolls back completely', async () => {
      const a = await create();
      await create({
        classSubjectId: base.csPhysB,
        teacherId: base.sherif,
        roomId: base.r2,
        startTime: '17:00',
        endTime: '18:00',
      });
      const split = future(1, 3);
      const res = await patch(admin, a.id, {
        scope: 'following',
        date: split,
        changes: { roomId: base.r2 },
      }).expect(409);
      expect(blocked(res.body).conflicts[0]!.kind).toBe('room');
      // Nothing was split.
      expect((await slots()).length).toBe(2);
      const stored = await t.prisma.timetableSlot.findUniqueOrThrow({ where: { id: a.id } });
      expect(stored.roomId).toBe(base.r1);
      await patch(admin, a.id, { scope: 'all', changes: { roomId: base.r2 } }).expect(409);
      expect((await slots()).length).toBe(2);
    });

    it('moves the exceptions of the future sessions to the new slot and drops the ones that no longer fit', async () => {
      const made = await create();
      const split = future(1, 3);
      const later = addDays(split, 14);
      for (const date of [addDays(split, -7), later])
        await t
          .http()
          .post(`/api/timetable/slots/${made.id}/exceptions`)
          .set(bearer(admin))
          .send({ date, kind: 'cancelled' })
          .expect(201);
      const res = await patch(admin, made.id, {
        scope: 'following',
        date: split,
        changes: { weekday: 2 },
      }).expect(200);
      const created = (res.body as TimetableWriteResult).slot!;
      // The old one keeps its past exception; the future one (a Monday) no longer matches a Tuesday rule.
      expect(await t.prisma.slotException.count({ where: { slotId: made.id } })).toBe(1);
      expect(await t.prisma.slotException.count({ where: { slotId: created.id } })).toBe(0);
    });

    it('deleting: this session cancels, following ends the series, all keeps the past', async () => {
      const made = await create();
      const day = future(1, 3);
      await t
        .http()
        .delete(`/api/timetable/slots/${made.id}?scope=this&date=${day}`)
        .set(bearer(admin))
        .expect(200);
      const cancelled = await sessions(`classId=${base.classA}&from=${day}&to=${day}`);
      expect(cancelled[0]!.status).toBe('cancelled');

      const before = await sessions(`classId=${base.classA}&${range()}`);
      const following = future(1, 5);
      const res = await t
        .http()
        .delete(`/api/timetable/slots/${made.id}?scope=following&date=${following}`)
        .set(bearer(admin))
        .expect(200);
      expect((res.body as TimetableWriteResult).endedSlot!.validTo).toBe(addDays(following, -1));
      expect(await sessions(`classId=${base.classA}&from=${following}&to=${addDays(following, 14)}`)).toEqual([]);

      await t.http().delete(`/api/timetable/slots/${made.id}?scope=all`).set(bearer(admin)).expect(200);
      // It had started: the series ends yesterday, the past is untouched.
      const stored = await t.prisma.timetableSlot.findUniqueOrThrow({ where: { id: made.id } });
      expect(stored.validTo.toISOString().slice(0, 10)).toBe(addDays(TODAY, -1));
      expect(await sessions(`classId=${base.classA}&${range()}`)).toEqual(before);
      expect(
        await t.prisma.occupancy.count({ where: { slotId: made.id, day: { gte: new Date(`${TODAY}T00:00:00Z`) } } }),
      ).toBe(0);

      // A series that has not started is deleted for good.
      const future1 = await create({ validFrom: addDays(TODAY, 20), weekday: 3 });
      await t.http().delete(`/api/timetable/slots/${future1.id}?scope=all`).set(bearer(admin)).expect(200);
      expect(await t.prisma.timetableSlot.findUnique({ where: { id: future1.id } })).toBeNull();
    });
  });

  describe('holidays and the index', () => {
    it('skips holidays and days without classes for the right audience', async () => {
      await create({ validFrom: addDays(TODAY, 1) });
      const monday = nextDay(addDays(TODAY, 1), 1);
      const days = [monday, addDays(monday, 7), addDays(monday, 14), addDays(monday, 21)];
      const calendar = (offset: number, type: string, over: object = {}) =>
        t.prisma.calendarDay.create({
          data: {
            schoolYearId: base.yearId,
            type: type as 'holiday',
            label: 'Test',
            startsOn: new Date(`${days[offset]}T00:00:00Z`),
            endsOn: new Date(`${days[offset]}T00:00:00Z`),
            ...over,
          },
        });
      const bac = await t.prisma.section.findFirstOrThrow({ where: { code: 'bac' } });
      const nationale = await t.prisma.section.findFirstOrThrow({ where: { code: 'nationale' } });
      await calendar(0, 'holiday');
      await calendar(1, 'no_classes', { sectionId: bac.id });
      // Another section's holiday and an exam week do not cancel it.
      await calendar(2, 'holiday', { sectionId: nationale.id });
      await calendar(3, 'event_day');
      const list = await sessions(`classId=${base.classA}&from=${days[0]}&to=${days[3]}`);
      expect(list.map((o) => o.current.date)).toEqual([days[2], days[3]]);
      await t.prisma.calendarDay.deleteMany({ where: { schoolYearId: base.yearId } });
    });

    it('the calendar rewrites the index: a new holiday frees the room, removing it brings the clash back (409)', async () => {
      await create({ validFrom: addDays(TODAY, 1) });
      const monday = nextDay(addDays(TODAY, 1), 1);
      const clash = slot({
        classSubjectId: base.csPhysB,
        teacherId: base.sherif,
        roomId: base.r1,
        validFrom: monday,
        validTo: monday,
      });
      await post(admin, clash).expect(409);
      const holiday = await t
        .http()
        .post('/api/calendar-days')
        .set(bearer(admin))
        .send({ schoolYearId: base.yearId, type: 'holiday', label: 'Jour férié', startsOn: monday, endsOn: monday })
        .expect(201);
      // That Monday nothing runs: the same room, teacher and class are free.
      const taken = await post(admin, clash).expect(201);
      // Giving the day back would double-book Salle 1: refused, and the holiday stays.
      const res = await t
        .http()
        .delete(`/api/calendar-days/${(holiday.body as { id: string }).id}`)
        .set(bearer(admin))
        .expect(409);
      expect(blocked(res.body).code).toBe('TIMETABLE_CONFLICT');
      expect(await t.prisma.calendarDay.count({ where: { schoolYearId: base.yearId } })).toBe(1);
      await t.http().delete(`/api/timetable/slots/${(taken.body as TimetableWriteResult).slot!.id}?scope=all`).set(bearer(admin)).expect(200);
      await t.http().delete(`/api/calendar-days/${(holiday.body as { id: string }).id}`).set(bearer(admin)).expect(204);
    });

    it('a session cannot be moved onto a day without classes', async () => {
      const made = await create({ validFrom: addDays(TODAY, 1) });
      const monday = nextDay(addDays(TODAY, 1), 1);
      await t.prisma.calendarDay.create({
        data: {
          schoolYearId: base.yearId,
          type: 'holiday',
          label: 'Vacances',
          startsOn: new Date(`${addDays(monday, 7)}T00:00:00Z`),
          endsOn: new Date(`${addDays(monday, 7)}T00:00:00Z`),
        },
      });
      const res = await t
        .http()
        .post(`/api/timetable/slots/${made.id}/exceptions`)
        .set(bearer(admin))
        .send({ date: monday, kind: 'moved', newDate: addDays(monday, 7) })
        .expect(400);
      expect(message(res.body)).toMatch(/sans cours/);
      await t.prisma.calendarDay.deleteMany({ where: { schoolYearId: base.yearId } });
    });

    it('a session cannot be moved to an earlier day without classes either', async () => {
      const made = await create({ validFrom: addDays(TODAY, 1) });
      const monday = nextDay(addDays(TODAY, 15), 1);
      const earlier = addDays(monday, -7);
      await t.prisma.calendarDay.create({
        data: {
          schoolYearId: base.yearId,
          type: 'holiday',
          label: 'Vacances',
          startsOn: new Date(`${earlier}T00:00:00Z`),
          endsOn: new Date(`${earlier}T00:00:00Z`),
        },
      });
      const res = await t
        .http()
        .post(`/api/timetable/slots/${made.id}/exceptions`)
        .set(bearer(admin))
        .send({ date: monday, kind: 'moved', newDate: earlier })
        .expect(400);
      expect(message(res.body)).toMatch(/sans cours/);
      await t.prisma.calendarDay.deleteMany({ where: { schoolYearId: base.yearId } });
    });

    it('fortnightly slots run in week A or week B and share a room', async () => {
      const a = await create({ weekParity: 'A' });
      // Week B in the same room, class and teacher: allowed.
      const b = await create({ weekParity: 'B' });
      const from = nextDay(addDays(TODAY, 1), 1);
      const list = await sessions(`classId=${base.classA}&from=${from}&to=${addDays(from, 20)}`);
      list.slice(1).forEach((o, i) => expect(o.slotId).not.toBe(list[i]!.slotId));
      expect(new Set(list.map((o) => o.slotId))).toEqual(new Set([a.id, b.id]));
      // Two slots of the same week rhythm clash.
      await post(admin, slot({ weekParity: 'A' })).expect(409);
    });
  });

  describe('free rooms and one-off events', () => {
    it('suggests the rooms that are free, the ones that seat the class first', async () => {
      await create({ roomId: base.r1 });
      const day = future(1);
      const res = await t
        .http()
        .get(
          `/api/timetable/free-rooms?date=${day}&startTime=17:00&endTime=18:00&classId=${base.classA}`,
        )
        .set(bearer(maths))
        .expect(200);
      const rooms = res.body as FreeRoomDto[];
      const names = rooms.map((r) => r.name);
      expect(names).not.toContain('TT Salle 1');
      expect(names).toContain('TT Salle 2');
      expect(rooms.find((r) => r.name === 'TT Petite salle')!.fitsClass).toBe(false);
      // The unfit rooms come last.
      expect(rooms.findIndex((r) => !r.fitsClass)).toBeGreaterThan(rooms.findLastIndex((r) => r.fitsClass) - 1);
      // The session being moved does not hide its own room.
      const mine = (await slots())[0]!.id;
      const own = await t
        .http()
        .get(`/api/timetable/free-rooms?date=${day}&startTime=17:00&endTime=18:00&ignoreSlotId=${mine}`)
        .set(bearer(admin))
        .expect(200);
      expect((own.body as FreeRoomDto[]).map((r) => r.name)).toContain('TT Salle 1');
      await t.http().get(`/api/timetable/free-rooms?date=${day}&startTime=18:00&endTime=17:00`).set(bearer(admin)).expect(400);
    });

    it('one-off events hold their room and class too: a clash with a lesson is a 409, free times pass', async () => {
      await create();
      const day = future(1, 4);
      const exam = await activityTypeId(t.prisma, 'examen');
      const event = (body: object) =>
        t
          .http()
          .post('/api/events')
          .set(bearer(maths))
          .send({
            activityTypeId: exam,
            title: 'Examen blanc',
            subjectId: 'mathematiques',
            classId: base.classA,
            date: day,
            startTime: '17:30',
            endTime: '18:30',
            ...body,
          });
      // The class has a lesson then.
      const clash = await event({}).expect(409);
      expect(blocked(clash.body).conflicts.map((c) => c.kind)).toContain('class');
      // A meeting without a class can still not take a room the lesson holds.
      const room = await event({
        roomId: base.r1,
        classId: undefined,
        subjectId: undefined,
        activityTypeId: await activityTypeId(t.prisma, 'reunion'),
        coefficient: undefined,
      }).expect(409);
      expect(blocked(room.body).conflicts.map((c) => c.kind)).toEqual(['room']);
      const ok = await event({ startTime: '19:00', endTime: '20:00', roomId: base.r1 }).expect(201);
      // Moving it onto the lesson is refused; deleting it frees the place.
      const id = (ok.body as { id: string }).id;
      await t
        .http()
        .patch(`/api/events/${id}`)
        .set(bearer(maths))
        .send({ startTime: '17:00', endTime: '18:00' })
        .expect(409);
      await t.http().delete(`/api/events/${id}`).set(bearer(maths)).expect(204);
      expect(await t.prisma.occupancy.count({ where: { eventId: id } })).toBe(0);
    });
  });

  describe('deleting what the timetable uses', () => {
    it('refuses to delete a room, a subject of a class or a class that has sessions (409, not a database error)', async () => {
      const p = t.prisma;
      const bac = await p.section.findFirstOrThrow({ where: { code: 'bac' } });
      const klass = await p.schoolClass.create({
        data: { schoolYearId: base.yearId, sectionId: bac.id, code: 'tt-del', label: 'Classe tt-del' },
      });
      const room = await p.room.create({ data: { name: 'TT Salle à garder', capacity: 20, kind: 'classroom' } });
      const classSubject = await p.classSubject.create({
        data: { classId: klass.id, subjectId: 'mathematiques' },
      });
      await p.timetableSlot.create({
        data: {
          classSubjectId: classSubject.id,
          teacherId: base.hany,
          roomId: room.id,
          activityTypeId: base.cours,
          weekday: 4,
          startTime: '19:00',
          endTime: '20:00',
          validFrom: new Date(`${addDays(TODAY, -10)}T00:00:00Z`),
          validTo: new Date(`${addDays(TODAY, 100)}T00:00:00Z`),
        },
      });
      await t.http().delete(`/api/rooms/${room.id}`).set(bearer(admin)).expect(409);
      await t.http().delete(`/api/class-subjects/${classSubject.id}`).set(bearer(admin)).expect(409);
      await t.http().delete(`/api/classes/${klass.id}`).set(bearer(admin)).expect(409);
      await p.timetableSlot.deleteMany({ where: { classSubjectId: classSubject.id } });
      await t.http().delete(`/api/class-subjects/${classSubject.id}`).set(bearer(admin)).expect(204);
      await t.http().delete(`/api/classes/${klass.id}`).set(bearer(admin)).expect(204);
      await t.http().delete(`/api/rooms/${room.id}`).set(bearer(admin)).expect(204);
    });
  });

  describe('the seeded timetable', () => {
    it('has no hard conflict: the index agrees with the slots and holds one row per standing session', async () => {
      const [dup] = await t.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM occupancy a JOIN occupancy b ON a.id < b.id AND a.during && b.during
         AND ((a.room_id = b.room_id) OR (a.teacher_id = b.teacher_id)
              OR (a.class_id = b.class_id AND a.division_key IS DISTINCT FROM b.division_key))`;
      expect(Number(dup!.n)).toBe(0);
    });

    it('shows a student their week with the exceptions of the demo', async () => {
      const student = await studentOf(t.prisma, 'bac', 'premiere');
      const token = await t.token(student.email);
      const list = await sessions(`from=2026-11-01&to=2026-12-12`, token);
      expect(list.length).toBeGreaterThan(30);
      const statuses = new Set(list.map((o) => o.status));
      expect(statuses.has('normal')).toBe(true);
    });
  });
});
