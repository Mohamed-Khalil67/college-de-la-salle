/**
 * Pure rules of the planner's page: how complete a class's timetable is, and when a free room is taken again.
 * Decorator-free: the API computes with it and the web shows it.
 */
import type { PlannerClassCoverageDto, PlannerMissingSubjectDto } from './api.js';

/**
 * The day an exception takes effect on: a moved session lives on the day it moved to, every other kind on
 * the session's own day. A day's list of changes keeps a session only there, so a moved one is never listed
 * under both its old and its new day (the week views keep the trace of the old one).
 */
export function changeDay(ex: { readonly date: string; readonly newDate: string | null }): string {
  return ex.newDate ?? ex.date;
}

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

/**
 * The one-minute window to ask the occupancy index about « right now »: from `time` to the next minute. At 23:59
 * there is no next minute that day, and an empty window overlaps nothing (every room would read as free), so the
 * minute before is used.
 */
export function probeWindow(time: string): { start: string; end: string } {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const at = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  const minutes = h * 60 + m;
  return minutes >= 23 * 60 + 59
    ? { start: at(23 * 60 + 58), end: at(23 * 60 + 59) }
    : { start: at(minutes), end: at(minutes + 1) };
}

/** `HH:MM` of the next time a room is taken today, given its busy starts and now; null when nothing follows. */
export function freeUntil(busyStarts: readonly string[], now: string): string | null {
  const next = busyStarts.filter((s) => s > now).sort();
  return next[0] ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * « Ajouter un examen »
 * ---------------------------------------------------------------------------------------------- */

/**
 * The activity types a planner or an admin may set for ANY class (the system types « Examen » and « Contrôle »).
 * Every other event stays with the teachers of the class: `POST /events` refuses a planner who does not teach it.
 */
export const EXAM_ACTIVITY_CODES = ['examen', 'controle'] as const;
export type ExamActivityCode = (typeof EXAM_ACTIVITY_CODES)[number];

export function isExamActivityCode(code: string): code is ExamActivityCode {
  return (EXAM_ACTIVITY_CODES as readonly string[]).includes(code);
}

/** « Examen de Mathématiques »: the title the form proposes (the person may change it). */
export function examTitle(typeLabel: string, subjectName: string): string {
  return subjectName ? `${typeLabel} de ${subjectName}` : typeLabel;
}

/**
 * A soft note when the class already has as many assessments that day as the school allows (`maxPerDay`, the
 * timetable's « Trop d’évaluations le même jour » rule). It informs, it never blocks: the planner decides.
 * `already` counts the class's assessments of the day before this one.
 */
export function assessmentLoadNote(
  already: number,
  maxPerDay: number,
  className: string,
): string | null {
  if (already < maxPerDay) return null;
  return `${className} a déjà ${already} évaluation${already > 1 ? 's' : ''} ce jour-là : en ajoutant celle-ci, la classe dépasse ${maxPerDay} par jour.`;
}
