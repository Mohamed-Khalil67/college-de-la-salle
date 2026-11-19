/**
 * The one place the API asks « what time is it? » for the school's calendar (`schoolToday()` and
 * `schoolTimeNow()` in `dates.ts` read it). Production uses the real clock. A test pins it with `pinClock`,
 * so a spec never depends on the day it runs: the seed holds one school year with a winter holiday, and
 * « today » must stay inside it.
 *
 * Only the school's calendar reads this clock. Token lifetimes, `createdAt`/`readAt` stamps and cut-offs
 * measured in hours stay on the real time (they are compared with the database's own timestamps).
 */
export type TimeSource = () => Date;

const realTime: TimeSource = () => new Date();
let source: TimeSource = realTime;

/** The current instant: the real one unless a test pinned the clock. */
export function currentTime(): Date {
  return source();
}

/** Back to the real clock. */
export function unpinClock(): void {
  source = realTime;
}

/**
 * Pins the clock to a fixed instant (a Date or an ISO string) and returns a function that restores the real
 * one. Refused in production: a pinned clock there would freeze the school's calendar.
 */
export function pinClock(at: Date | string): () => void {
  if (process.env['NODE_ENV'] === 'production')
    throw new Error('The clock cannot be pinned in production.');
  const fixed = new Date(at);
  if (Number.isNaN(fixed.getTime())) throw new Error(`Invalid clock date: ${String(at)}`);
  source = () => new Date(fixed.getTime());
  return unpinClock;
}
