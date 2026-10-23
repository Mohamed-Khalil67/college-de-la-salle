import {
  addDays,
  type EventDto,
  type NotificationDto,
  type NotificationKind,
  type NotificationPreferencesDto,
  type NotificationSummaryDto,
  type Paginated,
  weekday,
} from '@cdls/shared';
import { schoolToday } from '../src/common/dates.js';
import { NotificationMailService } from '../src/notifications/notification-mail.service.js';
import { createRolloverSource, removeRolloverSource } from './rollover-fixture.js';
import { ADMIN, bearer, createTestApp, MATHS_TEACHER, studentOf, type TestApp } from './helpers.js';

const TODAY = schoolToday();
const day = (d: string) => new Date(`${d}T00:00:00Z`);

/** Fridays far ahead: no lesson of the demo timetable, so timed events do not clash. */
const friday = (n: number) => {
  const d = new Date('2027-02-05T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};

/**
 * Notifications: written with the change, for the people it concerns only. A student never receives (or
 * reads) what concerns another class or another group; e-mails go only to those who opted in, grouped.
 */
describe('Notifications (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let maths: string;
  let classId: string;
  let otherClassId: string;
  /** Students of the class (Première, Bac français), the TP groups' members first known. */
  let classStudents: { studentId: string; userId: string; email: string }[];
  let outsider: { studentId: string; userId: string; email: string };
  let mathsUserId: string;
  const events: string[] = [];

  const typeId = async (code: string) =>
    (await t.prisma.activityType.findUniqueOrThrow({ where: { code } })).id;
  /**
   * Only what THIS spec's requests made: the specs before it have notified the same demo students about
   * their own sessions, and those rows stay in the shared database.
   */
  let since: Date;
  const of = (userId: string, kind?: NotificationKind) =>
    t.prisma.notification.findMany({
      where: { userId, createdAt: { gte: since }, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  const countFor = (userIds: string[], entityId: string) =>
    t.prisma.notification.count({
      where: {
        userId: { in: userIds },
        entityId: { startsWith: entityId },
        createdAt: { gte: since },
      },
    });

  /** Puts a session back to what the weekly rule says (through the API, so the index follows). */
  async function restore(slotId: string, date: string): Promise<void> {
    const ex = await t.prisma.slotException.findUniqueOrThrow({
      where: { slotId_date: { slotId, date: day(date) } },
    });
    await t.http().delete(`/api/timetable/exceptions/${ex.id}`).set(bearer(admin)).expect(200);
  }

  /** A day, at least `weeks` weeks ahead, on which the slot has a session (not a holiday). */
  async function sessionDay(slotId: string, weeks: number): Promise<string> {
    const slot = await t.prisma.timetableSlot.findUniqueOrThrow({ where: { id: slotId } });
    let d = addDays(TODAY, 7 * weeks);
    while (weekday(d) !== slot.weekday) d = addDays(d, 1);
    for (let i = 0; i < 8; i++, d = addDays(d, 7)) {
      const res = await t
        .http()
        .post('/api/timetable/check')
        .set(bearer(admin))
        .send({ slotId, scope: 'this', date: d, exception: { kind: 'cancelled' } });
      if (res.status === 200 || res.status === 201) return d;
    }
    throw new Error('no session found');
  }

  beforeAll(async () => {
    since = new Date(Date.now() - 2000);
    t = await createTestApp();
    admin = await t.token(ADMIN);
    maths = await t.token(MATHS_TEACHER);
    const first = await studentOf(t.prisma, 'bac', 'premiere');
    classId = first.classId;
    const out = await studentOf(t.prisma, 'bac', 'terminale');
    otherClassId = out.classId;
    const toStudent = async (studentId: string, email: string) => ({
      studentId,
      email,
      userId: (await t.prisma.student.findUniqueOrThrow({ where: { id: studentId } })).userId,
    });
    outsider = await toStudent(out.studentId, out.email);
    classStudents = await Promise.all(
      (
        await t.prisma.enrollment.findMany({
          where: { classId, leftOn: null },
          include: { student: { include: { user: true } } },
        })
      ).map((e) => toStudent(e.studentId, e.student.user.email)),
    );
    mathsUserId = (await t.prisma.user.findUniqueOrThrow({ where: { email: MATHS_TEACHER } })).id;
  });

  afterAll(async () => {
    for (const id of events) await t.http().delete(`/api/events/${id}`).set(bearer(admin));
    // Leave the shared database as found: the notifications this spec caused go too.
    await t.prisma.notification.deleteMany({ where: { createdAt: { gte: since } } });
    await t.close();
  });

  describe('sessions', () => {
    it('tells the whole class and the teacher, never another class nor the actor', async () => {
      const slot = await t.prisma.timetableSlot.findFirstOrThrow({
        where: {
          classSubject: { classId, subjectId: 'mathematiques' },
          groupId: null,
          weekParity: null,
        },
      });
      const date = await sessionDay(slot.id, 4);
      const res = await t
        .http()
        .post(`/api/timetable/slots/${slot.id}/exceptions`)
        .set(bearer(maths))
        .send({ date, kind: 'cancelled', reason: 'Conseil de classe' })
        .expect(201);
      const exceptionId = (res.body as { exception: { id: string } }).exception.id;
      const entity = `${slot.id}@${date}`;
      expect(
        await countFor(
          classStudents.map((s) => s.userId),
          entity,
        ),
      ).toBe(classStudents.length);
      expect(await countFor([outsider.userId], entity)).toBe(0);
      // The teacher did it: no notification for themself.
      expect(await countFor([mathsUserId], entity)).toBe(0);
      const [mine] = await of(classStudents[0]!.userId, 'session_cancelled');
      expect(mine).toMatchObject({ link: '/eleve/emploi-du-temps', mailState: 'none' });
      expect(mine!.body).toContain('Mathématiques');
      expect(mine!.body).toContain('Motif : Conseil de classe');

      // The admin moves it instead: the teacher is told now, with the class.
      await t
        .http()
        .post(`/api/timetable/slots/${slot.id}/exceptions`)
        .set(bearer(admin))
        .send({ date, kind: 'moved', newStart: '21:00', newEnd: '22:00' })
        .expect(201);
      const [teacherNotice] = await t.prisma.notification.findMany({
        where: {
          userId: mathsUserId,
          kind: 'session_moved',
          entityId: entity,
          createdAt: { gte: since },
        },
      });
      expect(teacherNotice).toMatchObject({ link: '/enseignant/emploi-du-temps' });
      expect(teacherNotice!.body).toContain('(Première)');
      expect(teacherNotice!.body).toContain('21:00 – 22:00');

      // Restored: everyone hears it is back.
      await t
        .http()
        .delete(`/api/timetable/exceptions/${exceptionId}`)
        .set(bearer(admin))
        .expect(200);
      expect(
        await t.prisma.notification.count({
          where: {
            kind: 'session_restored',
            entityId: entity,
            createdAt: { gte: since },
            userId: { in: classStudents.map((s) => s.userId) },
          },
        }),
      ).toBe(classStudents.length);
    });

    it('tells only the members of the group a group session is for', async () => {
      const slot = await t.prisma.timetableSlot.findFirstOrThrow({
        where: { classSubject: { classId }, groupId: { not: null } },
        include: { group: { include: { members: { where: { leftOn: null } } } } },
      });
      const members = new Set(slot.group!.members.map((m) => m.studentId));
      expect(members.size).toBeGreaterThan(0);
      const date = await sessionDay(slot.id, 5);
      await t
        .http()
        .post(`/api/timetable/slots/${slot.id}/exceptions`)
        .set(bearer(admin))
        .send({ date, kind: 'cancelled' })
        .expect(201);
      const entity = `${slot.id}@${date}`;
      const inGroup = classStudents.filter((s) => members.has(s.studentId));
      const notInGroup = classStudents.filter((s) => !members.has(s.studentId));
      expect(notInGroup.length).toBeGreaterThan(0);
      expect(
        await countFor(
          inGroup.map((s) => s.userId),
          entity,
        ),
      ).toBe(inGroup.length);
      expect(
        await countFor(
          notInGroup.map((s) => s.userId),
          entity,
        ),
      ).toBe(0);
      await restore(slot.id, date);
    });

    it('tells the substitute teacher when their session is cancelled or changed', async () => {
      const slot = await t.prisma.timetableSlot.findFirstOrThrow({
        where: {
          classSubject: { classId, subjectId: 'mathematiques' },
          groupId: null,
          weekParity: null,
        },
      });
      const substitute = await t.prisma.teacher.findFirstOrThrow({
        where: { user: { email: 'claire.dubois@demo.cdls.test' } },
      });
      const date = await sessionDay(slot.id, 8);
      const send = (body: object) =>
        t
          .http()
          .post(`/api/timetable/slots/${slot.id}/exceptions`)
          .set(bearer(admin))
          .send({ date, ...body });
      await send({ kind: 'substitute', newTeacherId: substitute.id }).expect(201);
      const entity = `${slot.id}@${date}`;
      // Naming a substitute announces nothing (see docs); taking the session away does, to them too.
      expect(await countFor([substitute.userId], entity)).toBe(0);
      await send({ kind: 'cancelled' }).expect(201);
      expect(await countFor([substitute.userId], entity)).toBe(1);
      expect(await countFor([mathsUserId], entity)).toBe(1);
      await restore(slot.id, date);
    });

    it('a dry run (« check ») notifies nobody', async () => {
      const slot = await t.prisma.timetableSlot.findFirstOrThrow({
        where: {
          classSubject: { classId, subjectId: 'mathematiques' },
          groupId: null,
          weekParity: null,
        },
      });
      const date = await sessionDay(slot.id, 7);
      expect(
        await countFor(
          classStudents.map((s) => s.userId),
          `${slot.id}@${date}`,
        ),
      ).toBe(0);
    });

    it('an archived year stays read-only: the write is refused and nobody is notified', async () => {
      const fixture = await createRolloverSource(t.prisma, `notif${Date.now()}`, {
        label: '2047-2048',
        startsOn: '2047-09-01',
        endsOn: '2048-06-30',
      });
      try {
        await t.prisma.schoolYear.update({
          where: { id: fixture.yearId },
          data: { archivedAt: new Date() },
        });
        const slot = await t.prisma.timetableSlot.findFirstOrThrow({
          where: { classSubject: { schoolClass: { schoolYearId: fixture.yearId } } },
        });
        let date = '2047-10-01';
        while (weekday(date) !== slot.weekday) date = addDays(date, 1);
        await t
          .http()
          .post(`/api/timetable/slots/${slot.id}/exceptions`)
          .set(bearer(admin))
          .send({ date, kind: 'cancelled' })
          .expect(409);
        const userIds = Object.values(fixture.students).flatMap((list) =>
          list.map((s) => s.userId),
        );
        expect(await t.prisma.notification.count({ where: { userId: { in: userIds } } })).toBe(0);
      } finally {
        await removeRolloverSource(t.prisma, fixture);
      }
    });
  });

  describe('events, homework and grades', () => {
    it('a homework assigned to one student reaches that student only', async () => {
      const [target, ...others] = classStudents;
      const res = await t
        .http()
        .post('/api/events')
        .set(bearer(maths))
        .send({
          activityTypeId: await typeId('devoir'),
          title: 'Notif devoir ciblé',
          subjectId: 'mathematiques',
          classId,
          date: friday(1),
          target: { groupIds: [], studentIds: [target!.studentId] },
        })
        .expect(201);
      const id = (res.body as EventDto).id;
      events.push(id);
      const [n] = await t.prisma.notification.findMany({
        where: { entityId: id, kind: 'homework_assigned' },
      });
      expect(n).toMatchObject({ userId: target!.userId, link: '/eleve/devoirs' });
      expect(n!.body).toContain('à rendre le');
      expect(
        await countFor(
          others.map((s) => s.userId),
          id,
        ),
      ).toBe(0);
      expect(await countFor([outsider.userId], id)).toBe(0);
    });

    it('a moved, re-roomed and cancelled exam reaches its class, not another', async () => {
      const res = await t
        .http()
        .post('/api/events')
        .set(bearer(maths))
        .send({
          activityTypeId: await typeId('examen'),
          title: 'Notif examen',
          subjectId: 'mathematiques',
          classId,
          date: friday(2),
          startTime: '09:00',
          endTime: '10:00',
        })
        .expect(201);
      const id = (res.body as EventDto).id;
      // Creating an exam announces nothing (only homework is « assigned »).
      expect(await t.prisma.notification.count({ where: { entityId: id } })).toBe(0);
      const ids = classStudents.map((s) => s.userId);

      await t
        .http()
        .patch(`/api/events/${id}`)
        .set(bearer(maths))
        .send({ title: 'Notif examen (sujet)' })
        .expect(200);
      expect(await t.prisma.notification.count({ where: { entityId: id } })).toBe(0);

      await t
        .http()
        .patch(`/api/events/${id}`)
        .set(bearer(maths))
        .send({ date: friday(3) })
        .expect(200);
      expect(
        await t.prisma.notification.count({
          where: { entityId: id, kind: 'event_moved', userId: { in: ids } },
        }),
      ).toBe(ids.length);

      await t
        .http()
        .patch(`/api/events/${id}`)
        .set(bearer(maths))
        .send({ place: 'Gymnase' })
        .expect(200);
      expect(
        await t.prisma.notification.count({ where: { entityId: id, kind: 'event_room_changed' } }),
      ).toBe(ids.length);

      await t.http().delete(`/api/events/${id}`).set(bearer(admin)).expect(204);
      const cancelled = await t.prisma.notification.findMany({
        where: { entityId: id, kind: 'event_cancelled' },
      });
      // The class, and the author (the admin deleted it).
      expect(cancelled.map((n) => n.userId).sort()).toEqual([...ids, mathsUserId].sort());
      expect(await countFor([outsider.userId], id)).toBe(0);
    });

    it('publishing grades tells the graded students once', async () => {
      const res = await t
        .http()
        .post('/api/events')
        .set(bearer(maths))
        .send({
          activityTypeId: await typeId('controle'),
          title: 'Notif contrôle',
          subjectId: 'mathematiques',
          classId,
          date: friday(4),
        })
        .expect(201);
      const id = (res.body as EventDto).id;
      const [a, b, c] = classStudents;
      await t
        .http()
        .put(`/api/events/${id}/grades`)
        .set(bearer(maths))
        .send({
          entries: [
            { studentId: a!.studentId, score: 14 },
            { studentId: b!.studentId, score: 11 },
          ],
        })
        .expect(200);
      expect(await t.prisma.notification.count({ where: { entityId: id } })).toBe(0);
      await t
        .http()
        .post(`/api/events/${id}/grades/publish`)
        .set(bearer(maths))
        .send({ published: true })
        .expect(200);
      const published = await t.prisma.notification.findMany({
        where: { entityId: id, kind: 'grade_published' },
      });
      expect(published.map((n) => n.userId).sort()).toEqual([a!.userId, b!.userId].sort());
      expect(published[0]!.link).toBe('/eleve/notes');
      // Publishing again tells nobody again; a late grade is announced to its student alone.
      await t
        .http()
        .post(`/api/events/${id}/grades/publish`)
        .set(bearer(maths))
        .send({ published: true })
        .expect(200);
      await t
        .http()
        .put(`/api/events/${id}/grades`)
        .set(bearer(maths))
        .send({ entries: [{ studentId: c!.studentId, score: 9 }] })
        .expect(200);
      const after = await t.prisma.notification.findMany({
        where: { entityId: id, kind: 'grade_published' },
      });
      expect(after.map((n) => n.userId).sort()).toEqual([a!.userId, b!.userId, c!.userId].sort());
      await t
        .http()
        .put(`/api/events/${id}/grades`)
        .set(bearer(maths))
        .send({ entries: [a, b, c].map((s) => ({ studentId: s!.studentId, score: null })) })
        .expect(200);
      await t.http().delete(`/api/events/${id}`).set(bearer(maths)).expect(204);
    });
  });

  describe('reading', () => {
    it('lists, counts and marks only the user’s own notifications', async () => {
      const me = classStudents[0]!;
      const token = await t.token(me.email);
      const outsiderToken = await t.token(outsider.email);
      // A clean slate, whatever the specs before left unread for this demo student.
      await t.http().post('/api/notifications/read-all').set(bearer(token)).expect(200);
      const made = await Promise.all(
        [1, 2, 3].map((i) =>
          t.prisma.notification.create({
            data: {
              userId: me.userId,
              kind: 'grade_published',
              title: `Lecture ${i}`,
              body: `Note ${i}`,
              entity: 'test',
              entityId: `read-${i}`,
            },
          }),
        ),
      );
      const unread = async (bearerToken: string) =>
        (
          await t
            .http()
            .get('/api/notifications?unread=true&pageSize=100')
            .set(bearer(bearerToken))
            .expect(200)
        ).body as Paginated<NotificationDto>;
      const count = async (bearerToken: string) =>
        (
          (await t.http().get('/api/notifications/summary').set(bearer(bearerToken)).expect(200))
            .body as NotificationSummaryDto
        ).unread;

      expect((await unread(token)).items.map((n) => n.id).sort()).toEqual(
        made.map((n) => n.id).sort(),
      );
      expect(await count(token)).toBe(3);

      // Another student sees none of them and cannot mark one.
      const someone = made[0]!;
      await t
        .http()
        .post(`/api/notifications/${someone.id}/read`)
        .set(bearer(outsiderToken))
        .expect(404);
      const theirs = (
        await t.http().get('/api/notifications?pageSize=100').set(bearer(outsiderToken)).expect(200)
      ).body as Paginated<NotificationDto>;
      for (const n of made) expect(theirs.items.some((x) => x.id === n.id)).toBe(false);
      await t.http().post('/api/notifications/not-a-uuid/read').set(bearer(token)).expect(400);

      const read = (
        await t.http().post(`/api/notifications/${someone.id}/read`).set(bearer(token)).expect(200)
      ).body as NotificationDto;
      expect(read.readAt).not.toBeNull();
      expect((await unread(token)).items.some((n) => n.id === someone.id)).toBe(false);
      expect(await count(token)).toBe(2);

      const all = (
        await t.http().post('/api/notifications/read-all').set(bearer(token)).expect(200)
      ).body as { updated: number };
      expect(all.updated).toBe(2);
      expect(await count(token)).toBe(0);
      await t.http().get('/api/notifications').expect(401);
    });
  });

  describe('e-mail digest', () => {
    it('is off by default, then grouped in one mail per user, never for a past day', async () => {
      const me = classStudents[1]!;
      const token = await t.token(me.email);
      const prefs = (
        await t.http().get('/api/notifications/preferences').set(bearer(token)).expect(200)
      ).body as NotificationPreferencesDto;
      expect(prefs.emailEnabled).toBe(false);
      await t
        .http()
        .put('/api/notifications/preferences')
        .set(bearer(token))
        .send({ emailEnabled: 'yes' })
        .expect(400);
      await t
        .http()
        .put('/api/notifications/preferences')
        .set(bearer(token))
        .send({ emailEnabled: true })
        .expect(200);

      const digest = t.app.get(NotificationMailService);
      await digest.sendDigests(); // whatever was pending before this test
      const mailsBefore = t.mails.length;

      // Two exams of the class moved: two notifications, one mail.
      for (const n of [5, 6]) {
        const res = await t
          .http()
          .post('/api/events')
          .set(bearer(maths))
          .send({
            activityTypeId: await typeId('examen'),
            title: `Notif mail ${n}`,
            subjectId: 'mathematiques',
            classId,
            date: friday(n),
          })
          .expect(201);
        const id = (res.body as EventDto).id;
        events.push(id);
        await t
          .http()
          .patch(`/api/events/${id}`)
          .set(bearer(maths))
          .send({ date: friday(n + 10) })
          .expect(200);
      }
      const pending = await t.prisma.notification.findMany({
        where: { userId: me.userId, mailState: 'pending' },
      });
      expect(pending).toHaveLength(2);
      // Someone who did not opt in has nothing queued.
      expect(
        await t.prisma.notification.count({
          where: { userId: classStudents[2]!.userId, mailState: 'pending' },
        }),
      ).toBe(0);
      // A notification about a day already past is never mailed.
      const past = await t.prisma.notification.create({
        data: {
          userId: me.userId,
          kind: 'session_cancelled',
          title: 'Ancienne',
          body: 'Ancienne séance',
          occursOn: day(addDays(TODAY, -1)),
          entity: 'test',
          entityId: 'past',
          mailState: 'pending',
        },
      });

      const run = await digest.sendDigests();
      expect(run.mails).toBeGreaterThanOrEqual(1);
      const mine = t.mails.slice(mailsBefore).filter((m) => m.to === me.email);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.subject).toBe('2 changements dans votre emploi du temps et vos devoirs');
      expect(mine[0]!.text).toContain('Notif mail 5');
      expect(mine[0]!.text).toContain('/eleve/notifications');
      expect(mine[0]!.text).not.toContain('Ancienne');
      expect(
        (await t.prisma.notification.findUniqueOrThrow({ where: { id: past.id } })).mailState,
      ).toBe('skipped');
      expect(t.mails.slice(mailsBefore).some((m) => m.to === classStudents[2]!.email)).toBe(false);

      // Nothing new: no second mail.
      await digest.sendDigests();
      expect(t.mails.slice(mailsBefore).filter((m) => m.to === me.email)).toHaveLength(1);
      await t
        .http()
        .put('/api/notifications/preferences')
        .set(bearer(token))
        .send({ emailEnabled: false })
        .expect(200);
    });

    it('purges notifications past the retention', async () => {
      const me = classStudents[0]!;
      const old = await t.prisma.notification.create({
        data: {
          userId: me.userId,
          kind: 'grade_published',
          title: 'Vieille',
          body: 'Vieille note',
          entity: 'test',
          entityId: 'old',
          createdAt: new Date('2020-01-01T00:00:00Z'),
        },
      });
      expect(await t.app.get(NotificationMailService).purge()).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.notification.findUnique({ where: { id: old.id } })).toBeNull();
      expect(otherClassId).not.toBe(classId);
    });
  });
});
