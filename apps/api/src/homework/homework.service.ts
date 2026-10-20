import { BadRequestException, Injectable } from '@nestjs/common';
import { addDays, todayIso } from '@cdls/shared';
import { AccessService } from '../access/access.service.js';
import { toStudentSummary } from '../classes/classes.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
import { EventsService } from '../events/events.service.js';
import { eventInclude, toEventDto } from '../events/event.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { HomeworkCompletionDto, HomeworkDto } from './dto/homework.dto.js';

/** « Devoirs à rendre »: students tick them off; teachers see who did. */
@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventsService,
  ) {}

  /** A student's homework due from `from` (default: a week ago), soonest first, with their done flag. */
  async mine(user: AuthUser, from?: string): Promise<HomeworkDto[]> {
    if (!user.studentId) throw forbidden();
    const audience = this.access.audienceFor(await this.access.placement(user.studentId));
    const rows = await this.prisma.event.findMany({
      where: {
        kind: 'devoir',
        date: { gte: fromDay(from ?? addDays(todayIso(), -7)) },
        ...audience,
      },
      include: { ...eventInclude, homeworkCompletions: { where: { studentId: user.studentId } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 200,
    });
    return rows.map((row) => {
      const done = row.homeworkCompletions[0];
      return {
        event: toEventDto(row),
        done: !!done,
        doneAt: done ? done.doneAt.toISOString() : null,
      };
    });
  }

  async setDone(eventId: string, done: boolean, user: AuthUser): Promise<HomeworkDto> {
    if (!user.studentId) throw forbidden();
    const event = await this.events.visible(eventId, user);
    if (event.kind !== 'devoir') throw new BadRequestException('Seuls les devoirs se cochent.');
    const key = { eventId_studentId: { eventId, studentId: user.studentId } };
    if (done) {
      const row = await this.prisma.homeworkCompletion.upsert({
        where: key,
        create: { eventId, studentId: user.studentId },
        update: {},
      });
      return { event: toEventDto(event), done: true, doneAt: row.doneAt.toISOString() };
    }
    await this.prisma.homeworkCompletion.deleteMany({
      where: { eventId, studentId: user.studentId },
    });
    return { event: toEventDto(event), done: false, doneAt: null };
  }

  /** Who ticked this homework: the class's teachers and admins. */
  async completions(eventId: string, user: AuthUser): Promise<HomeworkCompletionDto[]> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw notFound('Événement');
    if (event.classId) await this.access.assertTeachesClass(user, event.classId);
    else if (user.role !== 'admin' && event.authorId !== user.teacherId) throw forbidden();
    const rows = await this.prisma.homeworkCompletion.findMany({
      where: { eventId },
      include: { student: { include: { user: true } } },
      orderBy: { doneAt: 'asc' },
    });
    return rows.map((r) => ({
      student: toStudentSummary(r.student),
      doneAt: r.doneAt.toISOString(),
    }));
  }
}
