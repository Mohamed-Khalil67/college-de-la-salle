import type { ReportGapReason } from '@cdls/shared';

/**
 * What is missing before the report cards of a period can be made, decided from counts alone (no
 * database, no Nest). One subject of one class is ready when it has marks, every student the work
 * concerns has one and every mark is published; the first rule that fails names the gap.
 */

/** One gradable event of the period, for one class and subject. */
export interface GapEvent {
  readonly subjectId: string;
  /** Students the work concerns when the whole class does (no target rows); null when it targets some. */
  readonly concerned: number | null;
  /** Marks entered. */
  readonly graded: number;
  /** Marks the students can already see. */
  readonly published: number;
}

export interface Gap {
  readonly subjectId: string;
  readonly reason: ReportGapReason;
  readonly entered: number;
  readonly total: number;
}

/**
 * The gap of one subject, or null when it is ready. Marks above the number of students concerned (a student who
 * left) count as many as there are.
 */
export function subjectGap(
  subjectId: string,
  events: readonly GapEvent[],
): Gap | null {
  const mine = events.filter((e) => e.subjectId === subjectId);
  if (!mine.some((e) => e.graded > 0)) return { subjectId, reason: 'no_grades', entered: 0, total: 0 };

  let entered = 0;
  let total = 0;
  let unfinished = false;
  for (const e of mine) {
    // An event with no mark at all is unfinished; its expected total is the class when it concerns the whole
    // class, and unknown (0) when it is aimed at some students.
    if (e.graded === 0) {
      unfinished = true;
      total += e.concerned ?? 0;
      continue;
    }
    const expected = e.concerned ?? e.graded;
    const got = Math.min(e.graded, expected);
    if (got < expected) {
      unfinished = true;
      entered += got;
      total += expected;
    }
  }
  if (unfinished) return { subjectId, reason: 'incomplete', entered, total };

  const hidden = mine.reduce((sum, e) => sum + (e.graded - e.published), 0);
  if (hidden > 0) {
    return { subjectId, reason: 'unpublished', entered: 0, total: 0 };
  }
  return null;
}

/** The gaps of a class, in the order of its subjects. */
export function classGaps(
  subjectIds: readonly string[],
  events: readonly GapEvent[],
): Gap[] {
  return subjectIds.flatMap((id) => subjectGap(id, events) ?? []);
}
