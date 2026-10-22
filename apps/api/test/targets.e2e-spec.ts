import type {
  ApiError,
  AttendanceSheetDto,
  EventDto,
  GradeSheetDto,
  GroupDetailDto,
  HomeworkDto,
  StudentGradesDto,
} from '@cdls/shared';
import { AccessService } from '../src/access/access.service.js';
import { TargetsService } from '../src/targets/targets.service.js';
import {
  ADMIN,
  bearer,
  createTestApp,
  FRENCH_TEACHER,
  MATHS_TEACHER,
  type TestApp,
} from './helpers.js';

const message = (body: unknown) => String((body as ApiError).message);

/** Fridays of the third trimester: no lesson of the demo timetable, so timed events do not clash. */
const friday = (n = 0) => {
  const d = new Date('2027-04-16T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};

/**
 * « Assigner à »: the target is stored, the students it concerns are computed. Grade sheets, attendance,
 * homework and the calendar follow it; a student never sees, ticks or is graded for work that is not theirs.
 */
describe('Targets (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let maths: string;
  let french: string;
  let classId: string;
  let students: { id: string; email: string; name: string }[] = [];
  let groupA: GroupDetailDto;
  let groupB: GroupDetailDto;
  let foreignGroupId: string;
  const events: string[] = [];
  const created: string[] = [];

  const A = () => students.slice(0, 5);
  const B = () => students.slice(5, 10);
  const post = (token: string, path: string, body: object) =>
    t.http().post(`/api/${path}`).set(bearer(token)).send(body);
  const put = (token: string, path: string, body: object) =>
    t.http().put(`/api/${path}`).set(bearer(token)).send(body);
  const patch = (token: string, path: string, body: object) =>
    t.http().patch(`/api/${path}`).set(bearer(token)).send(body);
  const get = (token: string, path: string) => t.http().get(`/api/${path}`).set(bearer(token));
  const typeId = async (code: string) =>
    (await t.prisma.activityType.findUniqueOrThrow({ where: { code } })).id;

  /** Creates an event as the maths teacher and remembers it for the cleanup. */
  const make = async (
    code: 'devoir' | 'examen' | 'controle' | 'cours',
    over: Record<string, unknown> = {},
    token = maths,
  ) => {
    const res = await post(token, 'events', {
      activityTypeId: await typeId(code),
      title: `E2E ${code}`,
      subjectId: 'mathematiques',
      classId,
      date: friday(),
      ...over,
    });
    if (res.status === 201) events.push((res.body as EventDto).id);
    return res;
  };
  const target = (groups: GroupDetailDto[], studentIds: string[] = []) => ({
    groupIds: groups.map((g) => g.id),
    studentIds,
  });
  const join = (g: GroupDetailDto, who: { id: string }[]) =>
    post(admin, `groups/${g.id}/members`, { studentIds: who.map((s) => s.id) }).expect(201);
  const sheet = async (id: string, token = maths) =>
    (await get(token, `events/${id}/grades`).expect(200)).body as GradeSheetDto;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    maths = await t.token(MATHS_TEACHER);
    french = await t.token(FRENCH_TEACHER);
    const p = t.prisma;
    const klass = await p.schoolClass.findFirstOrThrow({
      where: { code: 'terminale', section: { code: 'bac' }, schoolYear: { isCurrent: true } },
    });
    classId = klass.id;
    students = (
      await p.enrollment.findMany({
        where: { classId, leftOn: null },
        orderBy: { student: { user: { email: 'asc' } } },
        include: { student: { include: { user: true } } },
      })
    ).map((e) => ({
      id: e.studentId,
      email: e.student.user.email,
      name: `${e.student.user.firstName} ${e.student.user.lastName}`,
    }));
    expect(students).toHaveLength(10);
    foreignGroupId = (
      await p.group.findFirstOrThrow({ where: { schoolClass: { code: 'premiere' } } })
    ).id;
  });

  beforeEach(async () => {
    const mk = async (label: string) => {
      const res = await post(maths, 'groups', { classId, division: 'TP', label }).expect(201);
      created.push((res.body as GroupDetailDto).id);
      return res.body as GroupDetailDto;
    };
    groupA = await mk('E2E TP A');
    groupB = await mk('E2E TP B');
    await join(groupA, A());
    await join(groupB, B());
  });

  afterEach(async () => {
    await t.prisma.event.deleteMany({ where: { id: { in: events } } });
    events.length = 0;
    await t.prisma.group.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  });
  afterAll(() => t.close());

  describe('the default is the whole class', () => {
    it('stores a class target and concerns everyone enrolled', async () => {
      const res = await make('devoir');
      expect(res.status).toBe(201);
      const dto = res.body as EventDto;
      expect(dto.target).toMatchObject({ whole: true, groups: [], studentIds: [], concerned: 10 });
      const rows = await t.prisma.assessmentTarget.findMany({ where: { eventId: dto.id } });
      expect(rows.map((r) => r.scope)).toEqual(['class']);
      // Every student of the class sees it, and the sheet lists all ten.
      for (const s of [A()[0]!, B()[0]!]) {
        const list = (await get(await t.token(s.email), 'homework').expect(200)).body as HomeworkDto[];
        expect(list.some((h) => h.event.id === dto.id)).toBe(true);
      }
    });

    it('keeps no target on events that are not assessments or homework, and refuses one', async () => {
      const res = await make('cours', { target: target([groupA]) });
      expect(res.status).toBe(400);
      expect(message(res.body)).toContain('devoirs et les évaluations');
      const plain = await make('cours', { date: friday(1) });
      expect(plain.status).toBe(201);
      expect(await t.prisma.assessmentTarget.count({ where: { eventId: (plain.body as EventDto).id } })).toBe(0);
    });
  });

  describe('homework for a group', () => {
    it('is seen, ticked and listed only by the students it concerns', async () => {
      const dto = (await make('devoir', { target: target([groupA]) })).body as EventDto;
      expect(dto.target).toMatchObject({ whole: false, concerned: 5 });
      expect(dto.target.groups.map((g) => g.label)).toEqual(['E2E TP A']);

      const inA = await t.token(A()[0]!.email);
      const inB = await t.token(B()[0]!.email);
      const mineA = (await get(inA, 'homework').expect(200)).body as HomeworkDto[];
      const mineB = (await get(inB, 'homework').expect(200)).body as HomeworkDto[];
      expect(mineA.some((h) => h.event.id === dto.id)).toBe(true);
      expect(mineB.some((h) => h.event.id === dto.id)).toBe(false);
      // The student of the group sees the group but never the names of other students.
      const seen = mineA.find((h) => h.event.id === dto.id)!;
      expect(seen.event.target.studentIds).toEqual([]);

      await get(inB, `events/${dto.id}`).expect(404);
      await put(inB, `homework/${dto.id}/done`, {}).expect(404);
      await put(inA, `homework/${dto.id}/done`, {}).expect(200);
      const inRange = (await get(inB, `events?from=${friday()}&to=${friday()}`).expect(200)).body as EventDto[];
      expect(inRange.some((e) => e.id === dto.id)).toBe(false);

      // The teacher's list of who is done only holds students the homework concerns.
      const done = (await get(maths, `events/${dto.id}/completions`).expect(200)).body as { student: { id: string } }[];
      expect(done.map((d) => d.student.id)).toEqual([A()[0]!.id]);
    });

    it('can name individual students, alone or next to a group', async () => {
      const one = (await make('devoir', { target: { groupIds: [], studentIds: [B()[0]!.id] } })).body as EventDto;
      expect(one.target).toMatchObject({ whole: false, studentIds: [B()[0]!.id], concerned: 1 });
      const mixed = (await make('devoir', { target: target([groupA], [B()[0]!.id]) })).body as EventDto;
      expect(mixed.target.concerned).toBe(6);
      const b0 = await t.token(B()[0]!.email);
      const b1 = await t.token(B()[1]!.email);
      const has = async (token: string, id: string) =>
        ((await get(token, 'homework').expect(200)).body as HomeworkDto[]).some((h) => h.event.id === id);
      expect(await has(b0, one.id)).toBe(true);
      expect(await has(b1, one.id)).toBe(false);
      expect(await has(b0, mixed.id)).toBe(true);
      expect(await has(b1, mixed.id)).toBe(false);
    });

    it('refuses a group or a student of another class', async () => {
      const group = await make('devoir', { target: { groupIds: [foreignGroupId], studentIds: [] } });
      expect(group.status).toBe(400);
      expect(message(group.body)).toContain('pas un groupe de cette classe');
      const stranger = await t.prisma.enrollment.findFirstOrThrow({
        where: { classId: { not: classId }, leftOn: null },
      });
      const student = await make('devoir', { target: { groupIds: [], studentIds: [stranger.studentId] } });
      expect(student.status).toBe(400);
      expect(message(student.body)).toContain('pas inscrit');
    });

    it('lets only a teacher of the class assign work to its groups', async () => {
      const res = await make('devoir', { target: target([groupA]) }, french);
      expect(res.status).toBe(403);
    });
  });

  describe('late joiners and leavers', () => {
    it('includes a student who joins the group after the work was assigned, and drops one who leaves', async () => {
      const dto = (await make('devoir', { target: target([groupA]) })).body as EventDto;
      const joiner = B()[0]!;
      const token = await t.token(joiner.email);
      const has = async () =>
        ((await get(token, 'homework').expect(200)).body as HomeworkDto[]).some((h) => h.event.id === dto.id);
      expect(await has()).toBe(false);
      await post(admin, `groups/${groupA.id}/members`, { studentIds: [joiner.id], move: true }).expect(201);
      expect(await has()).toBe(true);
      expect(((await get(maths, `events/${dto.id}`).expect(200)).body as EventDto).target.concerned).toBe(6);
      await t.http().delete(`/api/groups/${groupA.id}/members/${joiner.id}`).set(bearer(admin)).expect(200);
      expect(await has()).toBe(false);
    });

    it('keeps the grade of a student who left the group, marked as no longer concerned', async () => {
      const exam = (await make('examen', { target: target([groupA]) })).body as EventDto;
      await put(maths, `events/${exam.id}/grades`, {
        entries: [{ studentId: A()[0]!.id, score: 14 }, { studentId: A()[1]!.id, score: 12 }],
      }).expect(200);
      await t.http().delete(`/api/groups/${groupA.id}/members/${A()[0]!.id}`).set(bearer(admin)).expect(200);
      await t.http().delete(`/api/groups/${groupA.id}/members/${A()[2]!.id}`).set(bearer(admin)).expect(200);
      const rows = (await sheet(exam.id)).rows;
      const byId = new Map(rows.map((r) => [r.student.id, r]));
      expect(byId.get(A()[0]!.id)).toMatchObject({ targeted: false, grade: { score: 14 } });
      expect(byId.has(A()[2]!.id)).toBe(false); // left, never graded: gone from the sheet
      expect(byId.get(A()[1]!.id)).toMatchObject({ targeted: true, grade: { score: 12 } });
      // The kept grade can be removed but not changed.
      const change = await put(maths, `events/${exam.id}/grades`, {
        entries: [{ studentId: A()[0]!.id, score: 18 }],
      });
      expect(change.status).toBe(400);
    });
  });

  describe('grade sheets', () => {
    it('lists and accepts only the targeted students, with a French message otherwise', async () => {
      const exam = (await make('examen', { target: target([groupA]) })).body as EventDto;
      const s = await sheet(exam.id);
      expect(s.rows.map((r) => r.student.id).sort()).toEqual(A().map((x) => x.id).sort());
      expect(s.rows.every((r) => r.targeted)).toBe(true);
      expect(s.event.target.concerned).toBe(5);

      const rejected = await put(maths, `events/${exam.id}/grades`, {
        entries: [{ studentId: B()[0]!.id, score: 15 }],
      });
      expect(rejected.status).toBe(400);
      expect(message(rejected.body)).toContain('n’est pas concerné');
      expect(message(rejected.body)).toContain(B()[0]!.name);
      expect(await t.prisma.grade.count({ where: { eventId: exam.id } })).toBe(0);
      // The same request with a targeted student passes, and one bad entry saves nothing.
      const mixed = await put(maths, `events/${exam.id}/grades`, {
        entries: [{ studentId: A()[0]!.id, score: 15 }, { studentId: B()[0]!.id, score: 9 }],
      });
      expect(mixed.status).toBe(400);
      expect(await t.prisma.grade.count({ where: { eventId: exam.id } })).toBe(0);
      await put(maths, `events/${exam.id}/grades`, {
        entries: [{ studentId: A()[0]!.id, score: 15 }],
      }).expect(200);
    });

    it('counts a group exam only for its students: others have no grade and no average from it', async () => {
      const whole = (await make('examen', { date: friday(1) })).body as EventDto;
      const group = (await make('examen', { date: friday(2), target: target([groupA]) })).body as EventDto;
      await put(maths, `events/${whole.id}/grades`, {
        entries: students.map((s) => ({ studentId: s.id, score: 10 })),
      }).expect(200);
      await put(maths, `events/${group.id}/grades`, {
        entries: A().map((s) => ({ studentId: s.id, score: 20 })),
      }).expect(200);
      await post(maths, `events/${whole.id}/grades/publish`, { published: true }).expect(200);
      await post(maths, `events/${group.id}/grades/publish`, { published: true }).expect(200);
      const average = async (studentId: string) => {
        const res = (await get(admin, `students/${studentId}/grades`).expect(200)).body as StudentGradesDto;
        return res.subjects.find((x) => x.subjectId === 'mathematiques')!;
      };
      const inA = await average(A()[0]!.id);
      const inB = await average(B()[0]!.id);
      const mine = (r: typeof inA) => r.grades.map((g) => g.event.id).filter((id) => [whole.id, group.id].includes(id));
      expect(mine(inB)).toEqual([whole.id]);
      expect(mine(inA).sort()).toEqual([group.id, whole.id].sort());
      // The group's exam is part of its students' average only.
      expect(inA.grades.find((g) => g.event.id === group.id)!.grade.score).toBe(20);
      // A student sees only their own marks.
      const own = (await get(await t.token(B()[0]!.email), `students/${B()[0]!.id}/grades`).expect(200)).body as StudentGradesDto;
      expect(own.subjects.flatMap((x) => x.grades.map((g) => g.event.id))).not.toContain(group.id);
    });
  });

  describe('editing the audience after publishing', () => {
    it('refuses to take out a student who already has a grade, and says so', async () => {
      const exam = (await make('examen', { target: target([groupA]) })).body as EventDto;
      await put(maths, `events/${exam.id}/grades`, {
        entries: [{ studentId: A()[0]!.id, score: 11 }],
      }).expect(200);
      const res = await patch(maths, `events/${exam.id}`, { target: target([groupB]) });
      expect(res.status).toBe(409);
      expect(message(res.body)).toContain(A()[0]!.name);
      expect(message(res.body)).toContain('a déjà une note');
      expect(await t.prisma.grade.count({ where: { eventId: exam.id } })).toBe(1);
      // Adding students, or taking out ones without a grade, is fine.
      const wider = await patch(maths, `events/${exam.id}`, { target: target([groupA, groupB]) }).expect(200);
      expect((wider.body as EventDto).target.concerned).toBe(10);
      await patch(maths, `events/${exam.id}`, { target: { groupIds: [], studentIds: [A()[0]!.id] } }).expect(200);
      expect((await sheet(exam.id)).rows.map((r) => r.student.id)).toEqual([A()[0]!.id]);
      // Back to the whole class.
      const back = await patch(maths, `events/${exam.id}`, { target: { groupIds: [], studentIds: [] } }).expect(200);
      expect((back.body as EventDto).target).toMatchObject({ whole: true, concerned: 10 });
    });

    it('treats an event with no target row as the whole class when narrowing it', async () => {
      const exam = (await make('examen')).body as EventDto;
      await put(maths, `events/${exam.id}/grades`, {
        entries: [{ studentId: B()[0]!.id, score: 11 }],
      }).expect(200);
      // An event made before the backfill has no row: it still means the whole class.
      await t.prisma.assessmentTarget.deleteMany({ where: { eventId: exam.id } });
      const res = await patch(maths, `events/${exam.id}`, { target: target([groupA]) });
      expect(res.status).toBe(409);
      expect(message(res.body)).toContain(B()[0]!.name);
      expect(await t.prisma.grade.count({ where: { eventId: exam.id } })).toBe(1);
    });

    it('leaves the target alone when a patch does not mention it, and follows a change of type', async () => {
      const hw = (await make('devoir', { target: target([groupA]) })).body as EventDto;
      const renamed = await patch(maths, `events/${hw.id}`, { title: 'E2E renommé' }).expect(200);
      expect((renamed.body as EventDto).target).toMatchObject({ whole: false, concerned: 5 });
      const asCourse = await patch(maths, `events/${hw.id}`, { activityTypeId: await typeId('cours') });
      // A course takes no target: the rows go (a lesson concerns the whole class).
      expect(asCourse.status).toBe(200);
      expect(await t.prisma.assessmentTarget.count({ where: { eventId: hw.id } })).toBe(0);
    });
  });

  describe('attendance', () => {
    it('lists only the students the session concerns and refuses the others', async () => {
      const exam = (
        await make('examen', { target: target([groupB]), startTime: '09:00', endTime: '10:00' })
      ).body as EventDto;
      const day = friday();
      const s = (await get(maths, `events/${exam.id}/attendance?date=${day}`).expect(200)).body as AttendanceSheetDto;
      expect(s.rows.map((r) => r.student.id).sort()).toEqual(B().map((x) => x.id).sort());
      const refused = await put(maths, `events/${exam.id}/attendance`, {
        date: day,
        records: [{ studentId: A()[0]!.id, status: 'absent' }],
      });
      expect(refused.status).toBe(400);
      expect(message(refused.body)).toContain('n’est pas concerné');
      await put(maths, `events/${exam.id}/attendance`, {
        date: day,
        records: [{ studentId: B()[0]!.id, status: 'late', minutesLate: 5 }, { studentId: B()[1]!.id, status: 'present' }],
      }).expect(200);
      const after = (await get(maths, `events/${exam.id}/attendance?date=${day}`).expect(200)).body as AttendanceSheetDto;
      expect(after.rows.find((r) => r.student.id === B()[0]!.id)!.record).toMatchObject({ status: 'late', minutesLate: 5 });
      // A student recorded that day who leaves the group stays on the sheet and the record can be corrected.
      await t.http().delete(`/api/groups/${groupB.id}/members/${B()[0]!.id}`).set(bearer(admin)).expect(200);
      const kept = (await get(maths, `events/${exam.id}/attendance?date=${day}`).expect(200)).body as AttendanceSheetDto;
      const row = kept.rows.find((r) => r.student.id === B()[0]!.id)!;
      expect(row).toMatchObject({ targeted: false, record: { status: 'late' } });
      await put(maths, `events/${exam.id}/attendance`, {
        date: day,
        records: [{ studentId: B()[0]!.id, status: 'excused' }],
      }).expect(200);
      // A class event with no target still rolls the whole class.
      const whole = (await make('examen', { date: friday(1), startTime: '09:00', endTime: '10:00' })).body as EventDto;
      const all = (await get(maths, `events/${whole.id}/attendance?date=${friday(1)}`).expect(200)).body as AttendanceSheetDto;
      expect(all.rows).toHaveLength(10);
    });
  });

  describe('one rule, two forms', () => {
    it('the student filter of the calendar and the resolved list agree for every student', async () => {
      const mine = [
        (await make('devoir')).body,
        (await make('devoir', { target: target([groupA]) })).body,
        (await make('examen', { date: friday(1), target: target([groupB], [A()[0]!.id]) })).body,
        (await make('examen', { date: friday(2), target: { groupIds: [], studentIds: [A()[1]!.id, B()[1]!.id] } })).body,
      ] as EventDto[];
      // A late joiner and a leaver, so the memberships have history.
      await post(admin, `groups/${groupB.id}/members`, { studentIds: [A()[2]!.id], move: true }).expect(201);
      await t.http().delete(`/api/groups/${groupB.id}/members/${B()[4]!.id}`).set(bearer(admin)).expect(200);
      const access = t.app.get(AccessService);
      const targets = t.app.get(TargetsService);
      for (const s of students) {
        const placement = await access.placement(s.id);
        const seen = (
          await t.prisma.event.findMany({
            where: { id: { in: mine.map((e) => e.id) }, ...access.eventAudienceFor(placement, s.id) },
            select: { id: true },
          })
        ).map((e) => e.id);
        const concerned: string[] = [];
        for (const e of mine)
          if ((await targets.concernedIds(t.prisma, { id: e.id, classId })).includes(s.id)) concerned.push(e.id);
        expect(seen.sort(), s.name).toEqual(concerned.sort());
      }
    });
  });
});
