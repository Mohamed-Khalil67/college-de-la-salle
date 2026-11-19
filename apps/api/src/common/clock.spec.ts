import { currentTime, pinClock, unpinClock } from './clock.js';
import { schoolTimeNow, schoolToday } from './dates.js';

describe('clock', () => {
  afterEach(() => unpinClock());

  it('is the real time by default', () => {
    const before = Date.now();
    const now = currentTime().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('can be pinned, and every read then gives the pinned instant', () => {
    pinClock('2026-10-04T10:30:00Z');
    expect(currentTime().toISOString()).toBe('2026-10-04T10:30:00.000Z');
    // A caller cannot move the pinned instant by mutating what it received.
    currentTime().setUTCFullYear(1999);
    expect(currentTime().toISOString()).toBe('2026-10-04T10:30:00.000Z');
  });

  it('is honoured by the school calendar helpers', () => {
    pinClock('2026-10-04T10:30:00Z');
    expect(schoolToday()).toBe('2026-10-04');
    expect(schoolTimeNow()).toMatch(/^\d{2}:\d{2}$/);
    // An explicit instant still wins over the pinned one.
    expect(schoolToday(new Date('2027-01-10T08:00:00Z'))).toBe('2027-01-10');
  });

  it('puts the real time back, and the undo function does it too', () => {
    const undo = pinClock('2026-10-04T10:30:00Z');
    undo();
    expect(currentTime().toISOString()).not.toBe('2026-10-04T10:30:00.000Z');
  });

  it('refuses a date that does not exist', () => {
    expect(() => pinClock('not a date')).toThrow(/Invalid clock date/);
  });

  it('refuses to pin in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => pinClock('2026-10-04T10:30:00Z')).toThrow(/production/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
