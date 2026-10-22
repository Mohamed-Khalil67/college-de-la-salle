import type {
  AttendanceSheetDto,
  EventDto,
  GradeSheetDto,
  HomeworkDto,
  OccurrenceDto,
  Paginated,
  PostDto,
  ReportCardDto,
  SchoolYearDto,
  StudentAttendanceDto,
  StudentGradesDto,
} from '@cdls/shared';
import {
  ADMIN,
  bearer,
  createTestApp,
  MATHS_TEACHER,
  activityTypeId,
  seededEvent,
  studentOf,
  type TestApp,
} from './helpers.js';

/** The main flows of the school year, end to end. */
describe('School flows (e2e)', () => {
  let t: TestApp;
  let student: Awaited<ReturnType<typeof studentOf>>;
  let admin: string;
  let teacher: string;
  let pupil: string;
  let cours: string;
  let examen: string;

  beforeAll(async () => {
    t = await createTestApp();
    student = await studentOf(t.prisma, 'bac', 'premiere');
    admin = await t.token(ADMIN);
    teacher = await t.token(MATHS_TEACHER);
    pupil = await t.token(student.email);
    cours = await activityTypeId(t.prisma, 'cours');
    examen = await activityTypeId(t.prisma, 'examen');
  });

  afterAll(() => t.close());

  const examGrade = async () => {
    const res = await t
      .http()
      .get(`/api/students/${student.studentId}/grades`)
      .set(bearer(pupil))
      .expect(200);
    return (res.body as StudentGradesDto).subjects
      .flatMap((s) => s.grades)
      .find((g) => g.event.type.code === 'examen' && g.event.subjectId === 'mathematiques');
  };

  it('exam: correct a grade (audited), unpublish, publish, the student sees the new mark', async () => {
    const exam = await seededEvent(t.prisma, student.classId, 'examen', 'mathematiques');
    await t
      .http()
      .put(`/api/events/${exam.id}/grades`)
      .set(bearer(teacher))
      .send({ entries: [{ studentId: student.studentId, score: 15.5, comment: 'Bon travail' }] })
      .expect(200);
    const trail = await t.prisma.auditLog.findMany({
      where: { action: 'grade.update', entity: 'grade' },
    });
    expect(trail.some((a) => (a.after as { score?: number } | null)?.score === 15.5)).toBe(true);

    await t
      .http()
      .post(`/api/events/${exam.id}/grades/publish`)
      .set(bearer(teacher))
      .send({ published: false })
      .expect(200);
    expect(await examGrade()).toBeUndefined();

    const published = await t
      .http()
      .post(`/api/events/${exam.id}/grades/publish`)
      .set(bearer(teacher))
      .send({ published: true })
      .expect(200);
    expect((published.body as GradeSheetDto).rows.every((r) => r.grade?.published)).toBe(true);
    expect((await examGrade())?.grade).toMatchObject({
      score: 15.5,
      outOf: 20,
      comment: 'Bon travail',
    });
  });

  it('grades: rejects a mark above the scale and a student from another class', async () => {
    const exam = await seededEvent(t.prisma, student.classId, 'examen', 'mathematiques');
    const other = await studentOf(t.prisma, 'nationale', 'secondaire-2');
    const put = (entries: object[]) =>
      t.http().put(`/api/events/${exam.id}/grades`).set(bearer(teacher)).send({ entries });
    await put([{ studentId: student.studentId, score: 21 }]).expect(400);
    await put([{ studentId: other.studentId, score: 10 }]).expect(400);
  });

  it('attendance: only on a day the course happens; the student sees the absence', async () => {
    const course = await seededEvent(t.prisma, student.classId, 'cours', 'mathematiques');
    await t
      .http()
      .get(`/api/events/${course.id}/attendance?date=2026-10-19`)
      .set(bearer(teacher))
      .expect(400);
    const saved = await t
      .http()
      .put(`/api/events/${course.id}/attendance`)
      .set(bearer(teacher))
      .send({
        date: '2026-10-18',
        records: [{ studentId: student.studentId, status: 'absent', note: 'Malade' }],
      })
      .expect(200);
    const row = (saved.body as AttendanceSheetDto).rows.find(
      (r) => r.student.id === student.studentId,
    );
    expect(row?.record?.status).toBe('absent');

    const mine = await t
      .http()
      .get(`/api/students/${student.studentId}/attendance`)
      .set(bearer(pupil))
      .expect(200);
    expect((mine.body as StudentAttendanceDto[]).some((a) => a.record.date === '2026-10-18')).toBe(
      true,
    );
  });

  it('homework: the student ticks a devoir and the teacher sees it', async () => {
    const devoir = await seededEvent(t.prisma, student.classId, 'devoir');
    await t.prisma.homeworkCompletion.deleteMany({
      where: { eventId: devoir.id, studentId: student.studentId },
    });
    const list = await t.http().get('/api/homework?from=2026-10-01').set(bearer(pupil)).expect(200);
    expect((list.body as HomeworkDto[]).find((h) => h.event.id === devoir.id)?.done).toBe(false);

    const done = await t
      .http()
      .put(`/api/homework/${devoir.id}/done`)
      .set(bearer(pupil))
      .expect(200);
    expect((done.body as HomeworkDto).done).toBe(true);
    const physicsTeacher = await t.prisma.event.findUniqueOrThrow({
      where: { id: devoir.id },
      include: { author: { include: { user: true } } },
    });
    expect(physicsTeacher.author.user.email).toBeTruthy();
    const admins = await t
      .http()
      .get(`/api/events/${devoir.id}/completions`)
      .set(bearer(admin))
      .expect(200);
    expect(
      (admins.body as { student: { id: string } }[]).some(
        (c) => c.student.id === student.studentId,
      ),
    ).toBe(true);

    const undone = await t
      .http()
      .delete(`/api/homework/${devoir.id}/done`)
      .set(bearer(pupil))
      .expect(200);
    expect((undone.body as HomeworkDto).done).toBe(false);
  });

  it('calendar: a teacher adds a weekly course; the class sees each occurrence; .ics export', async () => {
    const created = await t
      .http()
      .post('/api/events')
      .set(bearer(teacher))
      .send({
        activityTypeId: cours,
        title: 'Soutien de maths',
        subjectId: 'mathematiques',
        classId: student.classId,
        date: '2026-11-03',
        startTime: '14:00',
        endTime: '15:00',
        repeatUntil: '2026-11-24',
        attachments: [{ label: 'Fiche', url: 'https://example.org/fiche.pdf' }],
      })
      .expect(201);
    const event = created.body as EventDto;
    const res = await t
      .http()
      .get('/api/events/occurrences?from=2026-11-01&to=2026-11-30')
      .set(bearer(pupil))
      .expect(200);
    const days = (res.body as OccurrenceDto[])
      .filter((o) => o.event.id === event.id)
      .map((o) => o.day);
    expect(days).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);

    const ics = await t.http().get(`/api/events/${event.id}/ics`).set(bearer(pupil)).expect(200);
    expect(ics.text).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261124T235959');

    await t
      .http()
      .post('/api/events')
      .set(bearer(teacher))
      .send({ activityTypeId: examen, title: 'Sans classe', date: '2026-11-03' })
      .expect(400);
    await t
      .http()
      .post('/api/events')
      .set(bearer(teacher))
      .send({
        activityTypeId: cours,
        title: 'Lien',
        classId: student.classId,
        date: '2026-11-03',
        attachments: [{ label: 'x', url: 'javascript:alert(1)' }],
      })
      .expect(400);
    await t.http().delete(`/api/events/${event.id}`).set(bearer(teacher)).expect(204);
  });

  it('posts: the student reads what is addressed to them', async () => {
    const res = await t.http().get('/api/posts').set(bearer(pupil)).expect(200);
    const titles = (res.body as Paginated<PostDto>).items.map((p) => p.title);
    expect(titles).toContain("Bienvenue dans l'espace élèves");
    expect(titles).not.toContain('Calculatrices pour le Bac nationale');
    expect(titles).not.toContain('Lectures du trimestre'); // Seconde only
  });

  it('report cards: close the period, generate, publish, download the PDF', async () => {
    const years = await t.http().get('/api/school-years').set(bearer(admin)).expect(200);
    const period = (years.body as SchoolYearDto[])
      .find((y) => y.isCurrent)!
      .periods.find((x) => x.number === 1)!;

    await t
      .http()
      .post(`/api/periods/${period.id}/report-cards/generate`)
      .set(bearer(admin))
      .send({})
      .expect(409);
    await t.http().post(`/api/periods/${period.id}/close`).set(bearer(admin)).expect(200);
    const generated = await t
      .http()
      .post(`/api/periods/${period.id}/report-cards/generate`)
      .set(bearer(admin))
      .send({})
      .expect(200);
    // Everyone enrolled until the end of the period: the 60 demo students, and the accounts other specs
    // graduated at the end of the year (they keep their final card).
    const untilTheEnd = await t.prisma.student.count({
      where: {
        enrollments: {
          some: {
            schoolYearId: period.schoolYearId,
            OR: [{ leftOn: null }, { leftOn: { gte: new Date(`${period.endsOn}T00:00:00Z`) } }],
          },
        },
      },
    });
    expect(untilTheEnd).toBeGreaterThanOrEqual(60);
    expect((generated.body as { count: number }).count).toBe(untilTheEnd);

    const before = await t
      .http()
      .get(`/api/students/${student.studentId}/report-cards`)
      .set(bearer(pupil))
      .expect(200);
    expect(before.body).toEqual([]);

    await t
      .http()
      .post(`/api/periods/${period.id}/report-cards/publish`)
      .set(bearer(admin))
      .send({})
      .expect(200);
    const after = await t
      .http()
      .get(`/api/students/${student.studentId}/report-cards`)
      .set(bearer(pupil))
      .expect(200);
    const [card] = after.body as ReportCardDto[];
    expect(card?.average).not.toBeNull();
    expect(card?.rank).toBeGreaterThanOrEqual(1);
    expect(card?.subjects.find((s) => s.subjectId === 'mathematiques')?.gradeCount).toBe(1);

    const pdf = await t
      .http()
      .get(`/api/report-cards/${card!.id}/pdf`)
      .set(bearer(pupil))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});
