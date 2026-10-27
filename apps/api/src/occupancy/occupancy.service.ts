import { Injectable } from '@nestjs/common';
import {
  CLOSED_DAY_TYPES,
  entriesClash,
  occupancyEntries,
  type OccupancyEntry,
  type RoomCandidate,
  type RoomKind,
  stamp,
  type TimetableConflictDto,
  type TimetableConflictKind,
} from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { loadClosures } from '../calendar-days/closures.js';
import { toDay } from '../common/dates.js';
import { isExclusionViolation } from '../common/errors.js';
import { conflictBlocked } from './blocked.js';
import { conflictMessage } from './conflict-messages.js';
import type { GroupHold } from './event-hold.js';
import { expandSlots, slotInclude, toSlotData } from './slot-data.js';

type Db = Prisma.TransactionClient;

/** One row of the index, with the slot or event it belongs to. */
export interface IndexRow extends OccupancyEntry {
  readonly slotId: string | null;
  readonly eventId: string | null;
}

/** A one-off event, as far as the index cares. */
export interface EventBooking {
  readonly id: string;
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly repeatUntil: string | null;
  readonly roomId: string | null;
  readonly classId: string | null;
  /** Homework deadlines and other types that are not a session in a room. */
  readonly homework: boolean;
  /** Set when the event is for groups of one division: it then holds that division, not the whole class. */
  readonly hold?: GroupHold | null;
}

const CONSTRAINTS = [
  'occupancy_room_no_overlap',
  'occupancy_teacher_no_overlap',
  'occupancy_class_whole_no_overlap',
  'occupancy_class_division_no_overlap',
  'occupancy_group_no_overlap',
] as const;

interface Clash {
  readonly i: number;
  readonly kind: TimetableConflictKind;
  readonly slotId: string | null;
  readonly exceptionId: string | null;
  readonly eventId: string | null;
}

/**
 * The occupancy index: who holds which room, teacher and class, and when. The rule (slot plus exceptions,
 * or the event) stays the source of truth; these rows are rewritten in the same transaction as the change,
 * and the exclusion constraints of the table make a double booking impossible even for two parallel
 * requests. Everything here takes the caller's transaction.
 */
@Injectable()
export class OccupancyService {
  /** Rows the slots hold, computed from the stored rule and exceptions (holidays removed). */
  async entriesForSlots(db: Db, slotIds: readonly string[]): Promise<IndexRow[]> {
    if (!slotIds.length) return [];
    const rows = await db.timetableSlot.findMany({
      where: { id: { in: [...slotIds] } },
      include: slotInclude,
    });
    const ranges = rows.map((row) => {
      const days = [
        toDay(row.validFrom),
        toDay(row.validTo),
        ...row.exceptions.flatMap((e) => (e.newDate ? [toDay(e.newDate)] : [])),
      ].sort();
      return { row, from: days[0]!, to: days.at(-1)! };
    });
    if (!ranges.length) return [];
    const closures = await loadClosures(
      db,
      CLOSED_DAY_TYPES,
      ranges.map((r) => r.from).sort()[0]!,
      ranges
        .map((r) => r.to)
        .sort()
        .at(-1)!,
    );
    return ranges.flatMap(({ row, from, to }) => {
      const slot = toSlotData(row);
      return occupancyEntries(
        expandSlots([slot], from, to, closures),
        slot.classId,
        slot.division,
        slot.groupId,
      ).map((e) => ({ ...e, slotId: slot.id, eventId: null }));
    });
  }

  /** Removes the rows of these slots (their exceptions' rows included). */
  async clearSlots(db: Db, slotIds: readonly string[]): Promise<void> {
    if (slotIds.length) await db.occupancy.deleteMany({ where: { slotId: { in: [...slotIds] } } });
  }

  async insert(db: Db, rows: readonly IndexRow[]): Promise<void> {
    if (!rows.length) return;
    const json = JSON.stringify(
      rows.map((r) => ({
        source: r.source,
        slot_id: r.slotId,
        exception_id: r.exceptionId,
        event_id: r.eventId,
        day: r.day,
        room_id: r.roomId,
        teacher_id: r.teacherId,
        class_id: r.classId,
        division_key: r.divisionKey,
        group_id: r.groupId ?? null,
        starts_at: r.startsAt,
        ends_at: r.endsAt,
      })),
    );
    await db.$executeRaw`
      INSERT INTO occupancy (id, source, slot_id, exception_id, event_id, day, room_id, teacher_id, class_id, division_key, group_id, during)
      SELECT gen_random_uuid(), r.source::occupancy_source, r.slot_id, r.exception_id, r.event_id, r.day,
             r.room_id, r.teacher_id, r.class_id, r.division_key, r.group_id, tsrange(r.starts_at, r.ends_at)
      FROM jsonb_to_recordset(${json}::jsonb) AS r(
        source text, slot_id uuid, exception_id uuid, event_id uuid, day date, room_id uuid, teacher_id uuid,
        class_id uuid, division_key text, group_id uuid, starts_at timestamp, ends_at timestamp)`;
  }

  /**
   * The hard conflicts the rows would cause against what the index already holds (rows of the changed slot
   * or event must have been cleared first) and among themselves. One entry per clashing item.
   */
  async detect(db: Db, rows: readonly IndexRow[]): Promise<TimetableConflictDto[]> {
    if (!rows.length) return [];
    return (await this.describeBy(db, rows, await this.clashes(db, rows), () => '')).get('') ?? [];
  }

  /**
   * For a batch of new slots checked at once: every conflict of each slot that clashes with the index (the
   * holder is another slot, an exception or an event) or with another slot of the batch (`withSlotId` names
   * it; the earlier-starting of two clashing slots carries it). The messages are built with one set of lookups.
   */
  async detectBySlot(
    db: Db,
    rows: readonly IndexRow[],
  ): Promise<Map<string, TimetableConflictDto[]>> {
    if (!rows.length) return new Map();
    const clashes = await this.clashes(db, rows);
    return this.describeBy(db, rows, clashes, (c) => rows[c.i]!.slotId ?? '');
  }

  private async clashes(db: Db, rows: readonly IndexRow[]): Promise<Clash[]> {
    const json = JSON.stringify(
      rows.map((r, i) => ({
        i,
        room_id: r.roomId,
        teacher_id: r.teacherId,
        class_id: r.classId,
        division_key: r.divisionKey,
        group_id: r.groupId ?? null,
        starts_at: r.startsAt,
        ends_at: r.endsAt,
      })),
    );
    const found = await db.$queryRaw<
      {
        i: number;
        kind: TimetableConflictKind;
        slot_id: string | null;
        exception_id: string | null;
        event_id: string | null;
      }[]
    >`
      WITH c AS (
        SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS c(
          i int, room_id uuid, teacher_id uuid, class_id uuid, division_key text, group_id uuid, starts_at timestamp, ends_at timestamp)
      )
      SELECT c.i, 'room'::text AS kind, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.room_id = c.room_id AND o.during && tsrange(c.starts_at, c.ends_at)
      UNION ALL
      SELECT c.i, 'teacher'::text, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.teacher_id = c.teacher_id AND o.during && tsrange(c.starts_at, c.ends_at)
      UNION ALL
      SELECT c.i, 'class'::text, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.class_id = c.class_id AND o.during && tsrange(c.starts_at, c.ends_at)
         AND (c.division_key IS NULL OR o.division_key IS DISTINCT FROM c.division_key)
      UNION ALL
      SELECT c.i, 'class'::text, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.group_id = c.group_id AND o.during && tsrange(c.starts_at, c.ends_at)
       WHERE c.group_id IS NOT NULL`;
    const clashes: Clash[] = found.map((f) => ({
      i: f.i,
      kind: f.kind,
      slotId: f.slot_id,
      exceptionId: f.exception_id,
      eventId: f.event_id,
    }));
    // Rows of the same change that clash with each other (a session moved onto another one of its series).
    // Sweep by start time: a row can only clash with the rows that start before it ends.
    const order = rows
      .map((_, i) => i)
      .sort((x, y) => rows[x]!.startsAt.localeCompare(rows[y]!.startsAt));
    order.forEach((i, at) => {
      const a = rows[i]!;
      for (let k = at + 1; k < order.length && rows[order[k]!]!.startsAt < a.endsAt; k++) {
        const other = rows[order[k]!]!;
        // Another slot of the same batch (a rollover checks all its new slots at once) is named; the rows of one
        // slot, a session moved onto another one of its series, stay « la même série ».
        const slotId = other.slotId && other.slotId !== a.slotId ? other.slotId : null;
        for (const kind of entriesClash(a, other))
          clashes.push({ i, kind, slotId, exceptionId: null, eventId: null });
      }
    });
    return clashes;
  }

  /**
   * French messages, one per (kind, clashing item), earliest session first, kept apart per `bucket` of the
   * clash (one bucket for a single change, one per slot for a batch).
   */
  private async describeBy(
    db: Db,
    rows: readonly IndexRow[],
    clashes: readonly Clash[],
    bucket: (clash: Clash) => string,
  ): Promise<Map<string, TimetableConflictDto[]>> {
    if (!clashes.length) return new Map();
    const slotIds = [...new Set(clashes.flatMap((c) => (c.slotId ? [c.slotId] : [])))];
    const eventIds = [...new Set(clashes.flatMap((c) => (c.eventId ? [c.eventId] : [])))];
    // One query at a time: a transaction has a single connection.
    const slots = slotIds.length
      ? await db.timetableSlot.findMany({ where: { id: { in: slotIds } }, include: slotInclude })
      : [];
    const events = eventIds.length
      ? await db.event.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, title: true },
        })
      : [];
    const slotLabel = new Map(
      slots.map((s) => {
        const c = s.classSubject.schoolClass;
        return [
          s.id,
          `${s.classSubject.subject.name}, ${c.label} (${s.teacher.user.firstName} ${s.teacher.user.lastName})`,
        ] as const;
      }),
    );
    const eventLabel = new Map(events.map((e) => [e.id, `« ${e.title} »`] as const));
    const roomIds = [...new Set(rows.flatMap((r) => (r.roomId ? [r.roomId] : [])))];
    const teacherIds = [...new Set(rows.flatMap((r) => (r.teacherId ? [r.teacherId] : [])))];
    const classIds = [...new Set(rows.flatMap((r) => (r.classId ? [r.classId] : [])))];
    const rooms = roomIds.length ? await db.room.findMany({ where: { id: { in: roomIds } } }) : [];
    const teachers = teacherIds.length
      ? await db.teacher.findMany({ where: { id: { in: teacherIds } }, include: { user: true } })
      : [];
    const classes = classIds.length
      ? await db.schoolClass.findMany({
          where: { id: { in: classIds } },
          include: { section: true },
        })
      : [];
    const roomName = new Map(rooms.map((r) => [r.id, r.name] as const));
    const teacherName = new Map(
      teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`] as const),
    );
    const className = new Map(
      classes.map((c) => [c.id, `${c.label} (${c.section.label})`] as const),
    );

    const groups = new Map<
      string,
      { bucket: string; clash: Clash; row: IndexRow; count: number }
    >();
    for (const clash of clashes) {
      const row = rows[clash.i]!;
      const holder = clash.eventId ?? clash.slotId ?? 'self';
      const key = `${bucket(clash)}#${clash.kind}|${clash.exceptionId ?? holder}|${clash.slotId ?? ''}`;
      const seen = groups.get(key);
      if (!seen) groups.set(key, { bucket: bucket(clash), clash, row, count: 1 });
      else {
        seen.count++;
        if (row.startsAt < seen.row.startsAt)
          groups.set(key, { bucket: seen.bucket, clash, row, count: seen.count });
      }
    }
    const out = new Map<string, TimetableConflictDto[]>();
    [...groups.values()]
      .sort((a, b) => a.row.startsAt.localeCompare(b.row.startsAt))
      .forEach(({ bucket: b, clash, row, count }) => {
        const date = row.startsAt.slice(0, 10);
        const startTime = row.startsAt.slice(11, 16);
        const endTime = row.endsAt.slice(11, 16);
        const holder = clash.eventId
          ? (eventLabel.get(clash.eventId) ?? 'un événement')
          : clash.slotId
            ? (slotLabel.get(clash.slotId) ?? 'une autre séance')
            : 'une autre séance de la même série';
        const resource =
          clash.kind === 'room'
            ? (roomName.get(row.roomId ?? '') ?? 'La salle')
            : clash.kind === 'teacher'
              ? (teacherName.get(row.teacherId ?? '') ?? 'L’enseignant')
              : `La classe ${className.get(row.classId ?? '') ?? ''}`.trim();
        const resourceId =
          (clash.kind === 'room'
            ? row.roomId
            : clash.kind === 'teacher'
              ? row.teacherId
              : row.classId) ?? '';
        const dto = {
          kind: clash.kind,
          resourceId,
          date,
          startTime,
          endTime,
          message: conflictMessage({
            kind: clash.kind,
            date,
            startTime,
            endTime,
            resource,
            holder,
            count,
          }),
          count,
          withSource: clash.eventId ? 'event' : clash.exceptionId ? 'exception' : 'slot',
          withId: clash.exceptionId ?? clash.eventId ?? clash.slotId,
          withSlotId: clash.slotId,
          withLabel: holder,
        } satisfies TimetableConflictDto;
        out.set(b, [...(out.get(b) ?? []), dto]);
      });
    return out;
  }

  /** Rewrites the index rows of these slots; a hard conflict throws 409 (the caller's transaction rolls back). */
  async reindexSlots(db: Db, slotIds: readonly string[]): Promise<void> {
    await this.clearSlots(db, slotIds);
    const rows = await this.entriesForSlots(db, slotIds);
    const conflicts = await this.detect(db, rows);
    if (conflicts.length) throw conflictBlocked(conflicts);
    await this.insert(db, rows);
  }

  /** Rewrites the rows of every slot that runs in [from, to] (a holiday was added or removed). */
  async reindexRange(db: Db, from: string, to: string): Promise<void> {
    const slots = await db.timetableSlot.findMany({
      where: {
        OR: [
          {
            validFrom: { lte: new Date(`${to}T00:00:00Z`) },
            validTo: { gte: new Date(`${from}T00:00:00Z`) },
          },
          // A session moved into the range from a series that ends before it.
          {
            exceptions: {
              some: {
                newDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    for (let i = 0; i < slots.length; i += 100)
      await this.reindexSlots(
        db,
        slots.slice(i, i + 100).map((s) => s.id),
      );
  }

  /** Index rows of a one-off event: its room and its class during its time (weekly legacy events are not indexed). */
  eventRows(event: EventBooking): IndexRow[] {
    if (!event.startTime || !event.endTime || event.repeatUntil || event.homework) return [];
    if (!event.roomId && !event.classId) return [];
    return [
      {
        source: 'event',
        day: event.date,
        roomId: event.roomId,
        teacherId: null,
        classId: event.classId,
        divisionKey: event.classId ? (event.hold?.divisionKey ?? null) : null,
        groupId: event.classId ? (event.hold?.groupId ?? null) : null,
        startsAt: stamp(event.date, event.startTime),
        endsAt: stamp(event.date, event.endTime),
        exceptionId: null,
        slotId: null,
        eventId: event.id,
      },
    ];
  }

  /** Writes (or rewrites) the rows of a one-off event; a clash with the timetable throws 409. */
  async indexEvent(db: Db, event: EventBooking): Promise<void> {
    await db.occupancy.deleteMany({ where: { eventId: event.id } });
    const rows = this.eventRows(event);
    const conflicts = await this.detect(db, rows);
    if (conflicts.length) throw conflictBlocked(conflicts);
    await this.insert(db, rows);
  }

  /** Active rooms nobody holds during the time range (the rows of `ignoreSlotId` don't count). */
  async freeRoomIds(
    db: Db,
    date: string,
    startTime: string,
    endTime: string,
    ignoreSlotId: string | null,
  ): Promise<string[]> {
    const from = stamp(date, startTime);
    const to = stamp(date, endTime);
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT r.id FROM rooms r
      WHERE r.active
        AND NOT EXISTS (
          SELECT 1 FROM occupancy o
          WHERE o.room_id = r.id
            AND o.during && tsrange(${from}::timestamp, ${to}::timestamp)
            AND (${ignoreSlotId}::uuid IS NULL OR o.slot_id IS DISTINCT FROM ${ignoreSlotId}::uuid)
        )`;
    return rows.map((r) => r.id);
  }

  /**
   * Which candidates would clash with the index: `rows[k]` belongs to candidate `candidate[k]`. One
   * statement for all of them (the same four rules as `clashes`), not one query per candidate. Each row
   * probes the GiST indexes of the exclusion constraints and stops at the first hit: `EXISTS … OR EXISTS`
   * with the indexes' `IS NOT NULL` predicates spelled out, else the planner hash-joins the whole table
   * (8 ms instead of 170 ms for 600 rows on the seed). Rows of the change itself must have been cleared.
   */
  async clashingCandidates(
    db: Db,
    rows: readonly IndexRow[],
    candidate: readonly number[],
  ): Promise<Set<number>> {
    if (!rows.length) return new Set();
    const json = JSON.stringify(
      rows.map((r, k) => ({
        c: candidate[k],
        room_id: r.roomId,
        teacher_id: r.teacherId,
        class_id: r.classId,
        division_key: r.divisionKey,
        group_id: r.groupId ?? null,
        starts_at: r.startsAt,
        ends_at: r.endsAt,
      })),
    );
    const found = await db.$queryRaw<{ c: number }[]>`
      WITH c AS (
        SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS c(
          c int, room_id uuid, teacher_id uuid, class_id uuid, division_key text, group_id uuid, starts_at timestamp, ends_at timestamp)
      )
      SELECT DISTINCT c.c FROM c
      WHERE EXISTS (
          SELECT 1 FROM occupancy o
          WHERE o.room_id = c.room_id AND o.room_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at))
        OR EXISTS (
          SELECT 1 FROM occupancy o
          WHERE o.teacher_id = c.teacher_id AND o.teacher_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at))
        OR EXISTS (
          SELECT 1 FROM occupancy o
          WHERE o.class_id = c.class_id AND o.class_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at)
            AND (c.division_key IS NULL OR o.division_key IS DISTINCT FROM c.division_key))
        OR (c.group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM occupancy o
          WHERE o.group_id = c.group_id AND o.group_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at)))`;
    return new Set(found.map((f) => f.c));
  }

  /** Active rooms of these kinds that nobody holds during any of the time ranges of `rows` (one statement). */
  async roomsFreeDuring(
    db: Db,
    rows: readonly Pick<IndexRow, 'startsAt' | 'endsAt'>[],
    kinds: readonly RoomKind[],
  ): Promise<RoomCandidate[]> {
    if (!rows.length || !kinds.length) return [];
    const json = JSON.stringify(rows.map((r) => ({ starts_at: r.startsAt, ends_at: r.endsAt })));
    return db.$queryRaw<RoomCandidate[]>`
      WITH c AS (
        SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS c(starts_at timestamp, ends_at timestamp)
      )
      SELECT r.id, r.name, r.capacity::int AS capacity, r.kind::text AS kind FROM rooms r
      WHERE r.active
        AND r.kind::text = ANY(${[...kinds]}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM c JOIN occupancy o
            ON o.room_id = r.id AND o.room_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at)
        )`;
  }

  /**
   * Awaits a write; when two requests raced and the database's exclusion constraint refused the second,
   * answers 409 instead of a 500.
   */
  async guard<T>(work: Promise<T>): Promise<T> {
    try {
      return await work;
    } catch (error) {
      if (CONSTRAINTS.some((c) => isExclusionViolation(error, c))) throw conflictBlocked([]);
      throw error;
    }
  }
}
