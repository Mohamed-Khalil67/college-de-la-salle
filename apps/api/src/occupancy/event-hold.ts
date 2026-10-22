/** What a one-off event holds of its class in the occupancy index. */
export interface GroupHold {
  readonly divisionKey: string;
  /** The group, when the event is for exactly one; null for several groups of the same division. */
  readonly groupId: string | null;
}

interface TargetRow {
  readonly scope: 'class' | 'group' | 'student';
  readonly groupId: string | null;
  readonly group?: { readonly division: string } | null;
}

/**
 * A timed event addressed to groups only (« Assigner à »), all of one division, holds that division of its
 * class, so it can run beside the parallel sessions of the class's other groups of the division (a TP B
 * test while TP A has a lesson). Anything else (the whole class, no target, a student, groups of several
 * divisions) holds the whole class, as before.
 */
export function groupHold(targets: readonly TargetRow[]): GroupHold | null {
  if (!targets.length || targets.some((t) => t.scope !== 'group' || !t.group)) return null;
  const divisions = new Set(targets.map((t) => t.group!.division));
  if (divisions.size !== 1) return null;
  const groupIds = [...new Set(targets.map((t) => t.groupId))];
  return { divisionKey: [...divisions][0]!, groupId: groupIds.length === 1 ? groupIds[0]! : null };
}
