import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  ROLLOVER_PREVIEW_STALE,
  type RolloverClassPlan,
  type RolloverIssue,
  type RolloverPreview,
  type RolloverResult,
  type RolloverStepSummary,
  type RolloverStudentAction,
  type RolloverStudentPlan,
} from '@cdls/shared';
import { audit, type AuditEntry } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay } from '../common/dates.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { archiveStudentRows } from '../users/archive-students.js';
import type { RolloverApplyDto, RolloverRequestDto } from './dto/rollover.dto.js';
import {
  buildPlan,
  classKey,
  PlanError,
  planHash,
  type RolloverPlan,
  type RolloverSnapshot,
} from './plan.js';
import { ROLLOVER_EXTRA_STEPS, type RolloverExtraStep } from './rollover-step.js';
import { loadSnapshot } from './snapshot.js';

type Tx = Prisma.TransactionClient;

/** Thrown inside the transaction by a preview, to roll it back and hand the verdict out. */
class DryRun extends Error {
  constructor(readonly run: Run) {
    super('dry run');
  }
}

interface Executed {
  readonly steps: RolloverStepSummary[];
  readonly issues: RolloverIssue[];
  readonly targetYearId: string;
  readonly classIds: ReadonlyMap<string, string>;
  readonly studentCounts: Record<RolloverStudentAction, number>;
  readonly changed: boolean;
}

interface Run {
  readonly snapshot: RolloverSnapshot;
  readonly plan: RolloverPlan;
  readonly executed: Executed;
  readonly hash: string;
}

const ZERO_COUNTS = (): Record<RolloverStudentAction, number> => ({
  promote: 0,
  repeat: 0,
  leave: 0,
  graduate: 0,
  section_change: 0,
});

/**
 * The next-year wizard. `preview` and `apply` run the SAME code: the plan (a pure function of a snapshot of the
 * database) is executed inside one transaction; a preview rolls that transaction back and returns its
 * report, an apply commits it. The report (plus the plan) is hashed: the apply refuses when its hash is not
 * the one the preview handed out, so a preview that no longer matches the data is never applied. Every step
 * matches on natural keys, so running it twice creates nothing twice.
 */
@Injectable()
export class RolloverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
    @Inject(ROLLOVER_EXTRA_STEPS) private readonly extraSteps: readonly RolloverExtraStep[],
  ) {}

  /** What the rollover would create, skip and flag. Writes nothing. */
  async preview(request: RolloverRequestDto, user: AuthUser): Promise<RolloverPreview> {
    try {
      await this.run(request, user, null);
    } catch (error) {
      if (error instanceof DryRun) return this.toPreview(error.run);
      throw error;
    }
    throw new Error('unreachable');
  }

  /** Runs the plan of a preview, in one transaction; 409 when the data changed since the preview. */
  async apply(request: RolloverApplyDto, user: AuthUser): Promise<RolloverResult> {
    const run = await this.occupancy.guard(this.run(request, user, request.planHash));
    return this.toResult(run);
  }

  /* ----------------------------------------------------------------------------------------------- */

  private async run(
    request: RolloverRequestDto,
    user: AuthUser,
    expectedHash: string | null,
  ): Promise<Run> {
    return this.prisma.$transaction(
      async (tx) => {
        // One rollover at a time, and no write into the source year meanwhile: the grade, roll-call, event and
        // timetable writes take a share lock on the year row, the archive below takes this exclusive one.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('rollover', 0))`;
        await tx.$queryRaw`SELECT id FROM school_years WHERE id = ${request.sourceYearId}::uuid FOR UPDATE`;
        const snapshot = await loadSnapshot(tx, request.sourceYearId, request.label);
        let plan: RolloverPlan;
        try {
          plan = buildPlan(snapshot, request);
        } catch (error) {
          if (error instanceof PlanError) throw new BadRequestException(error.message);
          throw error;
        }
        if (snapshot.target?.archived)
          throw new ConflictException(
            `L’année ${snapshot.target.label} est archivée : on ne peut plus y copier une année.`,
          );
        const executed = await this.execute(tx, snapshot, plan, user);
        const hash = planHash(plan, { steps: executed.steps, issues: executed.issues });
        const run: Run = { snapshot, plan, executed, hash };
        if (expectedHash === null) throw new DryRun(run);
        if (hash !== expectedHash)
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            code: ROLLOVER_PREVIEW_STALE,
            message:
              'Les données ont changé depuis l’aperçu : rien n’a été fait. Relancez l’aperçu et vérifiez-le avant de confirmer.',
          });
        return run;
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
  }

  /* Execution --------------------------------------------------------------------------------------- */

  private async execute(
    tx: Tx,
    snapshot: RolloverSnapshot,
    plan: RolloverPlan,
    user: AuthUser,
  ): Promise<Executed> {
    const trail: AuditEntry[] = [];
    const issues: RolloverIssue[] = [...plan.issues];
    const steps: RolloverStepSummary[] = [];
    const count = <T extends { exists: boolean }>(items: readonly T[]) => ({
      create: items.filter((i) => !i.exists).length,
      existing: items.filter((i) => i.exists).length,
    });
    const sections = new Map(
      (await tx.section.findMany()).map((s) => [s.code, s.id] as const),
    );
    const sectionId = (code: string) => sections.get(code)!;

    // The new year.
    let yearId = snapshot.target?.id ?? null;
    if (!yearId) {
      const created = await tx.schoolYear.create({
        data: {
          label: plan.year.label,
          startsOn: fromDay(plan.year.startsOn),
          endsOn: fromDay(plan.year.endsOn),
        },
      });
      yearId = created.id;
      trail.push({
        actorId: user.id,
        action: 'school_year.create',
        entity: 'school_year',
        entityId: yearId,
        after: { label: plan.year.label, startsOn: plan.year.startsOn, endsOn: plan.year.endsOn, rolloverFrom: snapshot.source.label },
      });
    }
    steps.push({
      id: 'year',
      label: 'Nouvelle année scolaire',
      create: snapshot.target ? 0 : 1,
      existing: snapshot.target ? 1 : 0,
      skipped: 0,
    });
    let changed = !snapshot.target;

    // Classes, then the links between them.
    const existingClasses = new Map(
      (await tx.schoolClass.findMany({ where: { schoolYearId: yearId }, include: { section: true } })).map(
        (c) => [classKey(c.section.code, c.code), c] as const,
      ),
    );
    const targetIds = new Map<string, string>();
    for (const c of plan.classes) {
      const found = existingClasses.get(c.key);
      if (found) {
        targetIds.set(c.key, found.id);
        continue;
      }
      const created = await tx.schoolClass.create({
        data: { schoolYearId: yearId, sectionId: sectionId(c.sectionCode), code: c.code, label: c.label },
      });
      targetIds.set(c.key, created.id);
      changed = true;
      trail.push({
        actorId: user.id,
        action: 'class.create',
        entity: 'school_class',
        entityId: created.id,
        after: { schoolYearId: yearId, code: c.code, label: c.label, rolloverFrom: c.sourceId },
      });
    }
    for (const c of plan.classes) {
      if (!c.nextKey) continue;
      const found = existingClasses.get(c.key);
      // A class that already existed keeps the next class the admin gave it.
      if (found && found.nextClassId) continue;
      const nextId = targetIds.get(c.nextKey);
      if (nextId && found?.nextClassId !== nextId)
        await tx.schoolClass.update({ where: { id: targetIds.get(c.key)! }, data: { nextClassId: nextId } });
    }
    steps.push({ id: 'classes', label: 'Classes', ...count(plan.classes), skipped: 0 });
    const classMap = new Map(plan.classes.map((c) => [c.sourceId, targetIds.get(c.key)!]));

    // Periods (same advisory lock as PeriodsService, which owns the overlap checks).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`periods:${yearId}`}, 0))`;
    const newPeriods = plan.periods.filter((p) => !p.exists);
    if (newPeriods.length) {
      await tx.period.createMany({
        data: newPeriods.map((p) => ({
          schoolYearId: yearId,
          kind: p.kind as 'trimester' | 'semester',
          sectionId: p.sectionCode ? sectionId(p.sectionCode) : null,
          number: p.number,
          label: p.label,
          startsOn: fromDay(p.startsOn),
          endsOn: fromDay(p.endsOn),
        })),
      });
      changed = true;
    }
    steps.push({ id: 'periods', label: 'Périodes', ...count(plan.periods), skipped: 0 });

    // Calendar days.
    for (const d of plan.calendarDays.filter((x) => !x.exists)) {
      await tx.calendarDay.create({
        data: {
          schoolYearId: yearId,
          type: d.type as 'holiday' | 'exam_week' | 'no_classes' | 'event_day',
          label: d.label,
          startsOn: fromDay(d.startsOn),
          endsOn: fromDay(d.endsOn),
          sectionId: d.sectionCode ? sectionId(d.sectionCode) : null,
          classes: {
            create: d.classKeys.flatMap((k) => (targetIds.get(k) ? [{ classId: targetIds.get(k)! }] : [])),
          },
        },
      });
      changed = true;
    }
    steps.push({ id: 'calendar_days', label: 'Jours du calendrier', ...count(plan.calendarDays), skipped: 0 });

    // Class subjects.
    const newSubjects = plan.classSubjects.filter((c) => !c.exists);
    if (newSubjects.length) {
      await tx.classSubject.createMany({
        data: newSubjects.map((c) => ({
          classId: targetIds.get(c.classKey)!,
          subjectId: c.subjectId,
          coefficient: c.coefficient,
          hoursPerWeek: c.hoursPerWeek,
        })),
        skipDuplicates: true,
      });
      changed = true;
    }
    steps.push({
      id: 'class_subjects',
      label: 'Matières et coefficients',
      ...count(plan.classSubjects),
      skipped: plan.skipped.classSubjects,
    });
    const classSubjectIds = new Map(
      (
        await tx.classSubject.findMany({
          where: { classId: { in: [...targetIds.values()] } },
          select: { id: true, classId: true, subjectId: true },
        })
      ).map((c) => [`${c.classId}|${c.subjectId}`, c.id] as const),
    );

    // Teaching assignments.
    const newAssignments = plan.assignments.filter((a) => !a.exists);
    if (newAssignments.length) {
      await tx.teachingAssignment.createMany({
        data: newAssignments.map((a) => ({
          teacherId: a.teacherId,
          classSubjectId: classSubjectIds.get(`${targetIds.get(a.classKey)!}|${a.subjectId}`)!,
        })),
        skipDuplicates: true,
      });
      changed = true;
    }
    steps.push({
      id: 'assignments',
      label: 'Affectations des enseignants',
      ...count(plan.assignments),
      skipped: plan.skipped.assignments,
    });

    // Timetable: each slot is placed through the same index and conflict check as a manual one; a clash
    // leaves that slot out and is reported, the others go on.
    let placedSlots = 0;
    let clashingSlots = 0;
    for (const s of plan.slots.filter((x) => !x.exists)) {
      const id = randomUUID();
      await tx.timetableSlot.create({
        data: {
          id,
          classSubjectId: classSubjectIds.get(`${targetIds.get(s.classKey)!}|${s.subjectId}`)!,
          teacherId: s.teacherId,
          roomId: s.roomId,
          activityTypeId: s.activityTypeId,
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime,
          weekParity: s.weekParity,
          division: s.division,
          validFrom: fromDay(plan.year.startsOn),
          validTo: fromDay(plan.year.endsOn),
          createdById: user.id,
        },
      });
      const rows = await this.occupancy.entriesForSlots(tx, [id]);
      const conflicts = await this.occupancy.detect(tx, rows);
      if (conflicts.length) {
        await tx.timetableSlot.delete({ where: { id } });
        clashingSlots++;
        issues.push({
          step: 'timetable',
          level: 'conflict',
          message: `Séance non copiée : ${conflicts[0]!.message}`,
        });
        continue;
      }
      await this.occupancy.insert(tx, rows);
      placedSlots++;
      changed = true;
    }
    steps.push({
      id: 'timetable',
      label: 'Emploi du temps',
      create: placedSlots,
      existing: plan.slots.filter((s) => s.exists).length,
      skipped: plan.skipped.slots + clashingSlots,
    });

    // Students.
    const counts = ZERO_COUNTS();
    const placements = new Map<string, string>();
    const live = plan.students.filter((s) => !s.skipped);
    const enrol = live.filter((s) => s.targetKey);
    if (enrol.length) {
      await tx.enrollment.createMany({
        data: enrol.map((s) => ({
          studentId: s.studentId,
          classId: targetIds.get(s.targetKey!)!,
          schoolYearId: yearId,
          enrolledOn: fromDay(plan.year.startsOn),
        })),
        skipDuplicates: true,
      });
      for (const s of enrol) placements.set(s.studentId, targetIds.get(s.targetKey!)!);
      changed = true;
    }
    const names = new Map(snapshot.students.map((s) => [s.studentId, s] as const));
    const labelOf = (key: string) => snapshot.classes.find((c) => classKey(c.sectionCode, c.code) === key)?.label ?? key;
    for (const s of live) {
      counts[s.action]++;
      if (s.action === 'leave' || s.action === 'graduate') continue;
      trail.push({
        actorId: user.id,
        action: `student.${s.action === 'repeat' ? 'repeat' : 'promote'}`,
        entity: 'student',
        entityId: s.studentId,
        after: {
          from: labelOf(s.sourceClassKey),
          to: labelOf(s.targetKey!),
          schoolYear: plan.year.label,
        },
      });
    }
    // Section changes: promoted in their own section, and a request waits for the admin's decision.
    const asking = live.filter((s) => s.action === 'section_change');
    if (asking.length) {
      const pending = new Set(
        (
          await tx.sectionChangeRequest.findMany({
            where: { studentId: { in: asking.map((s) => s.studentId) }, status: 'pending' },
            select: { studentId: true },
          })
        ).map((r) => r.studentId),
      );
      for (const s of asking) {
        if (pending.has(s.studentId)) continue;
        const from = names.get(s.studentId)!.sectionCode;
        const to = from === 'bac' ? 'nationale' : 'bac';
        const request = await tx.sectionChangeRequest.create({
          data: {
            studentId: s.studentId,
            fromSectionId: sectionId(from),
            toSectionId: sectionId(to),
            reason: `Demande saisie au passage à l’année ${plan.year.label}.`,
            requestedById: user.id,
          },
        });
        trail.push({
          actorId: user.id,
          action: 'section_change.create',
          entity: 'section_change_request',
          entityId: request.id,
          after: { studentId: s.studentId, fromSectionId: sectionId(from), toSectionId: sectionId(to), byStudent: false, rollover: plan.year.label },
        });
      }
    }
    for (const outcome of ['graduate', 'leave'] as const) {
      const ids = live.filter((s) => s.action === outcome).map((s) => s.studentId);
      if (!ids.length) continue;
      const rows = await tx.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, user: { select: { status: true } } },
      });
      await archiveStudentRows(
        tx,
        rows.map((r) => ({ id: r.id, userId: r.userId, status: r.user.status })),
        outcome === 'graduate' ? 'graduated' : 'left',
        plan.leavesOn,
        user.id,
        { rollover: plan.year.label },
      );
      changed = true;
    }
    steps.push({
      id: 'students',
      label: 'Élèves',
      create: live.length,
      existing: plan.students.length - live.length,
      skipped: 0,
    });

    // Steps owned by other modules (groups, once phase 3 is merged).
    for (const extra of this.extraSteps) {
      const done = await extra.apply(tx, {
        sourceYearId: snapshot.source.id,
        targetYearId: yearId,
        classMap,
        placements,
        actor: user,
      });
      steps.push({ id: extra.id, label: extra.label, ...done });
      if (done.create) changed = true;
    }

    // The old year becomes read-only; the new one takes its place as the current year.
    const wasArchived = snapshot.source.archived;
    if (plan.archiveSource && !wasArchived) {
      await tx.schoolYear.update({
        where: { id: snapshot.source.id },
        data: { archivedAt: new Date(), isCurrent: false },
      });
      trail.push({
        actorId: user.id,
        action: 'school_year.archive',
        entity: 'school_year',
        entityId: snapshot.source.id,
        before: { archived: false, isCurrent: snapshot.source.isCurrent },
        after: { archived: true, nextYear: plan.year.label },
      });
      changed = true;
    }
    if (plan.makeCurrent && !(snapshot.target?.isCurrent ?? false)) {
      await tx.schoolYear.updateMany({
        where: { isCurrent: true, NOT: { id: yearId } },
        data: { isCurrent: false },
      });
      await tx.schoolYear.update({ where: { id: yearId }, data: { isCurrent: true } });
      trail.push({
        actorId: user.id,
        action: 'school_year.make_current',
        entity: 'school_year',
        entityId: yearId,
      });
      changed = true;
    }
    steps.push({
      id: 'archive',
      label: 'Archivage de l’ancienne année',
      create: plan.archiveSource && !wasArchived ? 1 : 0,
      existing: wasArchived ? 1 : 0,
      skipped: 0,
    });

    trail.push({
      actorId: user.id,
      action: 'rollover.apply',
      entity: 'school_year',
      entityId: yearId,
      after: {
        from: snapshot.source.label,
        to: plan.year.label,
        steps: steps.map((s) => ({ id: s.id, create: s.create, existing: s.existing, skipped: s.skipped })),
        students: counts,
        conflicts: issues.filter((i) => i.level === 'conflict').length,
        copyAssignments: plan.assignments.length > 0,
        copyTimetable: plan.slots.length > 0,
      },
    });
    await audit(tx, trail);
    return { steps, issues, targetYearId: yearId, classIds: targetIds, studentCounts: counts, changed };
  }

  /* Responses --------------------------------------------------------------------------------------- */

  private classes(run: Run, withIds: boolean): RolloverClassPlan[] {
    const { snapshot, plan, executed } = run;
    const label = new Map(plan.classes.map((c) => [c.key, c.label]));
    const sizes = new Map<string, number>();
    for (const s of snapshot.students) sizes.set(s.classKey, (sizes.get(s.classKey) ?? 0) + 1);
    return plan.classes.map((c) => ({
      sourceClassId: c.sourceId,
      sectionCode: c.sectionCode,
      code: c.code,
      label: c.label,
      nextLabel: c.nextKey ? (label.get(c.nextKey) ?? null) : null,
      studentCount: sizes.get(c.key) ?? 0,
      action: c.exists ? 'exists' : 'create',
      targetClassId: withIds ? (executed.classIds.get(c.key) ?? null) : null,
    }));
  }

  private toPreview(run: Run): RolloverPreview {
    const { snapshot, plan, executed } = run;
    const info = new Map(snapshot.students.map((s) => [s.studentId, s] as const));
    const label = new Map(plan.classes.map((c) => [c.key, c.label]));
    const students: RolloverStudentPlan[] = plan.students.map((p) => {
      const s = info.get(p.studentId)!;
      return {
        studentId: p.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        studentNumber: s.studentNumber,
        sectionCode: s.sectionCode,
        sourceClassId: plan.classes.find((c) => c.key === p.sourceClassKey)!.sourceId,
        sourceClassLabel: label.get(p.sourceClassKey) ?? p.sourceClassKey,
        defaultAction: p.defaultAction,
        action: p.action,
        targetClassLabel: p.targetKey ? (label.get(p.targetKey) ?? null) : null,
        skipped: p.skipped,
      };
    });
    return {
      planHash: run.hash,
      sourceYear: { id: snapshot.source.id, label: snapshot.source.label, archived: snapshot.source.archived },
      newYear: { ...plan.year },
      steps: executed.steps,
      issues: executed.issues,
      classes: this.classes(run, false),
      students,
      archivesSourceYear: plan.archiveSource && !snapshot.source.archived,
      makesNewYearCurrent: plan.makeCurrent,
    };
  }

  private toResult(run: Run): RolloverResult {
    const { plan, executed } = run;
    return {
      schoolYearId: executed.targetYearId,
      schoolYearLabel: plan.year.label,
      steps: executed.steps,
      issues: executed.issues,
      classes: this.classes(run, true),
      studentCounts: executed.studentCounts,
      nothingToDo: !executed.changed,
    };
  }
}
