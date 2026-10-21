import type { ArchiveOutcome } from '@cdls/shared';
import { audit } from '../common/audit.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface ArchiveTarget {
  readonly id: string;
  readonly userId: string;
  readonly status: string;
}

/**
 * Archives students who graduated or left, inside the caller's transaction: accounts archived (no sign-in),
 * `graduatedOn` set for a graduation, open enrolments closed on `on`, pending section-change requests
 * rejected, refresh tokens revoked, one audit row per student. Shared by `POST /users/archive` and the rollover.
 */
export async function archiveStudentRows(
  tx: Prisma.TransactionClient,
  targets: readonly ArchiveTarget[],
  outcome: ArchiveOutcome,
  onDay: string,
  actorId: string,
  context: Record<string, string> = {},
): Promise<void> {
  if (!targets.length) return;
  const on = new Date(`${onDay}T00:00:00Z`);
  const now = new Date();
  const studentIds = targets.map((s) => s.id);
  const userIds = targets.map((s) => s.userId);
  const note =
    outcome === 'graduated'
      ? 'Demande close : l’élève a obtenu son diplôme.'
      : 'Demande close : l’élève a quitté le collège.';
  await tx.user.updateMany({
    where: { id: { in: userIds } },
    data: { status: 'archived', passwordChangedAt: now },
  });
  await tx.student.updateMany({
    where: { id: { in: studentIds } },
    data: { graduatedOn: outcome === 'graduated' ? on : null },
  });
  await tx.enrollment.updateMany({
    where: { studentId: { in: studentIds }, leftOn: null },
    data: { leftOn: on },
  });
  await tx.sectionChangeRequest.updateMany({
    where: { studentId: { in: studentIds }, status: 'pending' },
    data: { status: 'rejected', decidedById: actorId, decidedAt: now, decisionNote: note },
  });
  await tx.refreshToken.updateMany({
    where: { userId: { in: userIds }, revokedAt: null },
    data: { revokedAt: now },
  });
  await audit(
    tx,
    targets.map((s) => ({
      actorId,
      action: `student.${outcome}`,
      entity: 'student',
      entityId: s.id,
      before: { status: s.status },
      after: { status: 'archived', outcome, on: onDay, ...context },
    })),
  );
}
