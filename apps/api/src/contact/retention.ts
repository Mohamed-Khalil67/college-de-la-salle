const DAY_MS = 24 * 60 * 60 * 1000;

/** How often the retention clean-up runs. */
export const RETENTION_INTERVAL_MS = DAY_MS;

/**
 * The instant before which handled contact messages are deleted: `days` whole days before `now`.
 * A message handled exactly at the cutoff is kept.
 */
export function retentionCutoff(now: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 1)
    throw new RangeError(`Retention must be a whole number of days ≥ 1, got ${days}.`);
  return new Date(now.getTime() - days * DAY_MS);
}
