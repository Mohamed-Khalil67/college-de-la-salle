import type { GroupWithMembersDto, StudentSummaryDto } from '@cdls/shared';

/**
 * Pure logic of the groups screens (« Assigner à » is in `shared/utils/targets.ts`). No Angular here, so Vitest tests it directly.
 */

/* ------------------------------------------------------------------------------------------------
 * Groups by division
 * ---------------------------------------------------------------------------------------------- */

export interface DivisionBlock {
  readonly division: string;
  readonly groups: readonly GroupWithMembersDto[];
  /** Students of the class who are in no group of this division. */
  readonly withoutGroup: readonly StudentSummaryDto[];
}

/** The groups of a class, one block per division, with the students who are in none of them. */
export function divisionBlocks(
  groups: readonly GroupWithMembersDto[],
  roster: readonly StudentSummaryDto[],
): DivisionBlock[] {
  const divisions = [...new Set(groups.map((g) => g.division))].sort((a, b) => a.localeCompare(b, 'fr'));
  return divisions.map((division) => {
    const inDivision = groups
      .filter((g) => g.division === division)
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    const taken = new Set(inDivision.flatMap((g) => g.memberIds));
    return { division, groups: inDivision, withoutGroup: roster.filter((s) => !taken.has(s.id)) };
  });
}

export interface Candidate {
  readonly student: StudentSummaryDto;
  /** The other group of the division the student is in, or null. */
  readonly elsewhere: GroupWithMembersDto | null;
}

/** For the « Gérer les élèves » dialog: who is in the group, who is not (and where they are instead). */
export function memberLists(
  group: GroupWithMembersDto,
  groups: readonly GroupWithMembersDto[],
  roster: readonly StudentSummaryDto[],
): { readonly members: readonly StudentSummaryDto[]; readonly others: readonly Candidate[] } {
  const inGroup = new Set(group.memberIds);
  const siblings = groups.filter((g) => g.division === group.division && g.id !== group.id);
  return {
    members: roster.filter((s) => inGroup.has(s.id)),
    others: roster
      .filter((s) => !inGroup.has(s.id))
      .map((student) => ({ student, elsewhere: siblings.find((g) => g.memberIds.includes(student.id)) ?? null })),
  };
}
