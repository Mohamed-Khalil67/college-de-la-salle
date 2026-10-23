import { Injectable } from '@nestjs/common';
import {
  addDays,
  CLOSED_DAY_TYPES,
  closureCovers,
  compatibleRoomKinds,
  entriesClash,
  minutesOf,
  needsLab,
  occupancyEntries,
  periodTimes,
  rankRooms,
  type RoomKind,
  roomSuggestion,
  SCHOOL_WEEKDAYS,
  type SeriesPlace,
  seriesCandidates,
  type SessionPlace,
  sessionCandidates,
  schoolTimeNow,
  stamp,
  type TimetableConflictDto,
  type TimetableSuggestionDto,
  TIMETABLE_SUGGESTION_LIMITS,
  timeSuggestion,
  weekday,
} from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { loadClosures } from '../calendar-days/closures.js';
import { schoolToday, toDay } from '../common/dates.js';
import { type IndexRow, OccupancyService } from '../occupancy/occupancy.service.js';
import { expandSlots, slotInclude, type SlotRow, toSlotData } from '../occupancy/slot-data.js';

type Db = Prisma.TransactionClient;

/**
 * What the refused write placed, so its suggestions can be sent back the same way: one session of a slot
 * (an exception, on its original `date`) or the weekly rule of a slot. Teachers only ever reach the first
 * kind, for their own slots: the mutation authorised them before anything is suggested.
 */
export type SuggestionAsk =
  | {
      readonly target: 'session';
      readonly slotId: string;
      readonly date: string;
      /** A move may also go to another time; a room change only to another room than the rule's. */
      readonly change: 'moved' | 'room_change';
    }
  | { readonly target: 'series'; readonly slotId: string };

/**
 * Ways out of a hard conflict, computed inside the write's own transaction (its rows are already cleared
 * from the index, so its old places count as free): other rooms at the same time, other times for the same
 * teacher, class and room. Candidates come from the shared engine (`@cdls/shared` suggestions), and the
 * index is asked about all of them at once: at most six queries whatever the number of candidates.
 */
@Injectable()
export class TimetableSuggestionsService {
  constructor(private readonly occupancy: OccupancyService) {}

  async forConflicts(
    db: Db,
    ask: SuggestionAsk,
    rows: readonly IndexRow[],
    conflicts: readonly TimetableConflictDto[],
  ): Promise<TimetableSuggestionDto[]> {
    const mine = (r: IndexRow) =>
      r.slotId === ask.slotId && (ask.target === 'series' || r.day === ask.date);
    const placed = rows.filter(mine);
    if (!placed.length || !conflicts.length) return [];
    const others = rows.filter((r) => !mine(r));
    // One query at a time: a transaction has a single connection.
    const row = await db.timetableSlot.findUnique({
      where: { id: ask.slotId },
      include: slotInclude,
    });
    if (!row) return [];
    const out: TimetableSuggestionDto[] = [];
    // Another room only helps when the room is all that clashes.
    if (conflicts.every((c) => c.kind === 'room'))
      out.push(...(await this.rooms(db, ask, row, placed, others)));
    if (ask.target === 'series' || ask.change === 'moved')
      out.push(...(await this.times(db, ask, row, placed, others)));
    return out;
  }

  private async rooms(
    db: Db,
    ask: SuggestionAsk,
    row: SlotRow,
    placed: readonly IndexRow[],
    others: readonly IndexRow[],
  ): Promise<TimetableSuggestionDto[]> {
    // A series asks for the rule's room (a session of it may hold another through an exception).
    const wantedRoomId = ask.target === 'series' ? row.roomId : placed[0]!.roomId;
    // A room change back to the rule's own room is no change at all.
    const ruleRoomId = ask.target === 'session' && ask.change === 'room_change' ? row.roomId : null;
    const wanted = wantedRoomId ? await db.room.findUnique({ where: { id: wantedRoomId } }) : null;
    const kinds = compatibleRoomKinds({
      lab: needsLab(row.activityType),
      requestedKind: (wanted?.kind as RoomKind | undefined) ?? null,
    });
    const free = await this.occupancy.roomsFreeDuring(db, placed, kinds);
    const seats = row.groupId
      ? await db.groupMember.count({ where: { groupId: row.groupId, leftOn: null } })
      : await db.enrollment.count({ where: { classId: row.classSubject.classId, leftOn: null } });
    // Rows of the same change elsewhere (the other half of a split) hold their rooms too.
    const heldByChange = (roomId: string) =>
      placed.some((p) =>
        others.some((o) => o.roomId === roomId && p.startsAt < o.endsAt && o.startsAt < p.endsAt),
      );
    return rankRooms(
      free.filter((r) => r.id !== wantedRoomId && r.id !== ruleRoomId && !heldByChange(r.id)),
      { seats, kinds },
    )
      .slice(0, TIMETABLE_SUGGESTION_LIMITS.rooms)
      .map((r) => roomSuggestion(ask.target, r));
  }

  private async times(
    db: Db,
    ask: SuggestionAsk,
    row: SlotRow,
    placed: readonly IndexRow[],
    others: readonly IndexRow[],
  ): Promise<TimetableSuggestionDto[]> {
    // The periods of the school year: the times its timetable already uses.
    const grid = await db.timetableSlot.findMany({
      where: {
        classSubject: { schoolClass: { schoolYearId: row.classSubject.schoolClass.schoolYearId } },
      },
      select: { startTime: true, endTime: true },
      distinct: ['startTime', 'endTime'],
    });
    const slot = toSlotData(row);
    const first = placed[0]!;
    // A session keeps the length it has now; a series the rule's (its sessions may have been shortened).
    const length =
      ask.target === 'series'
        ? minutesOf(slot.endTime) - minutesOf(slot.startTime)
        : minutesOf(first.endsAt.slice(11, 16)) - minutesOf(first.startsAt.slice(11, 16));
    const times = periodTimes(grid, length);
    const candidates: { place: SessionPlace | SeriesPlace; rows: IndexRow[] }[] = [];

    if (ask.target === 'session') {
      const wanted: SessionPlace = {
        date: first.startsAt.slice(0, 10),
        startTime: first.startsAt.slice(11, 16),
        endTime: first.endsAt.slice(11, 16),
      };
      const sunday = addDays(wanted.date, -weekday(wanted.date));
      const closures = await loadClosures(db, CLOSED_DAY_TYPES, sunday, addDays(sunday, 6));
      const places = sessionCandidates(wanted, {
        weekdays: SCHOOL_WEEKDAYS,
        times,
        today: schoolToday(),
        now: schoolTimeNow(),
        isOpen: (day) =>
          !closures.some(
            (c) => c.startsOn <= day && day <= c.endsOn && closureCovers(c, slot.target),
          ),
      }).filter(
        // Back where the rule puts it is no move at all.
        (p) =>
          !(p.date === ask.date && p.startTime === slot.startTime && p.endTime === slot.endTime),
      );
      for (const place of places)
        candidates.push({
          place,
          rows: [
            {
              ...first,
              startsAt: stamp(place.date, place.startTime),
              endsAt: stamp(place.date, place.endTime),
            },
          ],
        });
    } else {
      // Each candidate rule is expanded like the real one (its holidays, its rhythm, its exceptions).
      const days = [
        toDay(row.validFrom),
        toDay(row.validTo),
        ...row.exceptions.flatMap((e) => (e.newDate ? [toDay(e.newDate)] : [])),
      ].sort();
      const from = days[0]!;
      const to = days.at(-1)!;
      const closures = await loadClosures(db, CLOSED_DAY_TYPES, from, to);
      const places = seriesCandidates(
        { weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime },
        { weekdays: SCHOOL_WEEKDAYS, times },
      );
      for (const place of places) {
        const moved = { ...slot, ...place };
        const entries = occupancyEntries(
          expandSlots([moved], from, to, closures),
          slot.classId,
          slot.division,
          slot.groupId,
        ).map((e) => ({ ...e, slotId: slot.id, eventId: null }));
        if (entries.length) candidates.push({ place, rows: entries });
      }
    }

    const flat = candidates.flatMap((c) => c.rows);
    const owner = candidates.flatMap((c, k) => c.rows.map(() => k));
    const taken = await this.occupancy.clashingCandidates(db, flat, owner);
    return candidates
      .filter(
        (c, k) =>
          !taken.has(k) && !c.rows.some((r) => others.some((o) => entriesClash(r, o).length)),
      )
      .slice(0, TIMETABLE_SUGGESTION_LIMITS.times)
      .map((c) => timeSuggestion(c.place));
  }
}
