import type { RolloverIssue, RolloverStepSummary } from '@cdls/shared';
import type { AuthUser } from '../common/auth-user.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Hook for steps that belong to other modules and run inside the rollover's transaction. The groups of
 * phase 3 plug in here (`groups-rollover-step.ts`): copying each class's groups, the memberships of the
 * promoted students and the sessions of the groups into the new year is not done by the rollover itself.
 *
 * A step runs after the classes, the class subjects, the timetable and the students exist in the new year,
 * and before the source year is archived. It must be idempotent (match on natural keys), write only through
 * `tx`, and report what it did (preview and apply run the same code; the report is part of the preview hash).
 */
export interface RolloverContext {
  readonly sourceYearId: string;
  readonly targetYearId: string;
  /** Class of the source year → its class in the new year. */
  readonly classMap: ReadonlyMap<string, string>;
  /** Student → class of the new year they were placed in by THIS run (promoted, repeating); graduates and leavers are absent. */
  readonly placements: ReadonlyMap<string, string>;
  readonly actor: AuthUser;
  /** The weekly timetable is copied (the sessions of groups follow). */
  readonly copyTimetable: boolean;
  readonly years: {
    readonly sourceEndsOn: string;
    readonly targetStartsOn: string;
    readonly targetEndsOn: string;
  };
}

export interface RolloverExtraResult {
  /** One line per kind of thing the step copied (create / existing / skipped). */
  readonly steps: readonly RolloverStepSummary[];
  readonly issues?: readonly RolloverIssue[];
}

export interface RolloverExtraStep {
  apply(tx: Prisma.TransactionClient, context: RolloverContext): Promise<RolloverExtraResult>;
}

/** Injection token: the array of extra steps (`RolloverExtraStep[]`). */
export const ROLLOVER_EXTRA_STEPS = Symbol('ROLLOVER_EXTRA_STEPS');
