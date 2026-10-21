import { BadRequestException, Injectable } from '@nestjs/common';
import { occurrences } from '@cdls/shared';
import type { Attendance } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { toActivityTypeSummary } from '../activity-types/activity-types.service.js';
import { ClassesService } from '../classes/classes.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import {
  eventInclude,
  type EventRow,
  toCalendarEvent,
  toEventDto,
} from '../events/event.mapper.js';
import { CalendarDaysService } from '../calendar-days/calendar-days.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertClassWritable } from '../school-years/year-guard.js';
import type {
  AttendanceRecordDto,
  AttendanceSheetDto,
  SaveAttendanceDto,
  StudentAttendanceDto,
  StudentAttendanceQueryDto,
} from './dto/attendance.dto.js';

/** Roll call per occurrence of a class event, by the class's teachers. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly classes: ClassesService,
    private readonly calendarDays: CalendarDaysService,
  ) {}

  async sheet(eventId: string, date: string, user: AuthUser): Promise<AttendanceSheetDto> {
    const event = await this.classEvent(eventId, date, user);
    const [roster, records] = await Promise.all([
      this.classes.roster(event.classId!),
      this.prisma.attendance.findMany({ where: { eventId, date: fromDay(date) } }),
    ]);
    const byStudent = new Map(records.map((r) => [r.studentId, toRecordDto(r)]));
    return {
      event: toEventDto(event),
      date,
      rows: roster.map((student) => ({ student, record: byStudent.get(student.id) ?? null })),
    };
  }

  /** Saves the roll call of one day (upsert per student). */
  async save(eventId: string, dto: SaveAttendanceDto, user: AuthUser): Promise<AttendanceSheetDto> {
    const event = await this.classEvent(eventId, dto.date, user);
    await assertClassWritable(this.prisma, event.classId);
    const roster = new Set((await this.classes.roster(event.classId!)).map((s) => s.id));
    for (const r of dto.records) {
      if (!roster.has(r.studentId))
        throw new BadRequestException(`L'élève ${r.studentId} n'est pas dans cette classe.`);
      if (r.status !== 'late' && r.minutesLate)
        throw new BadRequestException('Les minutes de retard concernent un retard.');
    }
    const recordedById = user.teacherId ?? event.authorId;
    const date = fromDay(dto.date);
    await this.prisma.$transaction(async (tx) => {
      // Shared lock on the school year: archiving it waits for this roll call, and a later one is refused.
      await assertClassWritable(tx, event.classId);
      for (const r of dto.records)
        await tx.attendance.upsert({
          where: { eventId_studentId_date: { eventId, studentId: r.studentId, date } },
          create: {
            eventId,
            studentId: r.studentId,
            date,
            status: r.status,
            minutesLate: r.status === 'late' ? (r.minutesLate ?? null) : null,
            note: r.note ?? '',
            recordedById,
          },
          update: {
            status: r.status,
            minutesLate: r.status === 'late' ? (r.minutesLate ?? null) : null,
            note: r.note ?? '',
            recordedById,
          },
        });
    });
    return this.sheet(eventId, dto.date, user);
  }

  /** A student's absences and late arrivals (not the « present » rows). */
  async forStudent(
    studentId: string,
    query: StudentAttendanceQueryDto,
    user: AuthUser,
  ): Promise<StudentAttendanceDto[]> {
    await this.access.assertCanReadStudent(user, studentId);
    const rows = await this.prisma.attendance.findMany({
      where: {
        studentId,
        status: { not: 'present' },
        date: {
          ...(query.from ? { gte: fromDay(query.from) } : {}),
          ...(query.to ? { lte: fromDay(query.to) } : {}),
        },
      },
      include: { event: { include: { activityType: true } } },
      orderBy: [{ date: 'desc' }],
      take: 500,
    });
    return rows.map((r) => ({
      record: toRecordDto(r),
      event: {
        id: r.event.id,
        type: toActivityTypeSummary(r.event.activityType),
        title: r.event.title,
        subjectId: r.event.subjectId,
        startTime: r.event.startTime,
        endTime: r.event.endTime,
      },
    }));
  }

  /** A class event, held on `date`, that the user teaches (or admin). */
  private async classEvent(eventId: string, date: string, user: AuthUser): Promise<EventRow> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });
    if (!event) throw notFound('Événement');
    if (!event.classId)
      throw new BadRequestException("L'appel se fait sur un événement de classe.");
    await this.access.assertTeachesClass(user, event.classId);
    const closures = await this.calendarDays.closures(date, date);
    if (!occurrences([toCalendarEvent(event)], date, date, closures).length) {
      throw new BadRequestException(`Cet événement n'a pas lieu le ${date}.`);
    }
    return event;
  }
}

function toRecordDto(r: Attendance): AttendanceRecordDto {
  return {
    id: r.id,
    eventId: r.eventId,
    studentId: r.studentId,
    date: toDay(r.date),
    status: r.status,
    minutesLate: r.minutesLate,
    note: r.note,
  };
}
