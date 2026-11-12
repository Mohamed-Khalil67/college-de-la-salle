import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { schoolToday } from '@cdls/shared';
import type { ActivityType, Period, Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { ActivityTypesService } from '../activity-types/activity-types.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay } from '../common/dates.js';
import { forbidden } from '../common/errors.js';
import { eventInclude, toEventDto } from '../events/event.mapper.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertClassWritable } from '../school-years/year-guard.js';
import { TargetsService } from '../targets/targets.service.js';
import type {
  CreateQuickAssessmentDto,
  GradeSheetDto,
  PendingGradingDto,
  PendingGradingQueryDto,
} from './dto/grade.dto.js';
import { GradesService } from './grades.service.js';

export const NO_OPEN_PERIOD =
  'Aucune période ne couvre aujourd’hui pour cette classe : demandez à l’administration de créer la période en cours.';
export const PERIOD_CLOSED =
  'La période en cours est clôturée : vous ne pouvez plus y ajouter de note.';
export const NOT_GRADABLE_TYPE = 'Choisissez un type d’évaluation noté (pas un devoir à rendre).';
const NO_ASSESSMENT_TYPE =
  'Aucun type d’évaluation noté n’est disponible : demandez à l’administration d’en créer un.';
/** The picker shows the latest ones; older drafts stay reachable from « Saisie des notes ». */
const PENDING_LIMIT = 100;

/**
 * « Noter »: grade a class straight away. The grades still hang on a gradable event; this service creates
 * it behind the scenes (today's school date, no time, the whole class, the current open period) and lists
 * the work still to grade. Entering and publishing the marks stay with GradesService.
 */
@Injectable()
export class QuickGradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly types: ActivityTypesService,
    private readonly periods: PeriodsService,
    private readonly targets: TargetsService,
    private readonly grades: GradesService,
  ) {}

  /** Creates the event in one transaction and answers its (empty) grade sheet. No notification: publishing tells the students. */
  async create(dto: CreateQuickAssessmentDto, user: AuthUser): Promise<GradeSheetDto> {
    const teacherId = user.teacherId;
    if (user.role !== 'teacher' || !teacherId) throw forbidden();
    // Teaching this subject in this class implies the class subject exists (assignments hang on it).
    await this.access.assertTeachesClass(user, dto.classId, dto.subjectId);
    const typeId = dto.activityTypeId ?? (await this.defaultTypeId(teacherId));
    const today = schoolToday();
    const coefficient = dto.coefficient ?? 1;

    const eventId = await this.prisma.$transaction(async (tx) => {
      // Shared lock first, then read the flags: they cannot change until this event commits.
      await this.types.lockForEvent(tx, typeId);
      assertAssessmentType(await this.types.usable(typeId, user));
      await assertClassWritable(tx, dto.classId);
      const period = await this.currentPeriod(tx, dto.classId, today);
      await this.periods.lockOpen(tx, period.id);
      const event = await tx.event.create({
        data: {
          activityTypeId: typeId,
          title: dto.title,
          subjectId: dto.subjectId,
          classId: dto.classId,
          date: fromDay(today),
          periodId: period.id,
          coefficient,
          authorId: teacherId,
        },
      });
      // No target row: the whole class. No time: nothing to hold in the occupancy index.
      await audit(tx, [
        {
          actorId: user.id,
          action: 'event.create',
          entity: 'event',
          entityId: event.id,
          after: {
            via: 'quick_grading',
            activityTypeId: typeId,
            title: dto.title,
            classId: dto.classId,
            subjectId: dto.subjectId,
            date: today,
            periodId: period.id,
            coefficient,
          },
        },
      ]);
      return event.id;
    });
    return this.grades.sheet(eventId, user);
  }

  /**
   * The work still to grade for a class and subject (any teacher of it may grade, so a colleague's draft
   * shows too): gradable events of an open period whose grades are not published yet, or not all entered.
   * Newest first.
   */
  async pending(query: PendingGradingQueryDto, user: AuthUser): Promise<PendingGradingDto[]> {
    await this.access.assertTeachesClass(user, query.classId, query.subjectId);
    const rows = await this.prisma.event.findMany({
      where: {
        classId: query.classId,
        subjectId: query.subjectId,
        activityType: { gradable: true },
        // An event without a period (an old graded one) still counts; one of a closed period is locked.
        OR: [{ periodId: null }, { period: { closedAt: null } }],
      },
      include: eventInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: PENDING_LIMIT,
    });
    if (!rows.length) return [];
    const [events, grades] = await Promise.all([
      this.targets.annotate(rows.map(toEventDto), user),
      this.prisma.grade.findMany({
        where: { eventId: { in: rows.map((r) => r.id) } },
        select: { eventId: true, published: true, outOf: true },
      }),
    ]);
    const byEvent = new Map<string, { count: number; published: boolean; outOf: number }>();
    for (const g of grades) {
      const seen = byEvent.get(g.eventId);
      byEvent.set(g.eventId, {
        count: (seen?.count ?? 0) + 1,
        published: (seen?.published ?? false) || g.published,
        outOf: seen?.outOf ?? Number(g.outOf),
      });
    }
    return events
      .map((event) => {
        const graded = byEvent.get(event.id);
        const total = event.target.concerned ?? 0;
        return {
          event,
          // A grade kept for a student who left the group does not count twice.
          entered: Math.min(graded?.count ?? 0, total),
          total,
          published: graded?.published ?? false,
          outOf: graded?.outOf ?? null,
        };
      })
      .filter((p) => !p.published || p.entered < p.total);
  }

  /** The first assessment type (gradable, neither homework nor weekly) the teacher may use, in the school's order. */
  private async defaultTypeId(teacherId: string): Promise<string> {
    const type = await this.prisma.activityType.findFirst({
      where: {
        gradable: true,
        homework: false,
        repeatable: false,
        archivedAt: null,
        OR: [{ ownerTeacherId: null }, { ownerTeacherId: teacherId }],
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true },
    });
    if (!type) throw new ConflictException(NO_ASSESSMENT_TYPE);
    return type.id;
  }

  /** The period that covers today for this class, open; a clear 409 otherwise. */
  private async currentPeriod(
    tx: Prisma.TransactionClient,
    classId: string,
    today: string,
  ): Promise<Period> {
    try {
      return await this.periods.resolveFor(tx, classId, today, null);
    } catch (error) {
      if (error instanceof ConflictException) throw new ConflictException(PERIOD_CLOSED);
      if (error instanceof BadRequestException) throw new ConflictException(NO_OPEN_PERIOD);
      throw error;
    }
  }
}

/** Only gradable types that are not homework: a quick grade is not work to hand in. */
function assertAssessmentType(type: ActivityType): void {
  if (!type.gradable || type.homework) throw new BadRequestException(NOT_GRADABLE_TYPE);
}
