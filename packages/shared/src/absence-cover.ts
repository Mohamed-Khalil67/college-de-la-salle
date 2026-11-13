/**
 * Who covers which lesson when one absent teacher has several lessons to look after (« Professeur absent »).
 * Each lesson comes with the teachers free at its time, but those lists are computed one lesson at a time: the
 * same teacher can be free for two lessons that overlap, and cannot take both. These rules keep the picks
 * consistent: a teacher held by a lesson is never offered for another lesson at the same time.
 * Decorator-free, with a spec next to it.
 */
import { minutesOf } from './timetable.js';

/** A free teacher as the preview lists them. */
export interface CoverCandidate {
  readonly teacherId: string;
  /** Teaches the lesson's subject: proposed first. */
  readonly sameSubject: boolean;
}

/** One lesson to look after, with the teachers free at its time. */
export interface CoverLesson {
  /** Unique per lesson (`slotId@date`). */
  readonly key: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly free: readonly CoverCandidate[];
}

/** The planner's pick for a lesson: a covering teacher or a supervisor, who may be missing yet. */
export interface CoverPick {
  readonly kind: 'substitute' | 'study';
  /** '' while nobody is picked. */
  readonly teacherId: string;
}

/** A teacher replaced by the reconciliation, with why: not free any more, or taken by an earlier lesson. */
export interface CoverReplacement {
  readonly key: string;
  readonly was: string;
  /** The new proposal; '' when nobody can be proposed. */
  readonly now: string;
  readonly reason: 'busy' | 'taken';
}

type Span = Pick<CoverLesson, 'date' | 'startTime' | 'endTime'>;

/** Do two lessons share some minutes of one day? Lessons that only touch (one ends when the other starts) do not. */
export function lessonsOverlap(a: Span, b: Span): boolean {
  return (
    a.date === b.date &&
    minutesOf(a.startTime) < minutesOf(b.endTime) &&
    minutesOf(b.startTime) < minutesOf(a.endTime)
  );
}

const inOrder = (a: CoverLesson, b: CoverLesson) =>
  a.date.localeCompare(b.date) ||
  a.startTime.localeCompare(b.startTime) ||
  a.key.localeCompare(b.key);

/** The teachers held by the other lessons that overlap this one, given who is picked on each. */
export function heldAround(
  lesson: CoverLesson,
  lessons: readonly CoverLesson[],
  picked: Readonly<Record<string, string>>,
): Set<string> {
  const held = new Set<string>();
  for (const other of lessons) {
    const id = picked[other.key];
    if (other.key !== lesson.key && id && lessonsOverlap(lesson, other)) held.add(id);
  }
  return held;
}

/** The teachers that can still be offered for this lesson: free at its time and not held by an overlapping one. */
export function offerable(
  lesson: CoverLesson,
  lessons: readonly CoverLesson[],
  picked: Readonly<Record<string, string>>,
): CoverCandidate[] {
  const held = heldAround(lesson, lessons, picked);
  return lesson.free.filter((t) => !held.has(t.teacherId));
}

/** The proposal for a lesson: an offerable teacher of its subject, else nobody (''). */
export function proposeCover(
  lesson: CoverLesson,
  lessons: readonly CoverLesson[],
  picked: Readonly<Record<string, string>>,
): string {
  return offerable(lesson, lessons, picked).find((t) => t.sameSubject)?.teacherId ?? '';
}

/**
 * Makes the picks consistent with the lessons as they are now, in day and time order. A picked teacher stays
 * when still free and not held by an earlier overlapping lesson; otherwise the lesson loses it, and a
 * « Remplacer » lesson gets a new proposal (a supervisor is never proposed on its own). A « Remplacer » lesson
 * with nobody yet gets its proposal. Run it after a lookup and after the lists changed behind the planner's
 * back (a refused save).
 */
export function reconcileCovers(
  lessons: readonly CoverLesson[],
  picks: Readonly<Record<string, CoverPick>>,
): { readonly teachers: Readonly<Record<string, string>>; readonly replaced: CoverReplacement[] } {
  const teachers: Record<string, string> = {};
  const replaced: CoverReplacement[] = [];
  for (const lesson of [...lessons].sort(inOrder)) {
    const pick = picks[lesson.key];
    if (!pick) continue;
    const held = heldAround(lesson, lessons, teachers);
    const free = lesson.free.some((t) => t.teacherId === pick.teacherId);
    if (pick.teacherId && free && !held.has(pick.teacherId)) {
      teachers[lesson.key] = pick.teacherId;
      continue;
    }
    const now = pick.kind === 'substitute' ? proposeCover(lesson, lessons, teachers) : '';
    teachers[lesson.key] = now;
    if (pick.teacherId)
      replaced.push({ key: lesson.key, was: pick.teacherId, now, reason: free ? 'taken' : 'busy' });
  }
  return { teachers, replaced };
}
