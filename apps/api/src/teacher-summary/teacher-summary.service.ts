import { Injectable, Logger } from '@nestjs/common';
import {
  type AbsenceRecord,
  absenceWindowStart,
  addDays,
  givenHomework,
  REPEATED_ABSENCE_MAX,
  repeatedAbsences,
  rollCallDone,
  schoolToday,
  TEACHER_HOMEWORK_DAYS,
  TEACHER_TESTS_DAYS,
  type RepeatedAbsenceDto,
  type TeacherSummaryClassDto,
  type TeacherSummaryDto,
  type TeacherSummaryHomeworkDto,
  type TeacherSummaryLessonDto,
  type TeacherSummaryPendingDto,
  type TeacherSummarySection,
  type TimedClassSlot,
  upcomingTests,
} from '@cdls/shared';
import { CalendarDaysService } from '../calendar-days/calendar-days.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { forbidden } from '../common/errors.js';
import { EventsService } from '../events/events.service.js';
import { QuickGradingService } from '../grades/quick-grading.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TargetsService } from '../targets/targets.service.js';
import { TimetableReadService } from '../timetable/timetable-read.service.js';

/** At most this many absence rows are read for the window (a class holds a few hundred at worst). */
const ABSENCE_SCAN = 5000;

interface Taught {
  readonly classId: string;
  readonly classLabel: string;
  readonly subjectId: string;
  readonly subjectName: string;
}

/**
 * The teacher's home page in one answer. It reads through the services the detail pages use (so the same
 * rules, audiences and counts apply) and only for the calling teacher's own classes. Each section is read on its
 * own: one that fails is named in `failed` and left empty, the others are still returned.
 */
@Injectable()
export class TeacherSummaryService {
  private readonly logger = new Logger(TeacherSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableReadService,
    private readonly calendarDays: CalendarDaysService,
    private readonly grading: QuickGradingService,
    private readonly events: EventsService,
    private readonly targets: TargetsService,
  ) {}

  async summary(user: AuthUser): Promise<TeacherSummaryDto> {
    const teacherId = user.teacherId;
    if (user.role !== 'teacher' || !teacherId) throw forbidden();
    const today = schoolToday();
    const taught = await this.taught(teacherId);
    const classes: TeacherSummaryClassDto[] = [
      ...new Map(taught.map((t) => [t.classId, { classId: t.classId, classLabel: t.classLabel }])).values(),
    ];
    const classLabels = new Map(classes.map((c) => [c.classId, c.classLabel]));
    const failed: TeacherSummarySection[] = [];
    const section = async <T>(name: TeacherSummarySection, empty: T, work: () => Promise<T>): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        // The cause goes to the log (no request data in it); the page only learns which block failed.
        this.logger.warn(`Teacher summary, section ${name}: ${error instanceof Error ? error.message : 'failed'}`);
        failed.push(name);
        return empty;
      }
    };

    const [lessons, pending, homework, tests, absences] = await Promise.all([
      section('lessons', { lessons: [], calendarDays: [] }, () => this.lessons(user, teacherId, today)),
      section('pending', [], () => this.pending(user, taught)),
      section('homework', [], () => this.homework(user, teacherId, today)),
      section('tests', [], () => this.tests(user, classes.map((c) => c.classId), today)),
      section('absences', [], () => this.absences(classLabels, today)),
    ]);
    return {
      today,
      failed: [...failed].sort(),
      classes,
      lessons: lessons.lessons,
      calendarDays: lessons.calendarDays,
      pending,
      homework,
      tests,
      absences,
    };
  }

  /** The teacher's class and subject pairs of the current year, by class then subject. */
  private async taught(teacherId: string): Promise<Taught[]> {
    const rows = await this.prisma.teachingAssignment.findMany({
      where: { teacherId, classSubject: { schoolClass: { schoolYear: { isCurrent: true } } } },
      select: {
        classSubject: {
          select: {
            classId: true,
            subjectId: true,
            schoolClass: { select: { label: true } },
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { classSubject: { schoolClass: { code: 'asc' } } },
        { classSubject: { subject: { name: 'asc' } } },
      ],
    });
    return rows.map(({ classSubject: cs }) => ({
      classId: cs.classId,
      classLabel: cs.schoolClass.label,
      subjectId: cs.subjectId,
      subjectName: cs.subject.name,
    }));
  }

  private async lessons(
    user: AuthUser,
    teacherId: string,
    today: string,
  ): Promise<{ lessons: TeacherSummaryLessonDto[]; calendarDays: TeacherSummaryDto['calendarDays'] }> {
    const [sessions, calendarDays, taken] = await Promise.all([
      this.timetable.occurrences({ teacherId, from: today, to: today }, user),
      this.calendarDays.list({ from: today, to: today }, user),
      this.rollCallsTaken(teacherId, today),
    ]);
    const lessons = sessions.map((session) => {
      const values = session.status === 'moved_from' ? session.original : session.current;
      const done =
        session.status !== 'cancelled' &&
        rollCallDone(
          { classId: session.classId, startTime: values.startTime, endTime: values.endTime },
          taken,
        );
      return { session, rollCallDone: done };
    });
    return { lessons, calendarDays };
  }

  /** The timed class events the teacher saved a roll call for on that day. */
  private async rollCallsTaken(teacherId: string, day: string): Promise<TimedClassSlot[]> {
    const rows = await this.prisma.attendance.findMany({
      where: { recordedById: teacherId, date: fromDay(day) },
      select: { event: { select: { classId: true, startTime: true, endTime: true } } },
      distinct: ['eventId'],
    });
    return rows.flatMap(({ event }) =>
      event.classId && event.startTime && event.endTime
        ? [{ classId: event.classId, startTime: event.startTime, endTime: event.endTime }]
        : [],
    );
  }

  /** The notes to finish of every class and subject taught (the same rows « Noter » lists). */
  private async pending(user: AuthUser, taught: readonly Taught[]): Promise<TeacherSummaryPendingDto[]> {
    const entries = await Promise.all(
      taught.map(async (t) => ({
        classId: t.classId,
        subjectId: t.subjectId,
        label: `${t.classLabel}, ${t.subjectName}`,
        pending: await this.grading.pending({ classId: t.classId, subjectId: t.subjectId }, user),
      })),
    );
    return entries.filter((e) => e.pending.length > 0);
  }

  /** The teacher's own homework due in the next two weeks, with how many students ticked it. */
  private async homework(user: AuthUser, teacherId: string, today: string): Promise<TeacherSummaryHomeworkDto[]> {
    const list = await this.events.occurrences(
      { from: today, to: addDays(today, TEACHER_HOMEWORK_DAYS) },
      user,
      { authorId: teacherId, activityType: { homework: true } },
    );
    return Promise.all(
      givenHomework(list, teacherId, today).map(async (occurrence) => {
        // Only the students the homework concerns today count, as on the detail page.
        const concerned = occurrence.event.classId
          ? await this.targets.concernedIds(this.prisma, occurrence.event)
          : null;
        const done = await this.prisma.homeworkCompletion.count({
          where: { eventId: occurrence.event.id, ...(concerned ? { studentId: { in: concerned } } : {}) },
        });
        return { occurrence, done };
      }),
    );
  }

  /** Exams and tests of the teacher's classes in the next two weeks. */
  private async tests(user: AuthUser, classIds: readonly string[], today: string) {
    if (!classIds.length) return [];
    const list = await this.events.occurrences(
      { from: today, to: addDays(today, TEACHER_TESTS_DAYS) },
      user,
      { classId: { in: [...classIds] }, activityType: { gradable: true, homework: false, repeatable: false } },
    );
    return upcomingTests(list, new Set(classIds), today);
  }

  /** Students with repeated unexcused absences in the teacher's classes lately. */
  private async absences(classLabels: ReadonlyMap<string, string>, today: string): Promise<RepeatedAbsenceDto[]> {
    if (!classLabels.size) return [];
    const rows = await this.prisma.attendance.findMany({
      where: {
        status: 'absent',
        date: { gte: fromDay(absenceWindowStart(today)), lte: fromDay(today) },
        event: { classId: { in: [...classLabels.keys()] } },
      },
      select: {
        date: true,
        student: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
        event: { select: { classId: true } },
      },
      orderBy: { date: 'desc' },
      take: ABSENCE_SCAN,
    });
    const records = rows.flatMap((r): AbsenceRecord[] =>
      r.event.classId
        ? [
            {
              studentId: r.student.id,
              firstName: r.student.user.firstName,
              lastName: r.student.user.lastName,
              classId: r.event.classId,
              day: toDay(r.date),
            },
          ]
        : [],
    );
    return repeatedAbsences(records, today, REPEATED_ABSENCE_MAX).map((t) => ({
      ...t,
      classLabel: classLabels.get(t.classId) ?? '',
    }));
  }
}
