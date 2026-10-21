import { describe, expect, it } from 'vitest';
import { nextYearLabel, shiftRange, shiftYear } from './rollover.js';

describe('shiftYear', () => {
  it('moves a day one year on', () => {
    expect(shiftYear('2026-09-06')).toBe('2027-09-06');
    expect(shiftYear('2026-12-31')).toBe('2027-12-31');
  });

  it('moves 29 February to 28 February when the year after is not a leap year', () => {
    expect(shiftYear('2028-02-29')).toBe('2029-02-28');
    expect(shiftYear('2096-02-29')).toBe('2097-02-28');
  });

  it('keeps 29 February in a leap year and moves 28 February as it is', () => {
    expect(shiftYear('2027-02-28', 1)).toBe('2028-02-28');
    expect(shiftYear('2024-02-29', 4)).toBe('2028-02-29');
    // 2100 is not a leap year, 2000 is.
    expect(shiftYear('2096-02-29', 4)).toBe('2100-02-28');
    expect(shiftYear('1996-02-29', 4)).toBe('2000-02-29');
  });

  it('refuses a value that is not a date', () => {
    expect(() => shiftYear('06/09/2026')).toThrow();
  });
});

describe('nextYearLabel', () => {
  it('counts one year on', () => {
    expect(nextYearLabel('2026-2027')).toBe('2027-2028');
    expect(nextYearLabel('2099-2100')).toBe('2100-2101');
  });
  it('returns null for another shape', () => {
    expect(nextYearLabel('2026')).toBeNull();
  });
});

describe('shiftRange', () => {
  const year = { startsOn: '2027-09-05', endsOn: '2028-06-15' };

  it('shifts a range inside the year without touching it', () => {
    expect(shiftRange({ startsOn: '2026-12-20', endsOn: '2027-01-02' }, year)).toEqual({
      startsOn: '2027-12-20',
      endsOn: '2028-01-02',
      clamped: false,
    });
  });

  it('holds a range inside the new year and says so', () => {
    expect(shiftRange({ startsOn: '2026-09-06', endsOn: '2027-06-17' }, year)).toEqual({
      startsOn: '2027-09-06',
      endsOn: '2028-06-15',
      clamped: true,
    });
    expect(shiftRange({ startsOn: '2026-09-01', endsOn: '2026-09-02' }, year).startsOn).toBe(
      '2027-09-05',
    );
  });

  it('shifts a leap-day range', () => {
    expect(
      shiftRange({ startsOn: '2027-02-28', endsOn: '2028-02-29' }, { startsOn: '2028-09-01', endsOn: '2029-06-30' }),
    ).toEqual({ startsOn: '2028-09-01', endsOn: '2029-02-28', clamped: true });
  });
});
