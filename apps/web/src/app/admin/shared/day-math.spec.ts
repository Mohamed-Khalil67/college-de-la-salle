import { describe, expect, it } from 'vitest';
import {
  addDays,
  barGeometry,
  daysBetween,
  formatTypedDate,
  isIsoDay,
  monthTicks,
  parseTypedDate,
  rangeLength,
  rangesOverlap,
  typedDateProblem,
} from './day-math';

describe('isIsoDay', () => {
  it('accepts real days only', () => {
    expect(isIsoDay('2026-09-01')).toBe(true);
    expect(isIsoDay('2028-02-29')).toBe(true);
    expect(isIsoDay('2026-02-29')).toBe(false);
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('01/09/2026')).toBe(false);
  });
});

describe('day arithmetic', () => {
  it('counts and adds days across month and year ends', () => {
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(29);
    expect(rangeLength('2026-09-01', '2026-09-01')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('treats range bounds as included', () => {
    expect(rangesOverlap('2026-09-01', '2026-12-20', '2026-12-20', '2027-03-01')).toBe(true);
    expect(rangesOverlap('2026-09-01', '2026-12-19', '2026-12-20', '2027-03-01')).toBe(false);
  });
});

describe('parseTypedDate', () => {
  it('reads the French formats people type', () => {
    expect(parseTypedDate('12/09/2026')).toBe('2026-09-12');
    expect(parseTypedDate(' 2-9-2026 ')).toBe('2026-09-02');
    expect(parseTypedDate('12.09.2026')).toBe('2026-09-12');
    expect(parseTypedDate('2026-09-12')).toBe('2026-09-12');
  });

  it('refuses what is not a real date', () => {
    expect(parseTypedDate('31/02/2026')).toBeNull();
    expect(parseTypedDate('12/09/26')).toBeNull();
    expect(parseTypedDate('demain')).toBeNull();
    expect(parseTypedDate('')).toBeNull();
  });
});

describe('formatTypedDate and typedDateProblem', () => {
  it('round-trips', () => {
    expect(formatTypedDate('2026-09-02')).toBe('02/09/2026');
    expect(parseTypedDate(formatTypedDate('2027-01-31'))).toBe('2027-01-31');
  });

  it('explains the problem in French', () => {
    expect(typedDateProblem('')).toContain('JJ/MM/AAAA');
    expect(typedDateProblem('31/02/2026')).toContain('n’existe pas');
    expect(typedDateProblem('01/09/2026')).toBeNull();
  });
});

describe('timeline geometry', () => {
  it('lists the months of a school year and covers the whole width', () => {
    const ticks = monthTicks('2026-09-01', '2027-06-30');
    expect(ticks).toHaveLength(10);
    expect(ticks[0].long).toBe('septembre 2026');
    expect(ticks[0].left).toBe(0);
    const last = ticks[ticks.length - 1];
    expect(last.left + last.width).toBeCloseTo(100, 5);
  });

  it('starts a partial first month at the year start', () => {
    const ticks = monthTicks('2026-09-15', '2026-11-10');
    expect(ticks[0].left).toBe(0);
    expect(ticks[0].width).toBeCloseTo((16 / 57) * 100, 5);
  });

  it('positions and clips a bar', () => {
    const half = barGeometry('2026-09-01', '2026-09-10', '2026-09-01', '2026-09-20');
    expect(half.left).toBe(0);
    expect(half.width).toBe(50);
    const clipped = barGeometry('2026-08-01', '2026-12-31', '2026-09-01', '2026-09-20');
    expect(clipped).toEqual({ left: 0, width: 100 });
    expect(barGeometry('2027-01-01', '2027-01-02', '2026-09-01', '2026-09-20').width).toBe(0);
  });
});
