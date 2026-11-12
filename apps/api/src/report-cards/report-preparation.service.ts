import { ConflictException, Injectable } from '@nestjs/common';
import {
  GRADE_REMINDER_COOLDOWN_HOURS,
  type GradeReminderItem,
  gradesReminderNotice,
  schoolToday,
  type SectionId,
} from '@cdls/shared';
import type { Period } from '../generated/prisma/client.js';
import { fromDay } from '../common/dates.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { notFound } from '../common/errors.js';
import { type NotificationDraft, NotificationsService } from '../notifications/notifications.service.js';
import { toPeriodDto } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ReportGapDto,
  ReportPreparationClassDto,
  ReportPreparationDto,
  ReportReminderDto,
  ReportReminderResultDto,
} from './dto/report-preparation.dto.js';
import { classGaps, type GapEvent } from './report-gaps.js';

export const PERIOD_ALREADY_CLOSED =
  'La période est clôturée : il n’y a plus de notes à relancer. Passez aux bulletins.';

/** The preparation, plus who to write to (user ids stay inside the API). */
interface Preparation {
  readonly dto: ReportPreparationDto;
  readonly userOfTeacher: ReadonlyMap<string, string>;
  /** Teachers with something to finish whose account is disabled or archived. */
  readonly unreachable: number;
}

/**
 * « Préparer les bulletins »: per class, which subjects are not ready yet and who teaches them, and « Relancer »,
 * which writes a reminder into those teachers' notifications. Read-only except the reminder, which is admin only.
 */
@Injectable()
export class ReportPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async preparation(periodId: string): Promise<ReportPreparationDto> {
    return (await this.build(await this.period(periodId), undefined)).dto;
  }

  /**
   * Reminds the teachers who still have something to finish (in one class, or every class of the period).
   * A teacher reminded less than GRADE_REMINDER_COOLDOWN_HOURS ago for this period is left alone, so a double
   * click or an impatient admin cannot flood anyone; the check and the write share one lock and one transaction
   * with the audit row.
   */
  async remind(
    periodId: string,
    dto: ReportReminderDto,
    actor: AuthUser,
  ): Promise<ReportReminderResultDto> {
    const period = await this.period(periodId);
    // Refuse before the aggregate queries: a closed term has nothing to remind.
    if (period.closedAt) throw new ConflictException(PERIOD_ALREADY_CLOSED);
    const prep = await this.build(period, dto.classId);

    const items = new Map<string, GradeReminderItem[]>();
    let withoutTeacher = 0;
    for (const c of prep.dto.classes) {
      for (const gap of c.gaps) {
        if (!gap.teachers.length) withoutTeacher += 1;
        for (const t of gap.teachers) {
          items.set(t.teacherId, [
            ...(items.get(t.teacherId) ?? []),
            {
              className: c.label,
              subject: gap.subjectName,
              reason: gap.reason,
              entered: gap.entered,
              total: gap.total,
            },
          ]);
        }
      }
    }

    const cutoff = new Date(Date.now() - GRADE_REMINDER_COOLDOWN_HOURS * 3_600_000);
    const periodLabel = prep.dto.period.label;
    const scopeIds = dto.classId ? [dto.classId, periodId] : [periodId, ...prep.dto.classes.map((c) => c.classId)];
    const { notified, alreadyReminded } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`grades-reminder:${periodId}`}, 0))`;
      // The term may have been closed since the first look: read it again, locked against its closing.
      const [locked] = await tx.$queryRaw<{ closed_at: Date | null }[]>`
        SELECT closed_at FROM periods WHERE id = ${periodId}::uuid FOR SHARE`;
      if (!locked) throw notFound('Période');
      if (locked.closed_at) throw new ConflictException(PERIOD_ALREADY_CLOSED);
      const users = [...items.keys()].flatMap((id) => prep.userOfTeacher.get(id) ?? []);
      const recent = new Set(
        (
          await tx.notification.findMany({
            where: {
              userId: { in: users },
              kind: 'grades_reminder',
              // A whole-period reminder covers every class, so it also waits for an earlier reminder about any
              // class of the period; a class reminder waits for that class's and for a whole-period one.
              entityId: { in: scopeIds },
              createdAt: { gte: cutoff },
            },
            select: { userId: true },
          })
        ).map((n) => n.userId),
      );
      const drafts: NotificationDraft[] = [];
      let skipped = 0;
      for (const [teacherId, list] of items) {
        const userId = prep.userOfTeacher.get(teacherId);
        if (!userId) continue;
        if (recent.has(userId)) {
          skipped += 1;
          continue;
        }
        const text = gradesReminderNotice({ periodLabel, items: list });
        drafts.push({
          kind: 'grades_reminder',
          recipients: [{ userId, role: 'teacher' }],
          text: () => text,
          topic: 'grades',
          occursOn: null,
          entity: dto.classId ? 'class' : 'period',
          entityId: dto.classId ?? periodId,
        });
      }
      const written = await this.notifications.write(tx, drafts, actor.id);
      await audit(tx, [
        {
          actorId: actor.id,
          action: 'report_preparation.remind',
          entity: 'period',
          entityId: periodId,
          after: {
            classId: dto.classId ?? null,
            teachers: items.size,
            notified: written,
            alreadyReminded: skipped,
            unreachable: prep.unreachable + Math.max(0, items.size - skipped - written),
            withoutTeacher,
          },
        },
      ]);
      return { notified: written, alreadyReminded: skipped };
    });
    // teachers = notified + alreadyReminded, for the teachers who can be reached; the others are `unreachable`.
    const unreachable = prep.unreachable + Math.max(0, items.size - notified - alreadyReminded);
    return { teachers: items.size, notified, alreadyReminded, unreachable, withoutTeacher };
  }

  /** The classes of the period's year (its section only, when it has one) with their gaps. */
  private async period(periodId: string): Promise<Period> {
    const period = await this.prisma.period.findUnique({ where: { id: periodId } });
    if (!period) throw notFound('Période');
    return period;
  }

  private async build(period: Period, classId: string | undefined): Promise<Preparation> {
    const periodId = period.id;
    const today = fromDay(schoolToday());
    const classes = await this.prisma.schoolClass.findMany({
      where: {
        schoolYearId: period.schoolYearId,
        ...(period.sectionId ? { sectionId: period.sectionId } : {}),
        ...(classId ? { id: classId } : {}),
      },
      include: { section: { select: { code: true } } },
      orderBy: [{ code: 'asc' }, { label: 'asc' }],
    });
    if (classId && !classes.length) throw notFound('Classe');
    const classIds = classes.map((c) => c.id);

    const [students, subjects, events, marks, cards] = await Promise.all([
      this.prisma.enrollment.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds }, leftOn: null },
        _count: { _all: true },
      }),
      this.prisma.classSubject.findMany({
        where: { classId: { in: classIds } },
        select: {
          classId: true,
          subjectId: true,
          subject: { select: { name: true } },
          assignments: {
            select: {
              teacher: {
                select: {
                  id: true,
                  userId: true,
                  user: { select: { firstName: true, lastName: true, status: true } },
                },
              },
            },
          },
        },
        orderBy: { subject: { name: 'asc' } },
      }),
      this.prisma.event.findMany({
        where: { periodId, classId: { in: classIds }, subjectId: { not: null }, activityType: { gradable: true } },
        select: { id: true, classId: true, subjectId: true, date: true, _count: { select: { targets: true } } },
      }),
      this.prisma.grade.groupBy({
        by: ['eventId', 'published'],
        // Marks of students no longer enrolled this year do not stand in for a missing one.
        where: {
          event: { periodId, classId: { in: classIds }, activityType: { gradable: true } },
          student: { enrollments: { some: { schoolYearId: period.schoolYearId, leftOn: null } } },
        },
        _count: { _all: true },
      }),
      this.prisma.reportCard.groupBy({
        by: ['classId', 'publishedAt'],
        where: { periodId, classId: { in: classIds } },
        _count: { _all: true },
      }),
    ]);

    const studentCount = new Map(students.map((s) => [s.classId, s._count._all]));
    const gradedOf = new Map<string, { graded: number; published: number }>();
    for (const m of marks) {
      const seen = gradedOf.get(m.eventId) ?? { graded: 0, published: 0 };
      gradedOf.set(m.eventId, {
        graded: seen.graded + m._count._all,
        published: seen.published + (m.published ? m._count._all : 0),
      });
    }

    const userOfTeacher = new Map<string, string>();
    const lateTeachers = new Set<string>();
    const unreachableTeachers = new Set<string>();
    let subjectCount = 0;
    let readySubjectCount = 0;
    const rows: ReportPreparationClassDto[] = classes.map((c) => {
      const count = studentCount.get(c.id) ?? 0;
      const own = subjects.filter((s) => s.classId === c.id);
      const gapEvents: GapEvent[] = events
        .filter((e) => e.classId === c.id && e.subjectId)
        // Work not held yet (a planned exam) has no marks to wait for; marks already entered always count.
        .filter((e) => e.date <= today || (gradedOf.get(e.id)?.graded ?? 0) > 0)
        .map((e) => ({
          subjectId: e.subjectId ?? '',
          // Marks of events aimed at some students are not compared with the class size.
          concerned: e._count.targets > 0 ? null : count,
          graded: gradedOf.get(e.id)?.graded ?? 0,
          published: gradedOf.get(e.id)?.published ?? 0,
        }));
      const gaps: ReportGapDto[] = classGaps(
        own.map((s) => s.subjectId),
        gapEvents,
      ).map((g) => {
        const subject = own.find((s) => s.subjectId === g.subjectId);
        // Only accounts that can receive a reminder are listed: a disabled or archived teacher is counted apart.
        const teachers = (subject?.assignments ?? []).flatMap((a) => {
          if (a.teacher.user.status !== 'active') {
            unreachableTeachers.add(a.teacher.id);
            return [];
          }
          userOfTeacher.set(a.teacher.id, a.teacher.userId);
          lateTeachers.add(a.teacher.id);
          return [{ teacherId: a.teacher.id, name: `${a.teacher.user.firstName} ${a.teacher.user.lastName}` }];
        });
        return { ...g, subjectName: subject?.subject.name ?? g.subjectId, teachers };
      });
      subjectCount += own.length;
      readySubjectCount += own.length - gaps.length;
      const mine = cards.filter((k) => k.classId === c.id);
      return {
        classId: c.id,
        label: c.label,
        sectionCode: c.section.code as SectionId,
        studentCount: count,
        subjectCount: own.length,
        complete: own.length > 0 && !gaps.length,
        gaps,
        cardsGenerated: mine.reduce((sum, k) => sum + k._count._all, 0),
        cardsPublished: mine.filter((k) => k.publishedAt).reduce((sum, k) => sum + k._count._all, 0),
      };
    });

    return {
      dto: {
        period: toPeriodDto(period),
        classes: rows,
        classCount: rows.length,
        completeClassCount: rows.filter((r) => r.complete).length,
        subjectCount,
        readySubjectCount,
        lateTeacherCount: lateTeachers.size,
      },
      userOfTeacher,
      unreachable: unreachableTeachers.size,
    };
  }
}
