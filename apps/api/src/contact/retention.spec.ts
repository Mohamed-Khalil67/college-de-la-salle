import { retentionCutoff } from './retention.js';

describe('retentionCutoff', () => {
  it('goes back whole days from now, to the millisecond', () => {
    const now = new Date('2026-10-20T08:30:15.250Z');
    expect(retentionCutoff(now, 1).toISOString()).toBe('2026-10-19T08:30:15.250Z');
    expect(retentionCutoff(now, 365).toISOString()).toBe('2025-10-20T08:30:15.250Z');
  });

  it('counts 24-hour days across a leap day and Cairo’s clock changes', () => {
    // 2028 is a leap year: 365 days before 1 March 2029 is 1 March 2028, 366 is 29 February.
    expect(retentionCutoff(new Date('2029-03-01T00:00:00Z'), 366).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    // UTC arithmetic: summer time in Cairo (last Friday of April) does not shift the cutoff.
    expect(retentionCutoff(new Date('2026-05-01T12:00:00Z'), 7).toISOString()).toBe(
      '2026-04-24T12:00:00.000Z',
    );
  });

  it('does not change the date it is given', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    retentionCutoff(now, 30);
    expect(now.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('refuses a retention that is not a whole number of days', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    for (const days of [0, -1, 1.5, Number.NaN])
      expect(() => retentionCutoff(now, days)).toThrow(RangeError);
  });
});
