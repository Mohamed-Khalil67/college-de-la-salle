import type { RolloverStepId, RolloverStepSummary } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Hook for steps that belong to other modules and run inside the rollover's transaction. The groups of
 * phase 3 (`apps/api/src/groups`) plug in here: copying each class's groups and their members into the
 * new year is not done by the rollover itself.
 *
 * To plug a step in once phase 3 has merged:
 * 1. implement `RolloverExtraStep` in the groups module (id `groups`);
 * 2. replace `GroupsRolloverStep` in `rollover.module.ts` (the provider of `ROLLOVER_EXTRA_STEPS`) with it,
 *    or add it to that array;
 * 3. turn the `it.todo` in `rollover.service.spec.ts` into a test.
 *
 * A step runs after the classes, the class subjects and the students exist in the new year, and before the
 * source year is archived. It must be idempotent (match on natural keys), write only through `tx`, and
 * report what it did; its summary is part of the preview hash.
 */
export interface RolloverContext {
  readonly sourceYearId: string;
  readonly targetYearId: string;
  /** Class of the source year → its class in the new year. */
  readonly classMap: ReadonlyMap<string, string>;
  /** Student → class of the new year they were placed in (promoted, repeating); graduates and leavers are absent. */
  readonly placements: ReadonlyMap<string, string>;
  readonly actor: AuthUser;
}

export type RolloverExtraSummary = Pick<RolloverStepSummary, 'create' | 'existing' | 'skipped'>;

export interface RolloverExtraStep {
  readonly id: RolloverStepId;
  readonly label: string;
  apply(tx: Prisma.TransactionClient, context: RolloverContext): Promise<RolloverExtraSummary>;
}

/** Injection token: the array of extra steps (`RolloverExtraStep[]`). */
export const ROLLOVER_EXTRA_STEPS = Symbol('ROLLOVER_EXTRA_STEPS');

/** Placeholder for phase 3: groups are not copied yet. It does nothing and says so. */
export class GroupsRolloverStep implements RolloverExtraStep {
  readonly id = 'groups' as const;
  readonly label = 'Groupes (phase 3, pas encore copiés)';

  apply(): Promise<RolloverExtraSummary> {
    return Promise.resolve({ create: 0, existing: 0, skipped: 0 });
  }
}
