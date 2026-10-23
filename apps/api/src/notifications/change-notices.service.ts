import { Injectable } from '@nestjs/common';
import {
  eventNotice,
  gradeNotice,
  homeworkNotice,
  type NotificationText,
  type Role,
  schoolToday,
  type SessionChangeFacts,
  sessionNotice,
} from '@cdls/shared';
import { toDay } from '../common/dates.js';
import type { EventRow } from '../events/event.mapper.js';
import type { Prisma } from '../generated/prisma/client.js';
import { slotInclude } from '../occupancy/slot-data.js';
import { TargetsService } from '../targets/targets.service.js';
import { eventChangeKind, type EventSchedule, eventUpcoming } from './event-changes.js';
import {
  type NotificationDraft,
  NotificationsService,
  type Recipient,
} from './notifications.service.js';

type Db = Prisma.TransactionClient;

/** One session of the timetable changed (its ORIGINAL day), as the timetable write saw it. */
export interface SessionNotice {
  readonly kind: SessionChangeFacts['kind'];
  readonly slotId: string;
  readonly date: string;
  readonly newDate?: string | null;
  readonly newStart?: string | null;
  readonly newEnd?: string | null;
  readonly newRoomId?: string | null;
  readonly reason?: string | null;
  /** The substitute teacher this change takes the session away from (told too); null: none. */
  readonly substituteTeacherId?: string | null;
}

/** The schedule of an event row, for comparing it before and after an edit. */
export function eventSchedule(row: EventRow): EventSchedule {
  return {
    date: toDay(row.date),
    startTime: row.startTime,
    endTime: row.endTime,
    repeatUntil: row.repeatUntil ? toDay(row.repeatUntil) : null,
    roomId: row.roomId,
    place: row.place,
  };
}

const label = (row: EventRow) => `${row.activityType.label} — ${row.title}`;
const same = (text: NotificationText) => () => text;

/**
 * Who a change concerns, and what they are told. Called INSIDE the transaction of the change (timetable
 * exception, event write, grade publication), so rosters and targets are read as that transaction sees
 * them and the notifications commit with the change. Students only ever hear about their own class:
 * the whole-class sessions and those of the groups they are in, and the events `TargetsService` (for a
 * class) or the section and school audience (for the others) gives them.
 */
@Injectable()
export class ChangeNoticesService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly targets: TargetsService,
  ) {}

  /** Sessions cancelled, moved, re-roomed or restored: the students of the session and its teacher. */
  async sessions(tx: Db, notices: readonly SessionNotice[], actorId: string | null): Promise<void> {
    const drafts: NotificationDraft[] = [];
    for (const notice of notices) {
      // Queries inside a transaction run one after the other.
      const slot = await tx.timetableSlot.findUnique({
        where: { id: notice.slotId },
        include: slotInclude,
      });
      if (!slot) continue;
      const newRoom = notice.newRoomId
        ? ((await tx.room.findUnique({ where: { id: notice.newRoomId }, select: { name: true } }))
            ?.name ?? null)
        : null;
      const students = slot.groupId
        ? await tx.groupMember.findMany({
            where: { groupId: slot.groupId, leftOn: null },
            select: { student: { select: { userId: true } } },
          })
        : await tx.enrollment.findMany({
            where: { classId: slot.classSubject.classId, leftOn: null },
            select: { student: { select: { userId: true } } },
          });
      const facts: Omit<SessionChangeFacts, 'className'> = {
        kind: notice.kind,
        subject: slot.classSubject.subject.name,
        day: notice.date,
        start: slot.startTime,
        end: slot.endTime,
        newDay: notice.newDate ?? null,
        newStart: notice.newStart ?? null,
        newEnd: notice.newEnd ?? null,
        newRoom,
        reason: notice.reason ?? null,
      };
      const substitute = notice.substituteTeacherId
        ? await tx.teacher.findUnique({
            where: { id: notice.substituteTeacherId },
            select: { userId: true },
          })
        : null;
      const className = slot.group
        ? `${slot.classSubject.schoolClass.label}, ${slot.group.label}`
        : slot.classSubject.schoolClass.label;
      drafts.push({
        kind: notice.kind,
        recipients: [
          ...students.map((s) => ({ userId: s.student.userId, role: 'student' as const })),
          { userId: slot.teacher.userId, role: 'teacher' },
          ...(substitute ? [{ userId: substitute.userId, role: 'teacher' as const }] : []),
        ],
        text: (role: Role) =>
          sessionNotice({ ...facts, className: role === 'student' ? null : className }),
        topic: 'timetable',
        // The later of the two days: a session moved to the future is still worth an e-mail.
        occursOn: [notice.date, notice.newDate ?? notice.date].sort().at(-1)!,
        entity: 'timetable_slot',
        entityId: `${slot.id}@${notice.date}`,
      });
    }
    await this.notifications.write(tx, drafts, actorId);
  }

  /** An edited one-off event: moved, or in another room or place. Nothing for other edits or the past. */
  async eventChanged(
    tx: Db,
    before: EventSchedule,
    after: EventRow,
    actorId: string | null,
  ): Promise<void> {
    const now = eventSchedule(after);
    const kind = eventChangeKind(before, now, schoolToday());
    if (!kind) return;
    const text = eventNotice({
      kind,
      label: label(after),
      day: before.date,
      start: before.startTime,
      newDay: now.date,
      newStart: now.startTime,
      newEnd: now.endTime,
      newPlace: after.room?.name ?? (after.place || null),
    });
    await this.notifications.write(
      tx,
      [
        {
          kind,
          recipients: await this.eventAudience(tx, after),
          text: same(text),
          topic: after.activityType.homework ? 'homework' : 'agenda',
          occursOn: [before.date, now.date].sort().at(-1)!,
          entity: 'event',
          entityId: after.id,
        },
      ],
      actorId,
    );
  }

  /** An event about to be deleted (call before the delete: its targets go with it). */
  async eventCancelled(tx: Db, row: EventRow, actorId: string | null): Promise<void> {
    const schedule = eventSchedule(row);
    if (!eventUpcoming(schedule, schoolToday())) return;
    const text = eventNotice({
      kind: 'event_cancelled',
      label: label(row),
      day: schedule.date,
      start: schedule.startTime,
    });
    await this.notifications.write(
      tx,
      [
        {
          kind: 'event_cancelled',
          recipients: await this.eventAudience(tx, row),
          text: same(text),
          topic: row.activityType.homework ? 'homework' : 'agenda',
          occursOn: schedule.repeatUntil ?? schedule.date,
          entity: 'event',
          entityId: row.id,
        },
      ],
      actorId,
    );
  }

  /** A new homework of a class: the students it concerns (its targets), when it is still to come. */
  async homeworkAssigned(tx: Db, row: EventRow, actorId: string | null): Promise<void> {
    if (!row.activityType.homework || !row.classId) return;
    const due = toDay(row.date);
    if (due < schoolToday()) return;
    const subject = await this.subjectName(tx, row.subjectId);
    const students = await this.targetedStudents(tx, row);
    await this.notifications.write(
      tx,
      [
        {
          kind: 'homework_assigned',
          recipients: students,
          text: same(
            homeworkNotice({ title: row.title, subject, dueDay: due, dueTime: row.startTime }),
          ),
          topic: 'homework',
          occursOn: due,
          entity: 'event',
          entityId: row.id,
        },
      ],
      actorId,
    );
  }

  /** Grades shown to these students for the first time. */
  async gradesPublished(
    tx: Db,
    event: Pick<EventRow, 'id' | 'title' | 'subjectId'>,
    studentIds: readonly string[],
    actorId: string | null,
  ): Promise<void> {
    if (!studentIds.length) return;
    const subject = await this.subjectName(tx, event.subjectId);
    const students = await tx.student.findMany({
      where: { id: { in: [...studentIds] } },
      select: { userId: true },
    });
    await this.notifications.write(
      tx,
      [
        {
          kind: 'grade_published',
          recipients: students.map((s) => ({ userId: s.userId, role: 'student' })),
          text: same(gradeNotice({ title: event.title, subject })),
          topic: 'grades',
          occursOn: null,
          entity: 'event',
          entityId: event.id,
        },
      ],
      actorId,
    );
  }

  /* Audiences --------------------------------------------------------------------------------- */

  /**
   * The people an event concerns: for a class, the students its targets give (the whole class by default)
   * and its author; for a section or the whole school, the students enrolled this year there.
   */
  private async eventAudience(tx: Db, row: EventRow): Promise<Recipient[]> {
    const students = row.classId
      ? await this.targetedStudents(tx, row)
      : (
          await tx.enrollment.findMany({
            where: {
              leftOn: null,
              schoolYear: { isCurrent: true },
              ...(row.sectionId ? { schoolClass: { sectionId: row.sectionId } } : {}),
            },
            select: { student: { select: { userId: true } } },
          })
        ).map((e) => ({ userId: e.student.userId, role: 'student' as const }));
    const author = await tx.teacher.findUnique({
      where: { id: row.authorId },
      select: { userId: true },
    });
    return [...students, ...(author ? [{ userId: author.userId, role: 'teacher' as const }] : [])];
  }

  private async targetedStudents(tx: Db, row: EventRow): Promise<Recipient[]> {
    const ids = await this.targets.concernedIds(tx, row);
    if (!ids.length) return [];
    const students = await tx.student.findMany({
      where: { id: { in: ids } },
      select: { userId: true },
    });
    return students.map((s) => ({ userId: s.userId, role: 'student' }));
  }

  private async subjectName(tx: Db, subjectId: string | null): Promise<string | null> {
    if (!subjectId) return null;
    return (
      (await tx.subject.findUnique({ where: { id: subjectId }, select: { name: true } }))?.name ??
      null
    );
  }
}
