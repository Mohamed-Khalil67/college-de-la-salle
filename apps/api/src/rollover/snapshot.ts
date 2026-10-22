import { nextYearLabel, type SectionId } from '@cdls/shared';
import { toDay } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  type RolloverSnapshot,
  type SnapshotCalendarDay,
  type SnapshotPeriod,
  type SnapshotYear,
  calendarDayKey,
  classKey,
  slotKey,
  classSubjectKey,
  assignmentKey,
} from './plan.js';

type Db = Prisma.TransactionClient;

const toYear = (y: {
  id: string;
  label: string;
  startsOn: Date;
  endsOn: Date;
  isCurrent: boolean;
  archivedAt: Date | null;
}): SnapshotYear => ({
  id: y.id,
  label: y.label,
  startsOn: toDay(y.startsOn),
  endsOn: toDay(y.endsOn),
  isCurrent: y.isCurrent,
  archived: y.archivedAt !== null,
});

/**
 * Reads everything the plan depends on, inside the rollover's transaction. A fixed number of queries,
 * whatever the number of students.
 */
export async function loadSnapshot(
  db: Db,
  sourceYearId: string,
  label: string | undefined,
): Promise<RolloverSnapshot> {
  const sourceRow = await db.schoolYear.findUnique({ where: { id: sourceYearId } });
  if (!sourceRow) throw notFound('Année source');
  const targetLabel = label ?? nextYearLabel(sourceRow.label);
  const targetRow = targetLabel
    ? await db.schoolYear.findUnique({ where: { label: targetLabel } })
    : null;
  const targetId = targetRow?.id ?? null;

  const classRows = await db.schoolClass.findMany({
    where: { schoolYearId: sourceYearId },
    include: { section: true },
  });
  const keyOf = new Map(classRows.map((c) => [c.id, classKey(c.section.code, c.code)]));
  const targetClassRows = targetId
    ? await db.schoolClass.findMany({ where: { schoolYearId: targetId }, include: { section: true } })
    : [];
  const targetKeyOf = new Map(targetClassRows.map((c) => [c.id, classKey(c.section.code, c.code)]));

  const periodOf = (p: {
    kind: string;
    section: { code: string } | null;
    number: number;
    label: string;
    startsOn: Date;
    endsOn: Date;
  }): SnapshotPeriod => ({
    kind: p.kind,
    sectionCode: (p.section?.code as SectionId | undefined) ?? null,
    number: p.number,
    label: p.label,
    startsOn: toDay(p.startsOn),
    endsOn: toDay(p.endsOn),
  });
  const periods = await db.period.findMany({
    where: { schoolYearId: sourceYearId },
    include: { section: true },
  });
  const targetPeriods = targetId
    ? await db.period.findMany({ where: { schoolYearId: targetId }, include: { section: true } })
    : [];

  const dayOf =
    (keys: Map<string, string>) =>
    (d: {
      type: string;
      label: string;
      startsOn: Date;
      endsOn: Date;
      section: { code: string } | null;
      classes: { classId: string }[];
    }): SnapshotCalendarDay => ({
      type: d.type,
      label: d.label,
      startsOn: toDay(d.startsOn),
      endsOn: toDay(d.endsOn),
      sectionCode: (d.section?.code as SectionId | undefined) ?? null,
      classKeys: d.classes.map((c) => keys.get(c.classId) ?? c.classId),
    });
  const dayInclude = { section: true, classes: { select: { classId: true } } } as const;
  const days = await db.calendarDay.findMany({
    where: { schoolYearId: sourceYearId },
    include: dayInclude,
  });
  const targetDays = targetId
    ? await db.calendarDay.findMany({ where: { schoolYearId: targetId }, include: dayInclude })
    : [];

  const classSubjects = await db.classSubject.findMany({
    where: { schoolClass: { schoolYearId: sourceYearId } },
    include: { subject: true },
  });
  const targetClassSubjects = targetId
    ? await db.classSubject.findMany({ where: { schoolClass: { schoolYearId: targetId } } })
    : [];

  const assignments = await db.teachingAssignment.findMany({
    where: { classSubject: { schoolClass: { schoolYearId: sourceYearId } } },
    include: { classSubject: true, teacher: { include: { user: true } } },
  });
  const targetAssignments = targetId
    ? await db.teachingAssignment.findMany({
        where: { classSubject: { schoolClass: { schoolYearId: targetId } } },
        include: { classSubject: true },
      })
    : [];

  const slots = await db.timetableSlot.findMany({
    where: { classSubject: { schoolClass: { schoolYearId: sourceYearId } } },
    include: { classSubject: { include: { subject: true } }, room: true, activityType: true },
  });
  const targetSlots = targetId
    ? await db.timetableSlot.findMany({
        where: { classSubject: { schoolClass: { schoolYearId: targetId } } },
        include: { classSubject: true },
      })
    : [];

  const enrollments = await db.enrollment.findMany({
    where: { schoolYearId: sourceYearId, leftOn: null, student: { user: { status: { not: 'archived' } } } },
    include: { student: { include: { user: true, section: true } } },
  });
  const placed = new Map(
    (targetId
      ? await db.enrollment.findMany({
          where: { schoolYearId: targetId, leftOn: null },
          select: { studentId: true, classId: true },
        })
      : []
    ).map((e) => [e.studentId, targetKeyOf.get(e.classId) ?? e.classId]),
  );

  return {
    source: toYear(sourceRow),
    target: targetRow ? toYear(targetRow) : null,
    classes: classRows.map((c) => ({
      id: c.id,
      sectionCode: c.section.code as SectionId,
      code: c.code,
      label: c.label,
      nextKey: c.nextClassId ? (keyOf.get(c.nextClassId) ?? null) : null,
    })),
    targetClassKeys: [...targetKeyOf.values()],
    periods: periods.map(periodOf),
    targetPeriods: targetPeriods.map(periodOf),
    calendarDays: days.map(dayOf(keyOf)),
    targetCalendarDays: targetDays.map(dayOf(targetKeyOf)),
    classSubjects: classSubjects.map((c) => ({
      classKey: keyOf.get(c.classId)!,
      subjectId: c.subjectId,
      subjectName: c.subject.name,
      subjectArchived: c.subject.archivedAt !== null,
      coefficient: Number(c.coefficient),
      hoursPerWeek: c.hoursPerWeek === null ? null : Number(c.hoursPerWeek),
    })),
    targetClassSubjectKeys: targetClassSubjects.map((c) =>
      classSubjectKey(targetKeyOf.get(c.classId) ?? c.classId, c.subjectId),
    ),
    assignments: assignments.map((a) => ({
      classKey: keyOf.get(a.classSubject.classId)!,
      subjectId: a.classSubject.subjectId,
      teacherId: a.teacherId,
      teacherName: `${a.teacher.user.firstName} ${a.teacher.user.lastName}`,
      teacherActive: a.teacher.user.status === 'active',
    })),
    targetAssignmentKeys: targetAssignments.map((a) =>
      assignmentKey(
        targetKeyOf.get(a.classSubject.classId) ?? a.classSubject.classId,
        a.classSubject.subjectId,
        a.teacherId,
      ),
    ),
    slots: slots.map((s) => ({
      id: s.id,
      classKey: keyOf.get(s.classSubject.classId)!,
      subjectId: s.classSubject.subjectId,
      subjectName: s.classSubject.subject.name,
      teacherId: s.teacherId,
      roomId: s.roomId,
      roomActive: s.room?.active ?? true,
      activityTypeId: s.activityTypeId,
      activityUsable:
        !s.activityType.archivedAt &&
        !s.activityType.ownerTeacherId &&
        s.activityType.repeatable &&
        !s.activityType.homework,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      weekParity: s.weekParity,
      division: s.division,
      validTo: toDay(s.validTo),
    })),
    targetSlotKeys: targetSlots.map((s) =>
      slotKey({
        classKey: targetKeyOf.get(s.classSubject.classId) ?? s.classSubject.classId,
        subjectId: s.classSubject.subjectId,
        teacherId: s.teacherId,
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
        weekParity: s.weekParity,
        division: s.division,
      }),
    ),
    students: enrollments.map((e) => ({
      studentId: e.studentId,
      firstName: e.student.user.firstName,
      lastName: e.student.user.lastName,
      studentNumber: e.student.studentNumber,
      sectionCode: (e.student.section?.code ?? 'nationale') as SectionId,
      classKey: keyOf.get(e.classId)!,
      alreadyIn: placed.get(e.studentId) ?? null,
    })),
  };
}

export { calendarDayKey };
