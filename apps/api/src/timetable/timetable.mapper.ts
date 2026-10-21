import type {
  ActivityColour,
  ActivityIcon,
  SessionValues,
  SessionValuesDto as SessionValuesContract,
  SlotExceptionDto as SlotExceptionContract,
  TimetableOccurrence,
  TimetableOccurrenceDto as OccurrenceContract,
  TimetableSlotDto as SlotContract,
} from '@cdls/shared';
import { toDay } from '../common/dates.js';
import type { ExceptionRow, SlotData, SlotRow } from '../occupancy/slot-data.js';

export const personName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`;

export function toSlotDto(row: SlotRow): SlotContract {
  const t = row.activityType;
  return {
    id: row.id,
    classSubjectId: row.classSubjectId,
    classId: row.classSubject.classId,
    classLabel: row.classSubject.schoolClass.label,
    subjectId: row.classSubject.subjectId,
    subjectName: row.classSubject.subject.name,
    teacherId: row.teacherId,
    teacherName: personName(row.teacher.user),
    roomId: row.roomId,
    roomName: row.room?.name ?? null,
    activityTypeId: row.activityTypeId,
    activityType: {
      id: t.id,
      code: t.code,
      label: t.label,
      colour: t.colour as ActivityColour,
      icon: t.icon as ActivityIcon,
      gradable: t.gradable,
      repeatable: t.repeatable,
      homework: t.homework,
    },
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    validFrom: toDay(row.validFrom),
    validTo: toDay(row.validTo),
    weekParity: row.weekParity,
    division: row.division,
    groupId: row.groupId,
  };
}

export function toExceptionDto(row: ExceptionRow): SlotExceptionContract {
  return {
    id: row.id,
    slotId: row.slotId,
    date: toDay(row.date),
    kind: row.kind,
    newDate: row.newDate ? toDay(row.newDate) : null,
    newStart: row.newStart,
    newEnd: row.newEnd,
    newRoomId: row.newRoomId,
    newTeacherId: row.newTeacherId,
    reason: row.reason,
  };
}

export interface Names {
  readonly rooms: ReadonlyMap<string, string>;
  readonly teachers: ReadonlyMap<string, string>;
}

function toSession(v: SessionValues, names: Names): SessionValuesContract {
  return {
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    roomId: v.roomId,
    roomName: v.roomId ? (names.rooms.get(v.roomId) ?? null) : null,
    teacherId: v.teacherId,
    teacherName: names.teachers.get(v.teacherId) ?? '',
  };
}

export function toOccurrenceDto(
  o: TimetableOccurrence<SlotData>,
  names: Names,
  canChange: boolean,
): OccurrenceContract {
  const row = o.slot.row;
  const t = row.activityType;
  return {
    key: o.key,
    slotId: o.slot.id,
    originalDate: o.originalDate,
    status: o.status,
    current: toSession(o.current, names),
    original: toSession(o.original, names),
    changes: o.changes,
    movedTo: o.movedTo ? toSession(o.movedTo, names) : null,
    exceptionId: o.exception?.id ?? null,
    reason: o.exception?.reason ?? '',
    classId: row.classSubject.classId,
    classLabel: row.classSubject.schoolClass.label,
    subjectId: row.classSubject.subjectId,
    subjectName: row.classSubject.subject.name,
    activityType: {
      id: t.id,
      code: t.code,
      label: t.label,
      colour: t.colour as ActivityColour,
      icon: t.icon as ActivityIcon,
      gradable: t.gradable,
      repeatable: t.repeatable,
      homework: t.homework,
    },
    division: row.division,
    canChange,
  };
}
