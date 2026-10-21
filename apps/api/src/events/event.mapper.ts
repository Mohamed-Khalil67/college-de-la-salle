import {
  type Attachment,
  type CalendarEvent,
  classTarget,
  type SectionId,
  type Target,
} from '@cdls/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { toDay } from '../common/dates.js';
import { toActivityTypeSummary } from '../activity-types/activity-types.service.js';
import { toTargetDto } from '../targets/target.mapper.js';
import type { EventDto } from './dto/event.dto.js';

/** What every event query includes, so it can be mapped to the API shape and to the shared model. */
export const eventInclude = {
  activityType: true,
  room: true,
  author: { include: { user: { select: { firstName: true, lastName: true } } } },
  schoolClass: { include: { section: true } },
  section: true,
  /** Who the work concerns (see TargetsService); no row means the whole class. */
  targets: { include: { group: true } },
} satisfies Prisma.EventInclude;

export type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

export function toEventDto(e: EventRow): EventDto {
  return {
    id: e.id,
    activityTypeId: e.activityTypeId,
    type: toActivityTypeSummary(e.activityType),
    title: e.title,
    subjectId: e.subjectId,
    classId: e.classId,
    sectionId: e.sectionId,
    date: toDay(e.date),
    startTime: e.startTime,
    endTime: e.endTime,
    repeatUntil: e.repeatUntil ? toDay(e.repeatUntil) : null,
    roomId: e.roomId,
    roomName: e.room?.name ?? null,
    place: e.place,
    periodId: e.periodId,
    description: e.description,
    attachments: (e.attachments ?? []) as unknown as Attachment[],
    coefficient: Number(e.coefficient),
    target: toTargetDto(e.targets),
    authorId: e.authorId,
    authorName: `${e.author.user.firstName} ${e.author.user.lastName}`,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** `all`, `bac` or `bac-premiere`: the audience in the shared model's notation. */
export function eventTarget(e: EventRow): Target {
  if (e.schoolClass)
    return classTarget(e.schoolClass.section.code as SectionId, e.schoolClass.code);
  return e.section?.code ?? 'all';
}

/** The shared CalendarEvent, to reuse its pure functions (weekly occurrences, .ics). */
export function toCalendarEvent(e: EventRow): CalendarEvent {
  const dto = toEventDto(e);
  return {
    id: dto.id,
    type: dto.type,
    title: dto.title,
    subject: dto.subjectId ?? '',
    target: eventTarget(e),
    date: dto.date,
    start: dto.startTime ?? '',
    end: dto.endTime ?? '',
    repeatUntil: dto.repeatUntil ?? '',
    place: dto.place,
    description: dto.description,
    attachments: dto.attachments,
    coefficient: dto.coefficient,
    authorUid: dto.authorId,
    authorName: dto.authorName,
    createdAt: e.createdAt.getTime(),
  };
}
