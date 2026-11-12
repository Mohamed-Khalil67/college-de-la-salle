import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ABSENCE_MAX_DAYS,
  classCoverage,
  type PlannerClassCoverageDto,
  daysBetween,
  freeUntil,
  type RoomKind,
  schoolTimeNow,
  schoolToday,
  type SlotExceptionKind,
  type SubjectHours,
  weeklyHours,
} from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TimetableReadService } from '../timetable/timetable-read.service.js';
import { personName } from '../timetable/timetable.mapper.js';
import type {
  AbsencePreviewDto,
  AbsencePreviewQueryDto,
  AbsenceSessionDto,
  PlannerRoomsNowDto,
  PlannerTimetablesDto,
  PlannerTodayDto,
} from './dto/planner.dto.js';

interface BusyRow {
  teacher_id: string;
  day: string;
  start: string;
  end: string;
}

const STATUS_KIND: Readonly<Record<string, SlotExceptionKind | null>> = {
  normal: null,
  cancelled: 'cancelled',
  moved: 'moved',
  substitute: 'substitute',
  room_change: 'room_change',
  study: 'study',
};

const clamp = (day: string, lo: string, hi: string) => (day < lo ? lo : day > hi ? hi : day);

/**
 * The planner's reads: the lessons of an absent teacher with who is free to cover them, the changes of a day,
 * the rooms free now, and how complete the timetable is. The write (« Professeur absent ») is
 * `TimetableService.applyAbsence`, where the transaction, the index and the notifications already live.
 */
@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reads: TimetableReadService,
    private readonly occupancy: OccupancyService,
  ) {}

  /** The lessons a teacher gives between two days (from today on), each with the teachers free at that time. */
  async absence(query: AbsencePreviewQueryDto, user: AuthUser): Promise<AbsencePreviewDto> {
    if (query.to < query.from) throw new BadRequestException('La fin doit suivre le début.');
    if (daysBetween(query.from, query.to) >= ABSENCE_MAX_DAYS)
      throw new BadRequestException(`Une absence couvre ${ABSENCE_MAX_DAYS} jours au plus.`);
    if (query.from < schoolToday())
      throw new BadRequestException('Les séances passées ne se modifient plus.');
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: query.teacherId },
      include: { user: true },
    });
    if (!teacher) throw notFound('Enseignant');

    const sessions = (
      await this.reads.occurrences(
        { teacherId: query.teacherId, from: query.from, to: query.to },
        user,
      )
    )
      .filter(
        (o) =>
          o.status !== 'moved_from' &&
          o.originalDate >= query.from &&
          o.originalDate <= query.to &&
          (o.original.teacherId === query.teacherId || o.current.teacherId === query.teacherId),
      )
      .sort(
        (a, b) =>
          a.current.date.localeCompare(b.current.date) ||
          a.current.startTime.localeCompare(b.current.startTime),
      );

    const busy = sessions.length
      ? await this.prisma.$queryRaw<BusyRow[]>`
          SELECT teacher_id,
                 to_char(lower(during), 'YYYY-MM-DD') AS day,
                 to_char(lower(during), 'HH24:MI') AS start,
                 to_char(upper(during), 'HH24:MI') AS "end"
          FROM occupancy
          WHERE teacher_id IS NOT NULL
            AND during && tsrange(${`${query.from} 00:00`}::timestamp, ${`${query.to} 23:59`}::timestamp)`
      : [];
    const busyBy = new Map<string, BusyRow[]>();
    for (const row of busy) busyBy.set(row.day, [...(busyBy.get(row.day) ?? []), row]);

    const teachers = await this.prisma.teacher.findMany({
      where: { id: { not: query.teacherId }, user: { status: 'active' } },
      include: {
        user: true,
        assignments: { select: { classSubject: { select: { subjectId: true } } } },
      },
    });
    const people = teachers
      .map((t) => ({
        id: t.id,
        name: personName(t.user),
        subjects: new Set(t.assignments.map((a) => a.classSubject.subjectId)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    return {
      teacherId: teacher.id,
      teacherName: personName(teacher.user),
      from: query.from,
      to: query.to,
      sessions: sessions.map((o): AbsenceSessionDto => {
        const taken = new Set(
          (busyBy.get(o.current.date) ?? [])
            .filter((b) => b.start < o.current.endTime && o.current.startTime < b.end)
            .map((b) => b.teacher_id),
        );
        const free = people
          .filter((p) => !taken.has(p.id))
          .map((p) => ({
            teacherId: p.id,
            name: p.name,
            sameSubject: p.subjects.has(o.subjectId),
          }))
          .sort((a, b) => Number(b.sameSubject) - Number(a.sameSubject));
        return {
          slotId: o.slotId,
          date: o.originalDate,
          classLabel: o.classLabel,
          groupLabel: o.groupLabel,
          subjectName: o.subjectName,
          startTime: o.current.startTime,
          endTime: o.current.endTime,
          roomId: o.current.roomId,
          roomName: o.current.roomName,
          currentKind: STATUS_KIND[o.status] ?? null,
          freeTeachers: free,
        };
      }),
    };
  }

  /** The sessions of a day that differ from the weekly rule, and whether the students were told. */
  async today(date: string | undefined): Promise<PlannerTodayDto> {
    const day = date ?? schoolToday();
    const rows = await this.prisma.slotException.findMany({
      where: { OR: [{ date: fromDay(day) }, { newDate: fromDay(day) }] },
      include: {
        newRoom: { select: { name: true } },
        newTeacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        slot: {
          select: {
            startTime: true,
            endTime: true,
            group: { select: { label: true } },
            room: { select: { name: true } },
            teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
            classSubject: {
              select: {
                schoolClass: { select: { label: true } },
                subject: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const told = new Set(
      (
        await this.prisma.notification.findMany({
          where: {
            entity: 'timetable_slot',
            entityId: { in: rows.map((r) => `${r.slotId}@${toDay(r.date)}`) },
            user: { role: 'student' },
          },
          select: { entityId: true },
          distinct: ['entityId'],
        })
      ).map((n) => n.entityId),
    );
    return {
      date: day,
      changes: rows
        .map((r) => ({
          slotId: r.slotId,
          date: toDay(r.date),
          kind: r.kind,
          classLabel: r.slot.group
            ? `${r.slot.classSubject.schoolClass.label}, ${r.slot.group.label}`
            : r.slot.classSubject.schoolClass.label,
          subjectName: r.slot.classSubject.subject.name,
          startTime: r.newStart ?? r.slot.startTime,
          endTime: r.newEnd ?? r.slot.endTime,
          teacherName: personName(r.slot.teacher.user),
          coverName: r.newTeacher ? personName(r.newTeacher.user) : null,
          roomName: r.newRoom?.name ?? r.slot.room?.name ?? null,
          reason: r.reason,
          notified: told.has(`${r.slotId}@${toDay(r.date)}`),
        }))
        .sort(
          (a, b) =>
            a.startTime.localeCompare(b.startTime) ||
            a.classLabel.localeCompare(b.classLabel, 'fr'),
        ),
    };
  }

  /** The active rooms nobody holds at this minute, and until when they stay free today. */
  async roomsNow(): Promise<PlannerRoomsNowDto> {
    const date = schoolToday();
    const time = schoolTimeNow();
    const total = await this.prisma.room.count({ where: { active: true } });
    const ids = await this.occupancy.freeRoomIds(
      this.prisma,
      date,
      time,
      time === '23:59' ? '23:59' : minuteAfter(time),
      null,
    );
    const rooms = ids.length
      ? await this.prisma.room.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } })
      : [];
    const starts = ids.length
      ? await this.prisma.$queryRaw<{ room_id: string; start: string }[]>`
          SELECT room_id, to_char(lower(during), 'HH24:MI') AS start
          FROM occupancy
          WHERE room_id = ANY(${ids}::uuid[])
            AND lower(during) > ${`${date} ${time}`}::timestamp
            AND lower(during) < ${`${date} 23:59`}::timestamp`
      : [];
    const startsBy = new Map<string, string[]>();
    for (const s of starts) startsBy.set(s.room_id, [...(startsBy.get(s.room_id) ?? []), s.start]);
    return {
      date,
      time,
      total,
      free: rooms
        .map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind as RoomKind,
          capacity: r.capacity,
          freeUntil: freeUntil(startsBy.get(r.id) ?? [], time),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })),
    };
  }

  /** How complete the current year's timetable is: hours placed against hours asked, class by class. */
  async timetables(): Promise<PlannerTimetablesDto> {
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!year) return { yearLabel: null, classes: [], teachersPlaced: 0, teachersTotal: 0 };
    const ref = fromDay(clamp(schoolToday(), toDay(year.startsOn), toDay(year.endsOn)));
    const rows = await this.prisma.schoolClass.findMany({
      where: { schoolYearId: year.id },
      orderBy: [{ label: 'asc' }],
      select: {
        id: true,
        label: true,
        subjects: {
          select: {
            hoursPerWeek: true,
            subject: { select: { name: true } },
            assignments: { select: { teacherId: true } },
            slots: {
              where: { validFrom: { lte: ref }, validTo: { gte: ref } },
              select: {
                startTime: true,
                endTime: true,
                weekParity: true,
                groupId: true,
                teacherId: true,
              },
            },
          },
        },
      },
    });
    const assigned = new Set<string>();
    const placed = new Set<string>();
    const classes: PlannerClassCoverageDto[] = rows.map((c) => {
      const subjects: SubjectHours[] = c.subjects.map((s) => {
        for (const a of s.assignments) assigned.add(a.teacherId);
        for (const slot of s.slots) placed.add(slot.teacherId);
        // Whole-class slots count in full; parallel groups give their hours at the same time, so the busiest group counts.
        let whole = 0;
        const perGroup = new Map<string, number>();
        for (const slot of s.slots) {
          const hours = weeklyHours(slot);
          if (slot.groupId) perGroup.set(slot.groupId, (perGroup.get(slot.groupId) ?? 0) + hours);
          else whole += hours;
        }
        return {
          subjectName: s.subject.name,
          expected: s.hoursPerWeek === null ? null : Number(s.hoursPerWeek),
          placed: whole + Math.max(0, ...perGroup.values()),
        };
      });
      return classCoverage(c.id, c.label, subjects);
    });
    return {
      yearLabel: year.label,
      classes,
      teachersTotal: assigned.size,
      teachersPlaced: [...assigned].filter((id) => placed.has(id)).length,
    };
  }
}

/** `HH:MM` one minute later (the caller keeps 23:59 out). */
function minuteAfter(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + 1;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
