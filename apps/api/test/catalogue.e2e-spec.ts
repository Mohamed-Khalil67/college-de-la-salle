import type {
  ActivityTypeDto,
  ApiError,
  ClassSubjectDto,
  EventDto,
  HomeworkDto,
  RoomDto,
  TeachingAssignmentDto,
} from '@cdls/shared';
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

/** Class subjects, teaching assignments, rooms and teachers' own activity types, through the API. */
describe('Catalogue (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let coordinator: string;
  let maths: string;
  let french: string;
  let yearId: string;
  let bacId: string;
  let nationaleId: string;
  const classes: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };

  const subjectsOf = async (classId: string, token = admin) =>
    (await t.http().get(`/api/classes/${classId}/subjects`).set(bearer(token)).expect(200))
      .body as ClassSubjectDto[];

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    coordinator = await t.token(COORDINATOR);
    maths = await t.token(MATHS_TEACHER);
    french = await t.token(FRENCH_TEACHER);
    yearId = (await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id;
    bacId = (await t.prisma.section.findFirstOrThrow({ where: { code: 'bac' } })).id;
    nationaleId = (await t.prisma.section.findFirstOrThrow({ where: { code: 'nationale' } })).id;
    for (const [key, sectionId] of [
      ['a', bacId],
      ['b', bacId],
      ['c', nationaleId],
    ] as const)
      classes[key] = (
        await t.prisma.schoolClass.create({
          data: {
            schoolYearId: yearId,
            sectionId,
            code: `catalogue-${key}`,
            label: `Classe ${key}`,
          },
        })
      ).id;
  });

  afterAll(() => t.close());

  describe('class subjects', () => {
    it('are added with a coefficient and hours, once per class', async () => {
      const added = await t
        .http()
        .post(`/api/classes/${classes.a}/subjects`)
        .set(bearer(coordinator))
        .send({ subjectId: 'mathematiques', coefficient: 4, hoursPerWeek: 5.5 })
        .expect(201);
      expect(added.body).toMatchObject({
        subjectId: 'mathematiques',
        coefficient: 4,
        hoursPerWeek: 5.5,
        teachers: [],
      });
      await t
        .http()
        .post(`/api/classes/${classes.a}/subjects`)
        .set(bearer(admin))
        .send({ subjectId: 'mathematiques' })
        .expect(409);
      await t
        .http()
        .post(`/api/classes/${classes.a}/subjects`)
        .set(bearer(admin))
        .send({ subjectId: 'arabe' })
        .expect(201);
      expect((await subjectsOf(classes.a)).map((s) => [s.subjectId, s.coefficient])).toEqual([
        ['arabe', 1],
        ['mathematiques', 4],
      ]);
    });

    it('only take subjects taught in the section of the class', async () => {
      const res = await t
        .http()
        .post(`/api/classes/${classes.a}/subjects`)
        .set(bearer(admin))
        .send({ subjectId: 'psychologie' })
        .expect(400);
      expect(message(res.body)).toMatch(/pas enseignée dans cette section/);
      await t
        .http()
        .post(`/api/classes/${classes.c}/subjects`)
        .set(bearer(admin))
        .send({ subjectId: 'psychologie', coefficient: 2 })
        .expect(201);
    });

    it('are listed to staff only', async () => {
      const pupil = await studentOf(t.prisma, 'bac', 'premiere');
      const pupilToken = await t.token(pupil.email);
      await t.http().get(`/api/classes/${classes.a}/subjects`).set(bearer(pupilToken)).expect(403);
      expect(await subjectsOf(classes.a, maths)).toHaveLength(2);
    });

    it('are copied from another class: missing ones added, existing ones aligned, teachers left out', async () => {
      await t
        .http()
        .post(`/api/classes/${classes.b}/subjects`)
        .set(bearer(admin))
        .send({ subjectId: 'mathematiques', coefficient: 1 })
        .expect(201);
      const copied = (
        await t
          .http()
          .post(`/api/classes/${classes.b}/subjects/copy`)
          .set(bearer(coordinator))
          .send({ fromClassId: classes.a })
          .expect(200)
      ).body as ClassSubjectDto[];
      expect(copied.map((s) => [s.subjectId, s.coefficient, s.hoursPerWeek])).toEqual([
        ['arabe', 1, null],
        ['mathematiques', 4, 5.5],
      ]);
      expect(copied.every((s) => s.teachers.length === 0)).toBe(true);
      await t
        .http()
        .post(`/api/classes/${classes.b}/subjects/copy`)
        .set(bearer(admin))
        .send({ fromClassId: classes.b })
        .expect(400);
      await t
        .http()
        .post(`/api/classes/${classes.b}/subjects/copy`)
        .set(bearer(admin))
        .send({ fromClassId: '00000000-0000-4000-8000-000000000009' })
        .expect(404);
    });

    it('skip, when copied, the subjects of another section', async () => {
      const copied = (
        await t
          .http()
          .post(`/api/classes/${classes.a}/subjects/copy`)
          .set(bearer(admin))
          .send({ fromClassId: classes.c })
          .expect(200)
      ).body as ClassSubjectDto[];
      expect(copied.map((s) => s.subjectId)).not.toContain('psychologie');
    });

    it('give teachers their class through an assignment, and keep them while someone teaches', async () => {
      const maths1 = (await subjectsOf(classes.a)).find((s) => s.subjectId === 'mathematiques')!;
      const teacher = await t.prisma.teacher.findFirstOrThrow({
        where: { user: { email: FRENCH_TEACHER } },
      });

      // Without an assignment the teacher is not welcome in the class.
      const cours = await activityTypeId(t.prisma, 'cours');
      const event = {
        activityTypeId: cours,
        title: 'Séance',
        subjectId: 'mathematiques',
        classId: classes.a,
        date: '2027-03-09',
      };
      await t.http().post('/api/events').set(bearer(french)).send(event).expect(403);

      const assignment = (
        await t
          .http()
          .post('/api/teaching-assignments')
          .set(bearer(admin))
          .send({ teacherId: teacher.id, classSubjectId: maths1.id })
          .expect(201)
      ).body as TeachingAssignmentDto;
      expect(assignment).toMatchObject({
        classId: classes.a,
        subjectId: 'mathematiques',
        coefficient: 4,
      });
      await t
        .http()
        .post('/api/teaching-assignments')
        .set(bearer(admin))
        .send({ teacherId: teacher.id, classSubjectId: maths1.id })
        .expect(409);
      // Teaching mathématiques does not open arabe.
      await t
        .http()
        .post('/api/events')
        .set(bearer(french))
        .send({ ...event, subjectId: 'arabe' })
        .expect(403);
      const created = (
        await t.http().post('/api/events').set(bearer(french)).send(event).expect(201)
      ).body as EventDto;

      const refused = await t
        .http()
        .delete(`/api/class-subjects/${maths1.id}`)
        .set(bearer(admin))
        .expect(409);
      expect(message(refused.body)).toMatch(/encore des enseignants/);
      await t
        .http()
        .delete(`/api/teaching-assignments/${assignment.id}`)
        .set(bearer(admin))
        .expect(204);
      await t.http().post('/api/events').set(bearer(french)).send(event).expect(403);
      await t.prisma.event.delete({ where: { id: created.id } });
      await t
        .http()
        .delete(`/api/class-subjects/${maths1.id}`)
        .set(bearer(coordinator))
        .expect(204);
      expect((await subjectsOf(classes.a)).map((s) => s.subjectId)).toEqual(['arabe']);
    });

    it('cannot be removed once grades exist for the subject in the class', async () => {
      const pupil = await studentOf(t.prisma, 'bac', 'premiere');
      const examen = await t.prisma.event.findFirstOrThrow({
        where: {
          classId: pupil.classId,
          subjectId: 'mathematiques',
          activityType: { code: 'examen' },
        },
      });
      expect(examen.periodId).not.toBeNull();
      const seeded = await t.prisma.classSubject.findFirstOrThrow({
        where: { classId: pupil.classId, subjectId: 'mathematiques' },
        include: { assignments: true },
      });
      await t.prisma.teachingAssignment.deleteMany({ where: { classSubjectId: seeded.id } });
      const res = await t
        .http()
        .delete(`/api/class-subjects/${seeded.id}`)
        .set(bearer(admin))
        .expect(409);
      expect(message(res.body)).toMatch(/notes existent/);
      // Put the seeded teachers back for the specs that follow.
      await t.prisma.teachingAssignment.createMany({
        data: seeded.assignments.map((a) => ({
          teacherId: a.teacherId,
          classSubjectId: seeded.id,
        })),
      });
    });
  });

  describe('rooms', () => {
    let room: RoomDto;
    let pupilClass = '';

    beforeAll(async () => {
      pupilClass = (await studentOf(t.prisma, 'bac', 'premiere')).classId;
    });
    const cours = () => activityTypeId(t.prisma, 'cours');

    it('are created with a unique name, a capacity and a kind', async () => {
      room = (
        await t
          .http()
          .post('/api/rooms')
          .set(bearer(coordinator))
          .send({ name: 'Salle 99', capacity: 24, kind: 'lab' })
          .expect(201)
      ).body as RoomDto;
      expect(room).toMatchObject({ name: 'Salle 99', capacity: 24, kind: 'lab', active: true });
      await t
        .http()
        .post('/api/rooms')
        .set(bearer(admin))
        .send({ name: 'salle 99', kind: 'classroom' })
        .expect(409);
      await t
        .http()
        .post('/api/rooms')
        .set(bearer(admin))
        .send({ name: 'Mauvaise', kind: 'cave' })
        .expect(400);
      await t
        .http()
        .post('/api/rooms')
        .set(bearer(admin))
        .send({ name: 'Vide', kind: 'hall', capacity: 0 })
        .expect(400);
    });

    it('can be booked by an event, which keeps its free-text place for outside spots', async () => {
      const body = {
        activityTypeId: await cours(),
        title: 'TP de chimie',
        subjectId: 'mathematiques',
        classId: pupilClass,
        date: '2027-03-10',
      };
      const inRoom = (
        await t
          .http()
          .post('/api/events')
          .set(bearer(maths))
          .send({ ...body, roomId: room.id })
          .expect(201)
      ).body as EventDto;
      expect(inRoom).toMatchObject({ roomId: room.id, roomName: 'Salle 99', place: '' });
      const outside = (
        await t
          .http()
          .post('/api/events')
          .set(bearer(maths))
          .send({ ...body, place: 'Stade municipal' })
          .expect(201)
      ).body as EventDto;
      expect(outside).toMatchObject({ roomId: null, roomName: null, place: 'Stade municipal' });
      await t
        .http()
        .post('/api/events')
        .set(bearer(maths))
        .send({ ...body, roomId: '00000000-0000-4000-8000-000000000009' })
        .expect(404);
      await t.prisma.event.delete({ where: { id: outside.id } });
    });

    it('cannot be deleted while events use them, only retired', async () => {
      const res = await t.http().delete(`/api/rooms/${room.id}`).set(bearer(admin)).expect(409);
      expect(message(res.body)).toMatch(/désactivez-la/);
      const retired = (
        await t
          .http()
          .patch(`/api/rooms/${room.id}`)
          .set(bearer(coordinator))
          .send({ active: false })
          .expect(200)
      ).body as RoomDto;
      expect(retired.active).toBe(false);
      const body = {
        activityTypeId: await cours(),
        title: 'Autre',
        subjectId: 'mathematiques',
        classId: pupilClass,
        date: '2027-03-11',
        roomId: room.id,
      };
      const refused = await t.http().post('/api/events').set(bearer(maths)).send(body).expect(400);
      expect(message(refused.body)).toMatch(/n’est plus utilisée/);
      await t.prisma.event.deleteMany({ where: { roomId: room.id } });
      await t.http().delete(`/api/rooms/${room.id}`).set(bearer(admin)).expect(204);
    });
  });

  describe('teachers’ own activity types', () => {
    it('drive homework by their flags: a private « homework » type shows in the student’s devoirs', async () => {
      const pupil = await studentOf(t.prisma, 'bac', 'premiere');
      const pupilToken = await t.token(pupil.email);
      const type = (
        await t
          .http()
          .post('/api/activity-types')
          .set(bearer(maths))
          .send({
            label: 'Exposé à rendre',
            colour: 'brick',
            icon: 'edit',
            gradable: false,
            repeatable: false,
            homework: true,
          })
          .expect(201)
      ).body as ActivityTypeDto;

      const event = (
        await t
          .http()
          .post('/api/events')
          .set(bearer(maths))
          .send({
            activityTypeId: type.id,
            title: 'Exposé sur Fermat',
            subjectId: 'mathematiques',
            classId: pupil.classId,
            date: '2027-03-12',
          })
          .expect(201)
      ).body as EventDto;
      expect(event.type).toMatchObject({
        homework: true,
        gradable: false,
        label: 'Exposé à rendre',
      });
      expect(event.periodId).toBeNull();

      const list = (
        await t.http().get('/api/homework?from=2027-03-01').set(bearer(pupilToken)).expect(200)
      ).body as HomeworkDto[];
      expect(list.find((h) => h.event.id === event.id)).toMatchObject({ done: false });
      await t
        .http()
        .put(`/api/homework/${event.id}/done`)
        .set(bearer(pupilToken))
        .send({})
        .expect(200);

      // A plain lesson is not homework, whatever its title says.
      const lesson = await t.prisma.event.findFirstOrThrow({
        where: { classId: pupil.classId, activityType: { code: 'cours' } },
      });
      await t
        .http()
        .put(`/api/homework/${lesson.id}/done`)
        .set(bearer(pupilToken))
        .send({})
        .expect(400);

      // The type cannot be used by another teacher until it is promoted.
      const other = {
        activityTypeId: type.id,
        title: 'Volé',
        subjectId: 'francais',
        classId: pupil.classId,
        date: '2027-03-13',
      };
      await t.http().post('/api/events').set(bearer(french)).send(other).expect(404);
      await t.http().post(`/api/activity-types/${type.id}/promote`).set(bearer(admin)).expect(200);
      await t.http().post('/api/events').set(bearer(french)).send(other).expect(201);
      await t.prisma.event.deleteMany({ where: { activityTypeId: type.id } });
    });
  });
});
