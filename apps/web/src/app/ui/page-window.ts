/** The pages to show: the first, the last and the current one with its neighbours; null is a gap. */
export function pageWindow(current: number, count: number): (number | null)[] {
  const wanted = [...new Set([1, count, current - 1, current, current + 1])]
    .filter((p) => p >= 1 && p <= count)
    .sort((a, b) => a - b);
  const result: (number | null)[] = [];
  wanted.forEach((p, i) => {
    if (i > 0 && p - wanted[i - 1] > 1) result.push(null);
    result.push(p);
  });
  return result;
}
