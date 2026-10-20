const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

export const DURATION = /^(\d+)([smhd])$/;

/** `15m`, `7d`… in seconds. */
export function durationSeconds(value: string): number {
  const match = DURATION.exec(value);
  if (!match) throw new Error(`Invalid duration "${value}" (expected e.g. 15m, 12h, 7d)`);
  return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}
