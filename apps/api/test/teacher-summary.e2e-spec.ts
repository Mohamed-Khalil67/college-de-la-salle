import {
  addDays,
  REPEATED_ABSENCE_MIN_DAYS,
  schoolToday,
  type TeacherSummaryDto,
} from '@cdls/shared';
import { fromDay } from '../src/common/dates.js';
import {
  activityTypeId,
  ADMIN,
  bearer,
  createTestApp,
  MATHS_TEACHER,
  studentOf,
  type TestApp,
} from './helpers.js';

/** GET /teacher/summary: the teacher's home page in one answer, for the teacher's own classes only. */
describe('Teacher summary (e2e)', () => {
  let t: TestApp;
  let teacher: string;
  /** A teacher who does not teach the fixtures' class. */
  let other: string;
  let teacherId: string;
  let classId: string;
  let pupils: { studentId: string }[];
  const today = schoolToday();
  const madeIds: string[] = [];

  const get = async (token: string) =>
    (await t.http().get('/api/teacher/summary').set(bearer(token)).expect(200)).body as TeacherSummaryDto;

  const makeEvent = async (kind: 'devoir' | 'examen' | 'cours', title: string, date: string, timed = false) => {
    const event = await t.prisma.event.create({
      data: {
        activityTypeId: await activityTypeId(t.prisma, kind),
        title,
        subjectId: 'mathematiques',
        classId,
        date: fromDay(date),
        authorId: teacherId,
        ...(timed ? { startTime: '09:00', endTime: '10:00' } : {}),
      },
    });
    madeIds.push(event.id);
    return event;
  };

  beforeAll(async () => {
    t = await createTestApp();
    const first = await studentOf(t.prisma, 'bac', 'premiere');
    classId = first.classId;
    teacher = await t.token(MATHS_TEACHER);
    const outsider = await t.prisma.teacher.findFirstOrThrow({
      where: {
        user: { status: 'active', email: { endsWith: '@demo.cdls.test' } },
        assignments: { some: {}, none: { classSubject: { classId } } },
      },
      select: { user: { select: { email: true } } },
    });
    other = await t.token(outsider.user.email);
    teacherId = (
      await t.prisma.teacher.findFirstOrThrow({ where: { user: { email: MATHS_TEACHER } } })
    ).id;
    pupils = (
      await t.prisma.enrollment.findMany({
        where: {
          classId,
          leftOn: null,
          // Students no earlier spec marked absent, so the counts below are this spec's own.
          student: { studentNumber: { startsWith: 'CDLS-' }, attendance: { none: { status: 'absent' } } },
        },
        select: { studentId: true },
        orderBy: { student: { user: { email: 'asc' } } },
        take: 2,
      })
    ).map((e) => ({ studentId: e.studentId }));
  });

  afterAll(async () => {
    // Completions and attendance rows go with their events.
    await t.prisma.event.deleteMany({ where: { id: { in: madeIds } } });
    await t.close();
  });

  it('is for teachers only', async () => {
    await t.http().get('/api/teacher/summary').expect(401);
    const student = await studentOf(t.prisma, 'bac', 'premiere');
    const pupil = await t.token(student.email);
    const admin = await t.token(ADMIN);
    await t.http().get('/api/teacher/summary').set(bearer(pupil)).expect(403);
    await t.http().get('/api/teacher/summary').set(bearer(admin)).expect(403);
  });

  it('answers the day, the classes taught and no failed section', async () => {
    const summary = await get(teacher);
    expect(summary.today).toBe(today);
    expect(summary.failed).toEqual([]);
    expect(summary.classes.map((c) => c.classId)).toContain(classId);
    expect(Array.isArray(summary.lessons)).toBe(true);
    expect(summary.lessons.every((l) => typeof l.rollCallDone === 'boolean')).toBe(true);
  });

  it('lists the homework the teacher gave with how many students ticked it, and not another teacher’s view of it', async () => {
    const homework = await makeEvent('devoir', 'Summary homework', addDays(today, 2));
    await t.prisma.homeworkCompletion.create({
      data: { eventId: homework.id, studentId: pupils[0]!.studentId },
    });
    const mine = (await get(teacher)).homework.find((h) => h.occurrence.event.id === homework.id);
    expect(mine).toMatchObject({ done: 1, occurrence: { day: addDays(today, 2) } });
    const theirs = await get(other);
    expect(theirs.homework.some((h) => h.occurrence.event.id === homework.id)).toBe(false);
  });

  it('lists the tests of the teacher’s classes only', async () => {
    const exam = await makeEvent('examen', 'Summary exam', addDays(today, 3));
    expect((await get(teacher)).tests.map((o) => o.event.id)).toContain(exam.id);
    const elsewhere = await get(other);
    // Another teacher does not teach this class: nothing of it leaks.
    expect(elsewhere.classes.map((c) => c.classId)).not.toContain(classId);
    expect(elsewhere.tests.map((o) => o.event.id)).not.toContain(exam.id);
  });

  it('lists the notes to finish of the classes taught', async () => {
    const exam = await makeEvent('examen', 'Summary pending', addDays(today, -1));
    const entry = (await get(teacher)).pending.find((p) => p.classId === classId && p.subjectId === 'mathematiques');
    expect(entry?.pending.map((p) => p.event.id)).toContain(exam.id);
    expect(entry?.label).toContain('Mathématiques');
  });

  it('flags a student absent on several days, not one with fewer, not excused ones', async () => {
    const lesson = await makeEvent('cours', 'Summary lesson', addDays(today, -10), true);
    const [often, rarely] = pupils;
    const row = (studentId: string, day: number, status: 'absent' | 'excused') => ({
      eventId: lesson.id,
      studentId,
      date: fromDay(addDays(today, -day)),
      status,
      recordedById: teacherId,
    });
    await t.prisma.attendance.createMany({
      data: [
        ...Array.from({ length: REPEATED_ABSENCE_MIN_DAYS }, (_, i) => row(often!.studentId, i + 1, 'absent')),
        row(rarely!.studentId, 1, 'absent'),
        row(rarely!.studentId, 2, 'absent'),
        row(rarely!.studentId, 3, 'excused'),
      ],
    });
    const summary = await get(teacher);
    const flagged = summary.absences.map((a) => a.studentId);
    expect(flagged).toContain(often!.studentId);
    expect(flagged).not.toContain(rarely!.studentId);
    expect(summary.absences.find((a) => a.studentId === often!.studentId)).toMatchObject({
      days: REPEATED_ABSENCE_MIN_DAYS,
      lastDay: addDays(today, -1),
      classId,
    });
    // Another teacher's page never shows this class's students.
    expect((await get(other)).absences.map((a) => a.studentId)).not.toContain(often!.studentId);
  });
});
