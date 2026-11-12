/**
 * Pure rules of the planner's page: how complete a class's timetable is, and when a free room is taken again.
 * Decorator-free: the API computes with it and the web shows it.
 */
import type { PlannerClassCoverageDto, PlannerMissingSubjectDto } from './api.js';

/** One subject of a class: the hours per week it should have and the hours placed (null: not set). */
export interface SubjectHours {
  readonly subjectName: string;
  readonly expected: number | null;
  readonly placed: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A class is complete when every subject with hours per week has at least those hours placed. A subject
 * without hours set asks for nothing (the school did not say), so it never makes a class incomplete.
 */
export function classCoverage(
  classId: string,
  label: string,
  subjects: readonly SubjectHours[],
): PlannerClassCoverageDto {
  const missing: PlannerMissingSubjectDto[] = [];
  let expectedHours = 0;
  let placedHours = 0;
  for (const s of subjects) {
    placedHours += s.placed;
    if (s.expected === null || s.expected <= 0) continue;
    expectedHours += s.expected;
    const gap = round(s.expected - s.placed);
    if (gap > 0) missing.push({ subjectName: s.subjectName, missingHours: gap });
  }
  missing.sort(
    (a, b) => b.missingHours - a.missingHours || a.subjectName.localeCompare(b.subjectName, 'fr'),
  );
  return {
    classId,
    label,
    expectedHours: round(expectedHours),
    placedHours: round(placedHours),
    missing,
    complete: missing.length === 0,
  };
}

/** `HH:MM` of the next time a room is taken today, given its busy starts and now; null when nothing follows. */
export function freeUntil(busyStarts: readonly string[], now: string): string | null {
  const next = busyStarts.filter((s) => s > now).sort();
  return next[0] ?? null;
}
