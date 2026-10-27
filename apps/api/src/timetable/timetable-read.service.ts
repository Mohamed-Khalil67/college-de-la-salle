import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CLOSED_DAY_TYPES,
  daysBetween,
  type Paginated,
  type RoomKind,
  TIMETABLE_LIMITS,
  type TimetableOccurrence,
} from '@cdls/shared';
import { canEditStructure } from '../access/grants.js';
import { loadClosures } from '../calendar-days/closures.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, schoolToday } from '../common/dates.js';
import { forbidden, notFound } from '../common/errors.js';
import { pageArgs, paginated } from '../common/pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import {
  expandSlots,
  type SlotData,
  slotInclude,
  type SlotRow,
  toSlotData,
} from '../occupancy/slot-data.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  FreeRoomDto,
  FreeRoomsQueryDto,
  TimetableOccurrenceDto,
  TimetableOccurrenceQueryDto,
  TimetableSlotDto,
  TimetableSlotListQueryDto,
  TimetableWarningDto,
} from './dto/timetable.dto.js';
import { type Names, personName, toOccurrenceDto, toSlotDto } from './timetable.mapper.js';
import { WarningsService } from './warnings.service.js';

/** Reads of the timetable: slots, sessions of a class, a teacher or a room, warnings, free rooms. */
@Injectable()
export class TimetableReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
    private readonly warnings: WarningsService,
  ) {}

  /** The weekly slots (admin or coordinator), by class, teacher or room. */
  async listSlots(query: TimetableSlotListQueryDto): Promise<Paginated<TimetableSlotDto>> {
    const where: Prisma.TimetableSlotWhereInput = {
      ...(query.classId ? { classSubject: { classId: query.classId } } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where,
        include: slotInclude,
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { validFrom: 'asc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.timetableSlot.count({ where }),
    ]);
    return paginated(rows.map(toSlotDto), total, query);
  }

  /** One slot: admins and coordinators any, a teacher only theirs. */
  async getSlot(id: string, user: AuthUser): Promise<TimetableSlotDto> {
    const row = await this.prisma.timetableSlot.findUnique({ where: { id }, include: slotInclude });
    if (!row) throw notFound('Séance');
    if (!canEditStructure(user) && !(user.teacherId && row.teacherId === user.teacherId))
      throw forbidden();
    return toSlotDto(row);
  }

  /**
   * The sessions of a class, a teacher or a room between two days (holidays removed, exceptions applied).
   * Students read their own class only; teachers and staff read any.
   */
  async occurrences(
    query: TimetableOccurrenceQueryDto,
    user: AuthUser,
  ): Promise<TimetableOccurrenceDto[]> {
    const scope = await this.scope(query, user);
    let sessions = await this.sessions(this.prisma, scope, query.from, query.to);
    if (user.role === 'student') {
      // A student sees the whole-class sessions and those of the groups they are in, nothing else.
      const mine = new Set(
        (
          await this.prisma.groupMember.findMany({
            where: { studentId: user.studentId!, leftOn: null },
            select: { groupId: true },
          })
        ).map((m) => m.groupId),
      );
      sessions = sessions.filter((o) => !o.slot.groupId || mine.has(o.slot.groupId));
    }
    const names = await this.names(sessions);
    const today = schoolToday();
    const taught = new Set<string>(
      user.role === 'teacher' && user.teacherId
        ? (
            await this.prisma.teachingAssignment.findMany({
              where: { teacherId: user.teacherId },
              select: { classSubjectId: true },
            })
          ).map((a) => a.classSubjectId)
        : [],
    );
    return sessions.map((o) => toOccurrenceDto(o, names, this.canChange(o, user, today, taught)));
  }

  /** The soft warnings of the stored timetable in a range (admin or coordinator), for the « Conflits » panel. */
  async warningsFor(query: TimetableOccurrenceQueryDto): Promise<TimetableWarningDto[]> {
    const scope = await this.scope(query, null);
    const sessions = await this.sessions(this.prisma, scope, query.from, query.to);
    return this.warnings.forSessions(this.prisma, sessions, true);
  }

  /** Active rooms nobody holds in that time range, the ones that seat the class first. */
  async freeRooms(query: FreeRoomsQueryDto): Promise<FreeRoomDto[]> {
    if (query.endTime <= query.startTime)
      throw new BadRequestException('La fin doit suivre le début.');
    const ids = await this.occupancy.freeRoomIds(
      this.prisma,
      query.date,
      query.startTime,
      query.endTime,
      query.ignoreSlotId ?? null,
    );
    const rooms = ids.length
      ? await this.prisma.room.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } })
      : [];
    const size = query.classId
      ? await this.prisma.enrollment.count({ where: { classId: query.classId, leftOn: null } })
      : null;
    return rooms
      .map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        kind: r.kind as RoomKind,
        active: r.active,
        fitsClass: size === null || r.capacity === null || r.capacity >= size,
      }))
      .sort(
        (a, b) => Number(b.fitsClass) - Number(a.fitsClass) || a.name.localeCompare(b.name, 'fr'),
      );
  }

  /* Internals --------------------------------------------------------------------------------- */

  /** Exactly one of class, teacher, room; a student gets their own class when none is given. */
  private async scope(
    query: TimetableOccurrenceQueryDto,
    user: AuthUser | null,
  ): Promise<{ classId?: string; teacherId?: string; roomId?: string }> {
    if (query.to < query.from) throw new BadRequestException('« to » doit suivre « from ».');
    if (daysBetween(query.from, query.to) >= TIMETABLE_LIMITS.maxRangeDays)
      throw new BadRequestException(`Période limitée à ${TIMETABLE_LIMITS.maxRangeDays} jours.`);
    if (user?.role === 'student') {
      const own = user.classId;
      if (!own || query.teacherId || query.roomId || (query.classId && query.classId !== own))
        throw forbidden();
      return { classId: own };
    }
    const given = [query.classId, query.teacherId, query.roomId].filter(Boolean);
    if (given.length !== 1)
      throw new BadRequestException('Indiquez une classe, un enseignant ou une salle (un seul).');
    return { classId: query.classId, teacherId: query.teacherId, roomId: query.roomId };
  }

  private async sessions(
    db: Prisma.TransactionClient,
    scope: { classId?: string; teacherId?: string; roomId?: string },
    from: string,
    to: string,
  ): Promise<TimetableOccurrence<SlotData>[]> {
    const window: Prisma.TimetableSlotWhereInput = {
      OR: [
        { validFrom: { lte: fromDay(to) }, validTo: { gte: fromDay(from) } },
        // A session of another week moved into the window.
        { exceptions: { some: { newDate: { gte: fromDay(from), lte: fromDay(to) } } } },
      ],
    };
    const owner: Prisma.TimetableSlotWhereInput = scope.classId
      ? { classSubject: { classId: scope.classId } }
      : scope.teacherId
        ? {
            OR: [
              { teacherId: scope.teacherId },
              { exceptions: { some: { newTeacherId: scope.teacherId } } },
            ],
          }
        : { OR: [{ roomId: scope.roomId }, { exceptions: { some: { newRoomId: scope.roomId } } }] };
    const rows = await db.timetableSlot.findMany({
      where: { AND: [window, owner] },
      include: slotInclude,
    });
    const closures = await loadClosures(db, CLOSED_DAY_TYPES, from, to);
    const all = expandSlots(rows.map(toSlotData), from, to, closures);
    return all.filter((o) => {
      if (scope.teacherId)
        return o.current.teacherId === scope.teacherId || o.original.teacherId === scope.teacherId;
      if (scope.roomId)
        return o.current.roomId === scope.roomId || o.original.roomId === scope.roomId;
      return true;
    });
  }

  private async names(sessions: readonly TimetableOccurrence<SlotData>[]): Promise<Names> {
    const roomIds = new Set<string>();
    const teacherIds = new Set<string>();
    for (const o of sessions) {
      for (const v of [o.current, o.original, ...(o.movedTo ? [o.movedTo] : [])]) {
        if (v.roomId) roomIds.add(v.roomId);
        teacherIds.add(v.teacherId);
      }
    }
    const [rooms, teachers] = await Promise.all([
      roomIds.size ? this.prisma.room.findMany({ where: { id: { in: [...roomIds] } } }) : [],
      teacherIds.size
        ? this.prisma.teacher.findMany({
            where: { id: { in: [...teacherIds] } },
            include: { user: true },
          })
        : [],
    ]);
    return {
      rooms: new Map(rooms.map((r) => [r.id, r.name])),
      teachers: new Map(teachers.map((t) => [t.id, personName(t.user)])),
    };
  }

  /** May this user cancel, move, change the room of or restore the session? Admins and coordinators; a teacher their own. */
  private canChange(
    o: TimetableOccurrence<SlotData>,
    user: AuthUser,
    today: string,
    taught: ReadonlySet<string>,
  ): boolean {
    if (o.status === 'moved_from') return false;
    if (o.original.date < today) return false;
    if (canEditStructure(user)) return true;
    const row: SlotRow = o.slot.row;
    return (
      user.role === 'teacher' &&
      !!user.teacherId &&
      row.teacherId === user.teacherId &&
      taught.has(row.classSubjectId)
    );
  }
}
