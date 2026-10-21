import type { ActivityTypeDto, ApiError, SubjectDto } from '@cdls/shared';
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

type Who = 'student' | 'teacher' | 'coordinator' | 'admin';
const WHO: readonly Who[] = ['student', 'teacher', 'coordinator', 'admin'];

/** What a call needs besides the token: its own resources (so each role changes its own rows). */
interface Resources {
  readonly subjectId: string;
  readonly classSubjectId: string;
  readonly roomId: string;
  readonly roomToDeleteId: string;
  readonly dayId: string;
  readonly dayToDeleteId: string;
  readonly periodId: string;
  readonly periodToDeleteId: string;
  readonly yearId: string;
  readonly yearToDeleteId: string;
}

interface Case {
  readonly name: string;
  /** The status the admin and the coordinator get. */
  readonly ok: number;
  readonly call: (
    t: TestApp,
    token: string,
    who: Who,
    r: Resources,
    ctx: Context,
  ) => Promise<number>;
}

interface Context {
  readonly spareClassId: string;
  readonly spareYearId: string;
  readonly sectionId: string;
}

const status = async (req: PromiseLike<{ status: number }>) => (await req).status;

/**
 * Who may edit the year's structure: the admin and the coordinators. Students and ordinary teachers are
 * refused, and a few actions stay with the admin alone.
 */
describe('Structure permissions (e2e)', () => {
  let t: TestApp;
  const tokens = {} as Record<Who, string>;
  const resources = {} as Record<Who, Resources>;
  let ctx: Context;

  beforeAll(async () => {
    t = await createTestApp();
    const pupil = await studentOf(t.prisma, 'bac', 'premiere');
    tokens.student = await t.token(pupil.email);
    tokens.teacher = await t.token(MATHS_TEACHER);
    tokens.coordinator = await t.token(COORDINATOR);
    tokens.admin = await t.token(ADMIN);

    // A spare school year with a spare class, so nothing the seed relies on is touched.
    const section = await t.prisma.section.findFirstOrThrow({ where: { code: 'bac' } });
    const year = await t.prisma.schoolYear.create({
      data: {
        label: '2090-2091',
        startsOn: new Date('2090-09-01T00:00:00Z'),
        endsOn: new Date('2091-06-30T00:00:00Z'),
      },
    });
    const spareClass = await t.prisma.schoolClass.create({
      data: {
        schoolYearId: year.id,
        sectionId: section.id,
        code: 'spare',
        label: 'Classe de test',
      },
    });
    ctx = { spareClassId: spareClass.id, spareYearId: year.id, sectionId: section.id };

    for (const who of WHO) {
      const subject = await t.prisma.subject.create({
        data: { id: `perm-${who}`, name: `Matière ${who}`, group: 'Test', sections: ['bac'] },
      });
      const classSubject = await t.prisma.classSubject.create({
        data: { classId: spareClass.id, subjectId: (await spare(who, 'cs')).id },
      });
      const room = (name: string) =>
        t.prisma.room.create({ data: { name: `${name} ${who}`, kind: 'classroom' } });
      const day = (label: string) =>
        t.prisma.calendarDay.create({
          data: {
            schoolYearId: year.id,
            type: 'holiday',
            label: `${label} ${who}`,
            startsOn: new Date('2090-11-01T00:00:00Z'),
            endsOn: new Date('2090-11-02T00:00:00Z'),
          },
        });
      const index = WHO.indexOf(who);
      const spareYear = await t.prisma.schoolYear.create({
        data: {
          label: `${2100 + index}-${2101 + index}`,
          startsOn: new Date(`${2100 + index}-09-01T00:00:00Z`),
          endsOn: new Date(`${2101 + index}-06-30T00:00:00Z`),
        },
      });
      const toDelete = await t.prisma.schoolYear.create({
        data: {
          label: `${2110 + index}-${2111 + index}`,
          startsOn: new Date(`${2110 + index}-09-01T00:00:00Z`),
          endsOn: new Date(`${2111 + index}-06-30T00:00:00Z`),
        },
      });
      const period = (number: number, from: string, to: string) =>
        t.prisma.period.create({
          data: {
            schoolYearId: spareYear.id,
            number,
            label: `Période ${number}`,
            kind: 'semester',
            sectionId: section.id,
            startsOn: new Date(`${from}T00:00:00Z`),
            endsOn: new Date(`${to}T00:00:00Z`),
          },
        });
      resources[who] = {
        subjectId: subject.id,
        classSubjectId: classSubject.id,
        roomId: (await room('Salle à modifier')).id,
        roomToDeleteId: (await room('Salle à supprimer')).id,
        dayId: (await day('Jour à modifier')).id,
        dayToDeleteId: (await day('Jour à supprimer')).id,
        periodId: (await period(1, `${2100 + index}-09-10`, `${2100 + index}-10-10`)).id,
        periodToDeleteId: (await period(2, `${2100 + index}-10-20`, `${2100 + index}-11-20`)).id,
        yearId: spareYear.id,
        yearToDeleteId: toDelete.id,
      };
    }

    /** A subject the spare class does not have yet, per role (for POST /classes/:id/subjects). */
    async function spare(who: Who, tag: string) {
      return t.prisma.subject.create({
        data: {
          id: `perm-${tag}-${who}`,
          name: `Matière ${tag} ${who}`,
          group: 'Test',
          sections: ['bac'],
        },
      });
    }
  });

  afterAll(() => t.close());

  const cases: readonly Case[] = [
    {
      name: 'POST /subjects',
      ok: 201,
      call: (t, token, who) =>
        status(
          t
            .http()
            .post('/api/subjects')
            .set(bearer(token))
            .send({ name: `Nouvelle matière ${who}`, group: 'Test', sections: ['bac'] }),
        ),
    },
    {
      name: 'PATCH /subjects/:id',
      ok: 200,
      call: (t, token, who, r) =>
        status(
          t
            .http()
            .patch(`/api/subjects/${r.subjectId}`)
            .set(bearer(token))
            .send({ group: `Groupe ${who}` }),
        ),
    },
    {
      name: 'POST /classes/:id/subjects',
      ok: 201,
      call: (t, token, who, _r, c) =>
        status(
          t
            .http()
            .post(`/api/classes/${c.spareClassId}/subjects`)
            .set(bearer(token))
            .send({ subjectId: `perm-${who}`, coefficient: 2 }),
        ),
    },
    {
      name: 'PATCH /class-subjects/:id',
      ok: 200,
      call: (t, token, who, r) =>
        status(
          t
            .http()
            .patch(`/api/class-subjects/${r.classSubjectId}`)
            .set(bearer(token))
            .send({ coefficient: 3, hoursPerWeek: 2 }),
        ),
    },
    {
      name: 'POST /rooms',
      ok: 201,
      call: (t, token, who) =>
        status(
          t
            .http()
            .post('/api/rooms')
            .set(bearer(token))
            .send({ name: `Nouvelle salle ${who}`, kind: 'lab', capacity: 20 }),
        ),
    },
    {
      name: 'PATCH /rooms/:id',
      ok: 200,
      call: (t, token, who, r) =>
        status(t.http().patch(`/api/rooms/${r.roomId}`).set(bearer(token)).send({ capacity: 35 })),
    },
    {
      name: 'DELETE /rooms/:id',
      ok: 204,
      call: (t, token, _who, r) =>
        status(t.http().delete(`/api/rooms/${r.roomToDeleteId}`).set(bearer(token))),
    },
    {
      name: 'POST /calendar-days',
      ok: 201,
      call: (t, token, who, _r, c) =>
        status(
          t
            .http()
            .post('/api/calendar-days')
            .set(bearer(token))
            .send({
              schoolYearId: c.spareYearId,
              type: 'no_classes',
              label: `Pont ${who}`,
              startsOn: '2090-12-01',
              endsOn: '2090-12-03',
            }),
        ),
    },
    {
      name: 'PATCH /calendar-days/:id',
      ok: 200,
      call: (t, token, who, r) =>
        status(
          t
            .http()
            .patch(`/api/calendar-days/${r.dayId}`)
            .set(bearer(token))
            .send({ label: `Modifié ${who}` }),
        ),
    },
    {
      name: 'DELETE /calendar-days/:id',
      ok: 204,
      call: (t, token, _who, r) =>
        status(t.http().delete(`/api/calendar-days/${r.dayToDeleteId}`).set(bearer(token))),
    },
    {
      name: 'POST /school-years',
      ok: 201,
      call: (t, token, who) => {
        const index = WHO.indexOf(who);
        return status(
          t
            .http()
            .post('/api/school-years')
            .set(bearer(token))
            .send({
              label: `${2120 + index}-${2121 + index}`,
              startsOn: `${2120 + index}-09-01`,
              endsOn: `${2121 + index}-06-30`,
            }),
        );
      },
    },
    {
      name: 'PATCH /school-years/:id',
      ok: 200,
      call: (t, token, who, r) =>
        status(
          t
            .http()
            .patch(`/api/school-years/${r.yearId}`)
            .set(bearer(token))
            .send({ endsOn: `${2101 + WHO.indexOf(who)}-07-15` }),
        ),
    },
    {
      name: 'POST /school-years/:id/periods',
      ok: 201,
      call: (t, token, who, r) =>
        status(
          t
            .http()
            .post(`/api/school-years/${r.yearId}/periods`)
            .set(bearer(token))
            .send({
              number: 1,
              label: '1er trimestre',
              startsOn: `${2100 + WHO.indexOf(who)}-09-10`,
              endsOn: `${2100 + WHO.indexOf(who)}-12-10`,
            }),
        ),
    },
    {
      name: 'PATCH /periods/:id',
      ok: 200,
      call: (t, token, who, r) =>
        status(
          t
            .http()
            .patch(`/api/periods/${r.periodId}`)
            .set(bearer(token))
            .send({ label: 'Renommée' }),
        ),
    },
    {
      name: 'DELETE /periods/:id',
      ok: 204,
      call: (t, token, _who, r) =>
        status(t.http().delete(`/api/periods/${r.periodToDeleteId}`).set(bearer(token))),
    },
  ];

  describe.each(cases)('$name', (c) => {
    it.each(['student', 'teacher'] as const)('is refused to a %s (403)', async (who) => {
      expect(await c.call(t, tokens[who], who, resources[who], ctx)).toBe(403);
    });
    it('is allowed to a coordinator', async () => {
      expect(await c.call(t, tokens.coordinator, 'coordinator', resources.coordinator, ctx)).toBe(
        c.ok,
      );
    });
    it('is allowed to the admin', async () => {
      expect(await c.call(t, tokens.admin, 'admin', resources.admin, ctx)).toBe(c.ok);
    });
  });

  describe('what stays with the admin', () => {
    const adminOnly: readonly {
      name: string;
      call: (token: string) => PromiseLike<{ status: number }>;
    }[] = [
      {
        name: 'POST /classes',
        call: (token) =>
          t.http().post('/api/classes').set(bearer(token)).send({
            schoolYearId: ctx.spareYearId,
            sectionId: ctx.sectionId,
            code: 'autre',
            label: 'Autre classe',
          }),
      },
      {
        name: 'POST /teaching-assignments',
        call: (token) =>
          t.http().post('/api/teaching-assignments').set(bearer(token)).send({
            teacherId: '00000000-0000-4000-8000-000000000001',
            classSubjectId: resources.admin.classSubjectId,
          }),
      },
      {
        name: 'POST /school-years/:id/current',
        call: (token) =>
          t.http().post(`/api/school-years/${resources.admin.yearId}/current`).set(bearer(token)),
      },
      {
        name: 'DELETE /school-years/:id',
        call: (token) =>
          t.http().delete(`/api/school-years/${resources.admin.yearToDeleteId}`).set(bearer(token)),
      },
      {
        name: 'POST /periods/:id/close',
        call: (token) =>
          t.http().post(`/api/periods/${resources.admin.periodId}/close`).set(bearer(token)),
      },
      {
        name: 'POST /activity-types/:id/promote',
        call: (token) =>
          t
            .http()
            .post('/api/activity-types/00000000-0000-4000-8000-000000000002/promote')
            .set(bearer(token)),
      },
      { name: 'GET /users', call: (token) => t.http().get('/api/users').set(bearer(token)) },
      {
        name: 'PATCH /users/:id (isCoordinator)',
        call: (token) =>
          t
            .http()
            .patch('/api/users/00000000-0000-4000-8000-000000000003')
            .set(bearer(token))
            .send({ isCoordinator: true }),
      },
    ];

    it.each(adminOnly.map((a) => a.name))(
      '%s is refused to students, teachers and coordinators (403)',
      async (name) => {
        const action = adminOnly.find((a) => a.name === name)!;
        for (const who of ['student', 'teacher', 'coordinator'] as const) {
          expect((await action.call(tokens[who])).status, `${name} as ${who}`).toBe(403);
        }
      },
    );
  });

  describe('coordinators', () => {
    it('are made and unmade by the admin, and the change applies on the next request', async () => {
      const teacherUser = await t.prisma.user.findUniqueOrThrow({
        where: { email: FRENCH_TEACHER },
      });
      const token = await t.token(FRENCH_TEACHER);
      const room = (name: string) =>
        t.http().post('/api/rooms').set(bearer(token)).send({ name, kind: 'classroom' });

      await room('Salle refusée').expect(403);

      await t
        .http()
        .patch(`/api/users/${teacherUser.id}`)
        .set(bearer(tokens.admin))
        .send({ isCoordinator: true })
        .expect(200);
      await room('Salle du coordinateur').expect(201);

      await t
        .http()
        .patch(`/api/users/${teacherUser.id}`)
        .set(bearer(tokens.admin))
        .send({ isCoordinator: false })
        .expect(200);
      await room('Salle retirée').expect(403);

      const audit = await t.prisma.auditLog.findMany({
        where: {
          entity: 'user',
          entityId: teacherUser.id,
          action: { startsWith: 'teacher.coordinator' },
        },
        orderBy: { id: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual([
        'teacher.coordinator.grant',
        'teacher.coordinator.revoke',
      ]);
    });

    it('can only be teachers', async () => {
      const pupil = await studentOf(t.prisma, 'bac', 'premiere');
      const user = await t.prisma.student.findUniqueOrThrow({ where: { id: pupil.studentId } });
      const res = await t
        .http()
        .patch(`/api/users/${user.userId}`)
        .set(bearer(tokens.admin))
        .send({ isCoordinator: true })
        .expect(400);
      expect(String((res.body as ApiError).message)).toMatch(/enseignant/);
    });

    it('show up in the session of the coordinator and in the user list', async () => {
      const me = await t.http().get('/api/auth/me').set(bearer(tokens.coordinator)).expect(200);
      expect(me.body).toMatchObject({ isCoordinator: true });
      const other = await t.http().get('/api/auth/me').set(bearer(tokens.teacher)).expect(200);
      expect(other.body).toMatchObject({ isCoordinator: false });
    });
  });

  describe('activity types', () => {
    const create = (token: string, label: string) =>
      t.http().post('/api/activity-types').set(bearer(token)).send({
        label,
        colour: 'green',
        icon: 'book',
        gradable: true,
        repeatable: false,
        homework: false,
      });
    const list = async (token: string) =>
      (await t.http().get('/api/activity-types').set(bearer(token)).expect(200))
        .body as ActivityTypeDto[];

    it('lets a teacher create a private type that others do not see, until the admin promotes it', async () => {
      const mine = (await create(tokens.teacher, 'Quiz privé').expect(201)).body as ActivityTypeDto;
      expect(mine).toMatchObject({ isSystem: false, gradable: true, colour: 'green' });
      expect(mine.ownerTeacherId).not.toBeNull();

      expect((await list(tokens.teacher)).map((x) => x.id)).toContain(mine.id);
      expect((await list(tokens.coordinator)).map((x) => x.id)).not.toContain(mine.id);
      expect((await list(tokens.admin)).map((x) => x.id)).toContain(mine.id);
      // Someone else's private type is not even found.
      await t
        .http()
        .patch(`/api/activity-types/${mine.id}`)
        .set(bearer(tokens.coordinator))
        .send({ label: 'Volé' })
        .expect(404);

      // Only the admin promotes: not the coordinator, not the owner.
      await t
        .http()
        .post(`/api/activity-types/${mine.id}/promote`)
        .set(bearer(tokens.coordinator))
        .expect(403);
      await t
        .http()
        .post(`/api/activity-types/${mine.id}/promote`)
        .set(bearer(tokens.teacher))
        .expect(403);
      const promoted = (
        await t
          .http()
          .post(`/api/activity-types/${mine.id}/promote`)
          .set(bearer(tokens.admin))
          .expect(200)
      ).body as ActivityTypeDto;
      expect(promoted).toMatchObject({ ownerTeacherId: null, ownerName: null });
      expect((await list(tokens.coordinator)).map((x) => x.id)).toContain(mine.id);
      await t
        .http()
        .post(`/api/activity-types/${mine.id}/promote`)
        .set(bearer(tokens.admin))
        .expect(409);
    });

    it('creates school-wide types for the admin, and refuses students', async () => {
      const wide = (await create(tokens.admin, 'Sortie pédagogique').expect(201))
        .body as ActivityTypeDto;
      expect(wide.ownerTeacherId).toBeNull();
      await create(tokens.student, 'Intrus').expect(403);
    });

    it('only takes colours and icons from the fixed palette', async () => {
      const res = await t.http().post('/api/activity-types').set(bearer(tokens.teacher)).send({
        label: 'Rose',
        colour: '#ff00aa',
        icon: 'book',
        gradable: false,
        repeatable: false,
        homework: false,
      });
      expect(res.status).toBe(400);
      await t
        .http()
        .post('/api/activity-types')
        .set(bearer(tokens.teacher))
        .send({
          label: 'Icône',
          colour: 'navy',
          icon: 'skull',
          gradable: false,
          repeatable: false,
          homework: false,
        })
        .expect(400);
    });

    it('keeps the flags of system types and refuses to delete them', async () => {
      const system = (await list(tokens.admin)).find((x) => x.code === 'examen')!;
      expect(system.isSystem).toBe(true);
      await t
        .http()
        .patch(`/api/activity-types/${system.id}`)
        .set(bearer(tokens.admin))
        .send({ gradable: false })
        .expect(400);
      await t
        .http()
        .delete(`/api/activity-types/${system.id}`)
        .set(bearer(tokens.admin))
        .expect(400);
      // A system type keeps its colour editable.
      await t
        .http()
        .patch(`/api/activity-types/${system.id}`)
        .set(bearer(tokens.admin))
        .send({ colour: 'red' })
        .expect(200);
    });

    it("locks a type's flags once events use it, and refuses to delete it", async () => {
      const type = (await create(tokens.teacher, 'Dictée notée').expect(201))
        .body as ActivityTypeDto;
      await t
        .http()
        .patch(`/api/activity-types/${type.id}`)
        .set(bearer(tokens.teacher))
        .send({ repeatable: true })
        .expect(200);
      const pupil = await studentOf(t.prisma, 'bac', 'premiere');
      const teacher = await t.prisma.teacher.findFirstOrThrow({
        where: { user: { email: MATHS_TEACHER } },
      });
      await t.prisma.event.create({
        data: {
          activityTypeId: type.id,
          title: 'Dictée',
          classId: pupil.classId,
          subjectId: 'mathematiques',
          date: new Date('2090-01-05T00:00:00Z'),
          authorId: teacher.id,
        },
      });
      const res = await t
        .http()
        .patch(`/api/activity-types/${type.id}`)
        .set(bearer(tokens.teacher))
        .send({ gradable: false })
        .expect(409);
      expect(String((res.body as ApiError).message)).toMatch(/événements utilisent/);
      await t
        .http()
        .delete(`/api/activity-types/${type.id}`)
        .set(bearer(tokens.teacher))
        .expect(409);
      await t
        .http()
        .patch(`/api/activity-types/${type.id}`)
        .set(bearer(tokens.teacher))
        .send({ archived: true })
        .expect(200);
      await t.prisma.event.deleteMany({ where: { activityTypeId: type.id } });
    });

    it('never lets a homework type repeat weekly', async () => {
      const res = await t.http().post('/api/activity-types').set(bearer(tokens.teacher)).send({
        label: 'Devoir hebdo',
        colour: 'brick',
        icon: 'edit',
        gradable: false,
        repeatable: true,
        homework: true,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('subjects', () => {
    it('are created from a name, with a stable id, and refuse duplicates', async () => {
      const first = (
        await t
          .http()
          .post('/api/subjects')
          .set(bearer(tokens.coordinator))
          .send({
            name: 'Théâtre & Arts',
            group: 'Éducation et culture',
            sections: ['bac', 'nationale'],
          })
          .expect(201)
      ).body as SubjectDto;
      expect(first).toMatchObject({
        id: 'theatre-arts',
        sections: ['nationale', 'bac'],
        archived: false,
      });
      await t
        .http()
        .post('/api/subjects')
        .set(bearer(tokens.admin))
        .send({ name: 'théâtre & arts', group: 'x', sections: ['bac'] })
        .expect(409);
      // Renaming never changes the id stored on grades and events.
      const renamed = (
        await t
          .http()
          .patch('/api/subjects/theatre-arts')
          .set(bearer(tokens.admin))
          .send({ name: 'Théâtre' })
          .expect(200)
      ).body as SubjectDto;
      expect(renamed).toMatchObject({ id: 'theatre-arts', name: 'Théâtre' });
    });

    it('can be archived: hidden by default and refused for new classes', async () => {
      await t
        .http()
        .patch('/api/subjects/theatre-arts')
        .set(bearer(tokens.admin))
        .send({ archived: true })
        .expect(200);
      const visible = (
        (await t.http().get('/api/subjects').set(bearer(tokens.student)).expect(200))
          .body as SubjectDto[]
      ).map((s) => s.id);
      expect(visible).not.toContain('theatre-arts');
      const all = (
        (
          await t
            .http()
            .get('/api/subjects?includeArchived=true')
            .set(bearer(tokens.student))
            .expect(200)
        ).body as SubjectDto[]
      ).map((s) => s.id);
      expect(all).toContain('theatre-arts');
      await t
        .http()
        .post(`/api/classes/${ctx.spareClassId}/subjects`)
        .set(bearer(tokens.admin))
        .send({ subjectId: 'theatre-arts' })
        .expect(400);
    });
  });
});
