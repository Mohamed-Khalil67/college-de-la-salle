/**
 * The pure rules of the groups step of the rollover (`groups-rollover-step.ts` reads the database and writes
 * what these return). The contract is the « Group contract for the rollover » of docs/school-year-design.md.
 */

export interface GroupKeyed {
  readonly classId: string;
  readonly division: string;
  readonly label: string;
}

export const groupKey = (g: GroupKeyed) => `${g.classId}|${g.division}|${g.label}`;

export interface MissingGroup extends GroupKeyed {
  readonly sourceGroupId: string;
}

/**
 * The groups of the source classes that the copied classes do not have yet (matched on class, division and
 * label, so a second run finds nothing to create). `classMap` is source class → class of the new year.
 */
export function groupsToCopy(
  sourceGroups: readonly (GroupKeyed & { readonly id: string })[],
  targetGroups: readonly GroupKeyed[],
  classMap: ReadonlyMap<string, string>,
): { readonly create: MissingGroup[]; readonly existing: number } {
  const have = new Set(targetGroups.map(groupKey));
  const create: MissingGroup[] = [];
  let existing = 0;
  for (const g of sourceGroups) {
    const classId = classMap.get(g.classId);
    if (!classId) continue;
    const key = groupKey({ classId, division: g.division, label: g.label });
    if (have.has(key)) existing++;
    else {
      have.add(key);
      create.push({ classId, division: g.division, label: g.label, sourceGroupId: g.id });
    }
  }
  return { create, existing };
}

export interface OpenMembership {
  readonly studentId: string;
  /** The class (of the source year) and the group the student is in. */
  readonly classId: string;
  readonly division: string;
  readonly label: string;
}

export interface NewEnrolment {
  readonly classId: string;
  /** The day the enrolment began: the new membership starts then. */
  readonly enrolledOn: string;
}

export interface NewMembership {
  readonly groupId: string;
  readonly studentId: string;
  readonly classId: string;
  readonly division: string;
  readonly joinedOn: string;
}

export interface MembershipPlan {
  readonly create: NewMembership[];
  /** The student is already in a group of that division of the new class (a previous run, or the teachers). */
  readonly existing: number;
  /** Not copied: a repeating student, or a group of that name that the new class does not have. */
  readonly skipped: number;
}

/**
 * Memberships of the new year: only for students PROMOTED into a class (their new class is not the copy of
 * the one they were in), in the group of the same division and label that the new class has, and one open
 * membership per student, class and division. A student who repeats the year, who graduated or left gets none:
 * the teachers refill the groups.
 */
export function membershipsToCreate(
  memberships: readonly OpenMembership[],
  enrolments: ReadonlyMap<string, NewEnrolment>,
  classMap: ReadonlyMap<string, string>,
  targetGroupIds: ReadonlyMap<string, string>,
  openInTarget: ReadonlySet<string>,
): MembershipPlan {
  const create: NewMembership[] = [];
  let existing = 0;
  let skipped = 0;
  const taken = new Set(openInTarget);
  for (const m of memberships) {
    const enrolment = enrolments.get(m.studentId);
    if (!enrolment) continue; // graduated or left: nothing in the new year
    if (enrolment.classId === classMap.get(m.classId)) {
      skipped++; // repeats the year
      continue;
    }
    const groupId = targetGroupIds.get(groupKey({ classId: enrolment.classId, division: m.division, label: m.label }));
    if (!groupId) {
      skipped++;
      continue;
    }
    const slot = `${m.studentId}|${enrolment.classId}|${m.division}`;
    if (taken.has(slot)) {
      existing++;
      continue;
    }
    taken.add(slot);
    create.push({
      groupId,
      studentId: m.studentId,
      classId: enrolment.classId,
      division: m.division,
      joinedOn: enrolment.enrolledOn,
    });
  }
  return { create, existing, skipped };
}
