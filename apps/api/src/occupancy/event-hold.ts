/** What a one-off event holds of its class in the occupancy index. */
export interface GroupHold {
  readonly divisionKey: string;
  /** The group the event is for. */
  readonly groupId: string;
}

interface TargetRow {
  readonly scope: 'class' | 'group' | 'student';
  readonly groupId: string | null;
  readonly group?: { readonly division: string } | null;
}

/**
 * A timed event addressed to ONE group (« Assigner à ») holds that group's division of its class, so it can
 * run beside the parallel sessions of the class's other groups of the division (a TP B test while TP A has
 * a lesson) and still clashes with its own group's. Anything else (the whole class, no target, a student,
 * several groups: the index holds one group per row, and two groups of a division could otherwise be
 * double-booked unseen) holds the whole class, as before.
 */
export function groupHold(targets: readonly TargetRow[]): GroupHold | null {
  const [only] = targets;
  if (targets.length !== 1 || only!.scope !== 'group' || !only!.group || !only!.groupId) return null;
  return { divisionKey: only!.group.division, groupId: only!.groupId };
}
