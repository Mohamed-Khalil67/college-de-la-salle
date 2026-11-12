import { describe, expect, it } from 'vitest';
import { classCoverage, freeUntil } from './planner.js';

describe('classCoverage', () => {
  it('is complete when every subject with hours has them placed', () => {
    const c = classCoverage('c1', '1ère A', [
      { subjectName: 'Maths', expected: 4, placed: 4 },
      { subjectName: 'Sport', expected: 2, placed: 3 },
    ]);
    expect(c.complete).toBe(true);
    expect(c.expectedHours).toBe(6);
    expect(c.placedHours).toBe(7);
    expect(c.missing).toEqual([]);
  });

  it('lists the missing hours, the largest gap first', () => {
    const c = classCoverage('c1', '1ère A', [
      { subjectName: 'Maths', expected: 4, placed: 3 },
      { subjectName: 'Histoire', expected: 3, placed: 0.5 },
    ]);
    expect(c.complete).toBe(false);
    expect(c.missing).toEqual([
      { subjectName: 'Histoire', missingHours: 2.5 },
      { subjectName: 'Maths', missingHours: 1 },
    ]);
  });

  it('ignores a subject without hours set', () => {
    const c = classCoverage('c1', 'A', [{ subjectName: 'Art', expected: null, placed: 0 }]);
    expect(c.complete).toBe(true);
    expect(c.expectedHours).toBe(0);
  });

  it('is complete with no subject at all', () => {
    expect(classCoverage('c1', 'A', []).complete).toBe(true);
  });
});

describe('freeUntil', () => {
  it('gives the next start after now', () => {
    expect(freeUntil(['08:00', '11:15', '09:30'], '09:00')).toBe('09:30');
  });
  it('is null when nothing follows', () => {
    expect(freeUntil(['08:00'], '09:00')).toBeNull();
    expect(freeUntil([], '09:00')).toBeNull();
  });
});
