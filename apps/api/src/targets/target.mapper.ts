import type { AssessmentTargetDto, TargetEntry } from '@cdls/shared';

/** The stored rows of a target, with the group when it is a group row. */
export interface TargetRow {
  readonly scope: 'class' | 'group' | 'student';
  readonly groupId: string | null;
  readonly studentId: string | null;
  readonly group?: { readonly id: string; readonly division: string; readonly label: string } | null;
}

/** The rows as the shared helper reads them. */
export function toEntries(rows: readonly TargetRow[]): TargetEntry[] {
  return rows.map((r) => ({ scope: r.scope, groupId: r.groupId, studentId: r.studentId }));
}

/** The API shape of a target. `concerned` is filled in later by `TargetsService.annotate`. */
export function toTargetDto(rows: readonly TargetRow[]): AssessmentTargetDto {
  const groups = rows
    .filter((r) => r.scope === 'group' && r.group)
    .map((r) => ({ id: r.group!.id, division: r.group!.division, label: r.group!.label }))
    .sort((a, b) => a.division.localeCompare(b.division, 'fr') || a.label.localeCompare(b.label, 'fr'));
  const studentIds = rows.flatMap((r) => (r.scope === 'student' && r.studentId ? [r.studentId] : []));
  return {
    whole: !groups.length && !studentIds.length,
    groups,
    studentIds,
    concerned: null,
  };
}
