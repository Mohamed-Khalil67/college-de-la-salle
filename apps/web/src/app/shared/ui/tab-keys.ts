/** Index of the tab a key press moves to (ARIA tabs pattern), or null when the key does not move. */
export function tabTarget(key: string, index: number, count: number): number | null {
  const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: count - 1 };
  const target = moves[key];
  return target === undefined ? null : (target + count) % count;
}
