import { Injectable } from '@nestjs/common';
import {
  CALENDAR_DAY_TYPE_LABELS,
  CLOSED_DAY_TYPES,
  calendarDayFeedItem,
  type Closure,
  eventFeedItems,
  type EventFeedInfo,
  type FeedItem,
  feedWindow,
  isAssessment,
  latestInstant,
  sessionFeedItem,
  type TimetableOccurrence,
  toFeedIcs,
} from '@cdls/shared';
import { AccessService } from '../access/access.service.js';
import { loadClosures } from '../calendar-days/closures.js';
import { fromDay, schoolToday, toDay } from '../common/dates.js';
import { eventInclude, type EventRow, toCalendarEvent } from '../events/event.mapper.js';
import type { Prisma } from '../generated/prisma/client.js';
import { expandSlots, type SlotData, slotInclude, toSlotData } from '../occupancy/slot-data.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Whose feed it is (read from the feed's account, never from the request). */
export interface FeedOwner {
  readonly role: 'student' | 'teacher';
  readonly studentId: string | null;
  readonly teacherId: string | null;
  readonly firstName: string;
  readonly lastName: string;
}

/** What one person's feed is made of: their sessions, events and calendar days. */
interface Scope {
  readonly slots: Prisma.TimetableSlotWhereInput | null;
  /** Keeps the sessions that are theirs once expanded (a group, a substitute…). */
  readonly keep: (o: TimetableOccurrence<SlotData>) => boolean;
  readonly events: Prisma.EventWhereInput | null;
  readonly days: Prisma.CalendarDayWhereInput;
}

const NOTHING: Scope = {
  slots: null,
  keep: () => false,
  events: null,
  days: { sectionId: null, classes: { none: {} } },
};

/**
 * Builds the .ics of a feed: the real sessions of the rolling window (exceptions applied: cancelled
 * sessions left out, moved ones at their new day, time and room), the one-off events, exams and homework
 * the owner is concerned by, and the calendar days (holidays, days without classes…) of their audience.
 * The audience rules are the API's own: a student gets their current class (whole-class sessions and
 * those of their groups) and the events `AccessService.eventAudienceFor` gives them; a teacher their own
 * sessions (as taught now) and the events of the classes and subjects they teach.
 */
@Injectable()
export class FeedBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async build(owner: FeedOwner, now = new Date()): Promise<string> {
    const { from, to } = feedWindow(schoolToday(now));
    const scope =
      owner.role === 'student' ? await this.studentScope(owner) : await this.teacherScope(owner);
    const closures = await loadClosures(this.prisma, CLOSED_DAY_TYPES, from, to);
    const items = [
      ...(await this.sessions(scope, from, to, closures)),
      ...(await this.events(scope, from, to, closures)),
      ...(await this.days(scope, from, to)),
    ];
    return toFeedIcs(items, {
      name: `Collège de la Salle — ${owner.firstName} ${owner.lastName}`,
      now: now.toISOString(),
    });
  }

  /* Audiences --------------------------------------------------------------------------------- */

  private async studentScope(owner: FeedOwner): Promise<Scope> {
    if (!owner.studentId) return NOTHING;
    const placement = await this.access.placement(owner.studentId);
    const events = this.access.eventAudienceFor(placement, owner.studentId);
    if (!placement) return { ...NOTHING, events };
    const groups = new Set(
      (
        await this.prisma.groupMember.findMany({
          where: { studentId: owner.studentId, leftOn: null },
          select: { groupId: true },
        })
      ).map((m) => m.groupId),
    );
    return {
      // The class of the current year only: an archived year's timetable is not theirs any more.
      slots: { classSubject: { classId: placement.classId } },
      keep: (o) => !o.slot.groupId || groups.has(o.slot.groupId),
      events,
      days: {
        AND: [
          { OR: [{ sectionId: null }, { sectionId: placement.sectionId }] },
          {
            OR: [{ classes: { none: {} } }, { classes: { some: { classId: placement.classId } } }],
          },
        ],
      },
    };
  }

  private async teacherScope(owner: FeedOwner): Promise<Scope> {
    const teacherId = owner.teacherId;
    if (!teacherId) return NOTHING;
    const taught = await this.prisma.teachingAssignment.findMany({
      where: { teacherId, classSubject: { schoolClass: { schoolYear: { isCurrent: true } } } },
      select: {
        classSubject: {
          select: { classId: true, subjectId: true, schoolClass: { select: { sectionId: true } } },
        },
      },
    });
    const classIds = [...new Set(taught.map((t) => t.classSubject.classId))];
    const sectionIds = [...new Set(taught.map((t) => t.classSubject.schoolClass.sectionId))];
    return {
      slots: {
        // The current year only, as for students.
        classSubject: { schoolClass: { schoolYear: { isCurrent: true } } },
        OR: [{ teacherId }, { exceptions: { some: { newTeacherId: teacherId } } }],
      },
      // The sessions they teach now: not those a substitute took, but those they took for someone else.
      keep: (o) => o.current.teacherId === teacherId,
      events: {
        OR: [
          { authorId: teacherId },
          // The events of their classes in their subjects (or without a subject).
          ...taught.map((t) => ({
            classId: t.classSubject.classId,
            OR: [{ subjectId: t.classSubject.subjectId }, { subjectId: null }],
          })),
          { classId: null, sectionId: null },
          ...(sectionIds.length ? [{ classId: null, sectionId: { in: sectionIds } }] : []),
        ],
      },
      days: {
        OR: [
          { sectionId: null, classes: { none: {} } },
          ...(sectionIds.length ? [{ sectionId: { in: sectionIds }, classes: { none: {} } }] : []),
          ...(classIds.length ? [{ classes: { some: { classId: { in: classIds } } } }] : []),
        ],
      },
    };
  }

  /* Entries ----------------------------------------------------------------------------------- */

  private async sessions(
    scope: Scope,
    from: string,
    to: string,
    closures: readonly Closure[],
  ): Promise<FeedItem[]> {
    if (!scope.slots) return [];
    const rows = await this.prisma.timetableSlot.findMany({
      where: {
        AND: [
          scope.slots,
          {
            OR: [
              { validFrom: { lte: fromDay(to) }, validTo: { gte: fromDay(from) } },
              // A session of another week moved into the window.
              { exceptions: { some: { newDate: { gte: fromDay(from), lte: fromDay(to) } } } },
            ],
          },
        ],
      },
      include: slotInclude,
    });
    const sessions = expandSlots(rows.map(toSlotData), from, to, closures).filter(scope.keep);
    const names = await this.names(sessions);
    return sessions.flatMap((o) => {
      const row = o.slot.row;
      const exception = o.exception ? row.exceptions.find((e) => e.id === o.exception!.id) : null;
      const item = sessionFeedItem(o, {
        subject: row.classSubject.subject.name,
        activity: row.activityType.label,
        room: o.current.roomId ? (names.rooms.get(o.current.roomId) ?? null) : null,
        originalRoom: o.original.roomId ? (names.rooms.get(o.original.roomId) ?? null) : null,
        teacher: names.teachers.get(o.current.teacherId) ?? '',
        className: row.classSubject.schoolClass.label,
        group: row.group?.label ?? null,
        updatedAt: latestInstant(row.updatedAt.toISOString(), exception?.updatedAt.toISOString()),
      });
      return item ? [item] : [];
    });
  }

  private async events(
    scope: Scope,
    from: string,
    to: string,
    closures: readonly Closure[],
  ): Promise<FeedItem[]> {
    if (!scope.events) return [];
    const rows: EventRow[] = await this.prisma.event.findMany({
      where: {
        AND: [
          {
            date: { lte: fromDay(to) },
            OR: [
              { repeatUntil: { gte: fromDay(from) } },
              { repeatUntil: null, date: { gte: fromDay(from) } },
            ],
          },
          scope.events,
        ],
      },
      include: eventInclude,
    });
    const info = new Map<string, EventFeedInfo>(
      rows.map((r) => [
        r.id,
        {
          homework: r.activityType.homework,
          assessment: isAssessment(r.activityType),
          updatedAt: r.updatedAt.toISOString(),
        },
      ]),
    );
    // A booked room stands for the place when none was typed.
    const events = rows.map((r) => ({
      ...toCalendarEvent(r),
      place: r.place || r.room?.name || '',
    }));
    return eventFeedItems(events, info, from, to, closures);
  }

  private async days(scope: Scope, from: string, to: string): Promise<FeedItem[]> {
    const rows = await this.prisma.calendarDay.findMany({
      where: {
        AND: [{ startsOn: { lte: fromDay(to) }, endsOn: { gte: fromDay(from) } }, scope.days],
      },
      select: {
        id: true,
        type: true,
        label: true,
        startsOn: true,
        endsOn: true,
        updatedAt: true,
      },
    });
    return rows.map((d) =>
      calendarDayFeedItem({
        id: d.id,
        label: d.label,
        typeLabel: CALENDAR_DAY_TYPE_LABELS[d.type],
        startsOn: toDay(d.startsOn),
        endsOn: toDay(d.endsOn),
        updatedAt: d.updatedAt.toISOString(),
      }),
    );
  }

  /** Room and teacher names of the sessions, two queries for all of them. */
  private async names(sessions: readonly TimetableOccurrence<SlotData>[]) {
    const roomIds = new Set<string>();
    const teacherIds = new Set<string>();
    for (const o of sessions) {
      for (const v of [o.current, o.original]) {
        if (v.roomId) roomIds.add(v.roomId);
        teacherIds.add(v.teacherId);
      }
    }
    const [rooms, teachers] = await Promise.all([
      roomIds.size
        ? this.prisma.room.findMany({
            where: { id: { in: [...roomIds] } },
            select: { id: true, name: true },
          })
        : [],
      teacherIds.size
        ? this.prisma.teacher.findMany({
            where: { id: { in: [...teacherIds] } },
            select: { id: true, user: { select: { firstName: true, lastName: true } } },
          })
        : [],
    ]);
    return {
      rooms: new Map(rooms.map((r) => [r.id, r.name])),
      teachers: new Map(teachers.map((t) => [t.id, `${t.user.firstName} ${t.user.lastName}`])),
    };
  }
}
