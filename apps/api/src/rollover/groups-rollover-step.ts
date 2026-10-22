import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RolloverIssue, RolloverStepSummary } from '@cdls/shared';
import { audit } from '../common/audit.js';
import { fromDay, toDay } from '../common/dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import { groupKey, groupsToCopy, membershipsToCreate } from './groups-copy.js';
import type { RolloverContext, RolloverExtraResult, RolloverExtraStep } from './rollover-step.js';
import { type NewSlot, placeNewSlots } from './slot-placement.js';

type Tx = Prisma.TransactionClient;
type Counts = { create: number; existing: number; skipped: number };

const slotKey = (s: {
  classSubjectId: string;
  teacherId: string;
  groupId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  weekParity: string | null;
}) =>
  [s.classSubjectId, s.teacherId, s.groupId ?? '', s.weekday, s.startTime, s.endTime, s.weekParity ?? ''].join('|');

/**
 * Phase 3 meets phase 5: the groups of the copied classes, the memberships of the promoted students and the
 * timetable sessions of groups (the contract in docs/school-year-design.md). Everything is matched on natural
 * keys, so a second run creates nothing; nothing of the old year is touched; assessment targets are never copied.
 */
@Injectable()
export class GroupsRolloverStep implements RolloverExtraStep {
  constructor(private readonly occupancy: OccupancyService) {}

  async apply(tx: Tx, ctx: RolloverContext): Promise<RolloverExtraResult> {
    const sourceClassIds = [...ctx.classMap.keys()];
    const targetClassIds = [...ctx.classMap.values()];
    const issues: RolloverIssue[] = [];

    // 1. The groups, empty, on the copied classes.
    const sourceGroups = await tx.group.findMany({ where: { classId: { in: sourceClassIds } } });
    const haveGroups = await tx.group.findMany({ where: { classId: { in: targetClassIds } } });
    const copy = groupsToCopy(sourceGroups, haveGroups, ctx.classMap);
    if (copy.create.length)
      await tx.group.createMany({
        data: copy.create.map((g) => ({ classId: g.classId, division: g.division, label: g.label })),
        skipDuplicates: true,
      });
    const targetGroups = copy.create.length
      ? await tx.group.findMany({ where: { classId: { in: targetClassIds } } })
      : haveGroups;
    const targetGroupIds = new Map(targetGroups.map((g) => [groupKey(g), g.id] as const));

    // 2. Memberships: only the students promoted into a class, in the group of the same division and label.
    const open = await tx.groupMember.findMany({
      where: { leftOn: null, classId: { in: sourceClassIds } },
      include: { group: { select: { label: true } } },
    });
    const enrolments = new Map(
      (
        await tx.enrollment.findMany({
          where: {
            schoolYearId: ctx.targetYearId,
            leftOn: null,
            studentId: { in: [...new Set(open.map((m) => m.studentId))] },
          },
          select: { studentId: true, classId: true, enrolledOn: true },
        })
      ).map((e) => [e.studentId, { classId: e.classId, enrolledOn: toDay(e.enrolledOn) }] as const),
    );
    // Any membership of the new classes counts, a closed one too: a student a teacher took out of a group
    // of the new year is not put back by a second run.
    const inTarget = new Set(
      (await tx.groupMember.findMany({ where: { classId: { in: targetClassIds } } })).map(
        (m) => `${m.studentId}|${m.classId}|${m.division}`,
      ),
    );
    const members = membershipsToCreate(
      open.map((m) => ({
        studentId: m.studentId,
        classId: m.classId,
        division: m.division,
        label: m.group.label,
      })),
      enrolments,
      ctx.classMap,
      targetGroupIds,
      inTarget,
    );
    if (members.create.length)
      await tx.groupMember.createMany({
        data: members.create.map((m) => ({ ...m, joinedOn: fromDay(m.joinedOn) })),
        skipDuplicates: true,
      });

    // 3. The sessions of groups, with the group of the new class, through the index and the conflict check.
    const slots: Counts = ctx.copyTimetable
      ? await this.copySlots(tx, ctx, { sourceClassIds, targetClassIds, targetGroupIds, issues })
      : { create: 0, existing: 0, skipped: 0 };

    const steps: RolloverStepSummary[] = [
      { id: 'groups', label: 'Groupes des classes', create: copy.create.length, existing: copy.existing, skipped: 0 },
      {
        id: 'group_members',
        label: 'Élèves promus dans leur groupe',
        create: members.create.length,
        existing: members.existing,
        skipped: members.skipped,
      },
      { id: 'group_slots', label: 'Séances par groupe', ...slots },
    ];
    if (steps.some((s) => s.create))
      await audit(tx, [
        {
          actorId: ctx.actor.id,
          action: 'rollover.groups',
          entity: 'school_year',
          entityId: ctx.targetYearId,
          after: {
            groups: copy.create.length,
            members: members.create.length,
            slots: slots.create,
            conflicts: issues.filter((i) => i.level === 'conflict').length,
          },
        },
      ]);
    return { steps, issues };
  }

  private async copySlots(
    tx: Tx,
    ctx: RolloverContext,
    from: {
      sourceClassIds: string[];
      targetClassIds: string[];
      targetGroupIds: ReadonlyMap<string, string>;
      issues: RolloverIssue[];
    },
  ): Promise<Counts> {
    const { issues } = from;
    const sources = await tx.timetableSlot.findMany({
      where: {
        groupId: { not: null },
        classSubject: { classId: { in: from.sourceClassIds } },
        // A series that ended earlier was dropped on purpose: it is not part of the next year.
        validTo: { gte: fromDay(ctx.years.sourceEndsOn) },
      },
      include: {
        group: true,
        room: { select: { active: true } },
        activityType: true,
        classSubject: { include: { subject: true, schoolClass: { select: { label: true } } } },
      },
      orderBy: { id: 'asc' },
    });
    if (!sources.length) return { create: 0, existing: 0, skipped: 0 };

    const classSubjects = new Map(
      (
        await tx.classSubject.findMany({
          where: { classId: { in: from.targetClassIds } },
          select: { id: true, classId: true, subjectId: true },
        })
      ).map((c) => [`${c.classId}|${c.subjectId}`, c.id] as const),
    );
    const assigned = new Set(
      (
        await tx.teachingAssignment.findMany({
          where: { classSubject: { classId: { in: from.targetClassIds } } },
          select: { classSubjectId: true, teacherId: true },
        })
      ).map((a) => `${a.classSubjectId}|${a.teacherId}`),
    );
    const have = new Set(
      (
        await tx.timetableSlot.findMany({
          where: { groupId: { in: [...from.targetGroupIds.values()] } },
        })
      ).map(slotKey),
    );

    let existing = 0;
    let skipped = 0;
    const wanted: NewSlot[] = [];
    for (const s of sources) {
      const group = s.group!;
      const where = `${s.classSubject.subject.name}, ${s.classSubject.schoolClass.label}, ${group.label}, jour ${s.weekday} à ${s.startTime}`;
      const skip = (why: string) => {
        skipped++;
        issues.push({
          step: 'group_slots',
          level: 'warning',
          message: `Séance de groupe non copiée (${where}) : ${why}`,
        });
      };
      const classId = ctx.classMap.get(s.classSubject.classId)!;
      const groupId = from.targetGroupIds.get(groupKey({ classId, division: group.division, label: group.label }));
      const classSubjectId = classSubjects.get(`${classId}|${s.classSubject.subjectId}`);
      if (!groupId) skip('le groupe n’existe pas dans la nouvelle classe.');
      else if (!classSubjectId) skip('la matière n’est pas copiée dans la classe.');
      else if (!assigned.has(`${classSubjectId}|${s.teacherId}`))
        skip('l’enseignant n’est pas affecté à cette matière dans la nouvelle année.');
      else if (s.room && !s.room.active) skip('la salle n’est plus utilisée.');
      else if (
        s.activityType.archivedAt ||
        s.activityType.ownerTeacherId ||
        !s.activityType.repeatable ||
        s.activityType.homework
      )
        skip('le type d’activité n’est plus disponible pour l’emploi du temps.');
      else {
        const data = {
          classSubjectId,
          teacherId: s.teacherId,
          groupId,
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime,
          weekParity: s.weekParity,
        };
        const key = slotKey(data);
        if (have.has(key)) existing++;
        else {
          have.add(key);
          wanted.push({
            ...data,
            id: randomUUID(),
            roomId: s.roomId,
            activityTypeId: s.activityTypeId,
            division: group.division,
            validFrom: fromDay(ctx.years.targetStartsOn),
            validTo: fromDay(ctx.years.targetEndsOn),
            createdById: ctx.actor.id,
          });
        }
      }
    }
    const { placed, clashes } = await placeNewSlots(tx, this.occupancy, wanted);
    for (const c of clashes)
      issues.push({
        step: 'group_slots',
        level: 'conflict',
        message: `Séance de groupe non copiée : ${c.message}`,
      });
    return { create: placed.length, existing, skipped: skipped + clashes.length };
  }
}
