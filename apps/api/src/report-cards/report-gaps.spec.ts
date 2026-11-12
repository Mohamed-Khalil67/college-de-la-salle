import { describe, expect, it } from 'vitest';
import { classGaps, type GapEvent, subjectGap } from './report-gaps.js';

const event = (over: Partial<GapEvent> = {}): GapEvent => ({
  subjectId: 'maths',
  concerned: 27,
  graded: 27,
  published: 27,
  ...over,
});

describe('subjectGap', () => {
  it('is null when every student has a published mark', () => {
    expect(subjectGap('maths', [event()], 27)).toBeNull();
  });

  it('says no_grades when the subject has no event, or events without a mark', () => {
    expect(subjectGap('maths', [], 27)).toEqual({ subjectId: 'maths', reason: 'no_grades', entered: 0, total: 0 });
    expect(subjectGap('maths', [event({ graded: 0, published: 0 })], 27)?.reason).toBe('no_grades');
    expect(subjectGap('maths', [event({ subjectId: 'physique' })], 27)?.reason).toBe('no_grades');
  });

  it('says incomplete with the counts of the unfinished work only', () => {
    const gap = subjectGap('maths', [event({ graded: 18, published: 18 }), event()], 27);
    expect(gap).toEqual({ subjectId: 'maths', reason: 'incomplete', entered: 18, total: 27 });
  });

  it('counts a draft without marks as unfinished once another event has marks', () => {
    const gap = subjectGap('maths', [event(), event({ concerned: 27, graded: 0, published: 0 })], 27);
    expect(gap).toEqual({ subjectId: 'maths', reason: 'incomplete', entered: 0, total: 27 });
  });

  it('does not judge the count of an event aimed at some students, only that it has marks', () => {
    expect(subjectGap('maths', [event({ concerned: null, graded: 5, published: 5 })], 27)).toBeNull();
    expect(subjectGap('maths', [event(), event({ concerned: null, graded: 0, published: 0 })], 27)?.reason).toBe('incomplete');
  });

  it('says unpublished when everything is entered but some marks are hidden', () => {
    expect(subjectGap('maths', [event({ published: 10 })], 27)?.reason).toBe('unpublished');
  });

  it('does not count marks of a student who left twice', () => {
    expect(subjectGap('maths', [event({ concerned: 26, graded: 27, published: 27 })], 26)).toBeNull();
  });

  it('prefers incomplete over unpublished', () => {
    expect(subjectGap('maths', [event({ graded: 10, published: 0 })], 27)?.reason).toBe('incomplete');
  });
});

describe('classGaps', () => {
  it('lists the gaps in the order of the subjects, leaving ready ones out', () => {
    const events = [event(), event({ subjectId: 'francais', published: 0 })];
    const gaps = classGaps(['maths', 'francais', 'histoire'], events, 27);
    expect(gaps.map((g) => [g.subjectId, g.reason])).toEqual([
      ['francais', 'unpublished'],
      ['histoire', 'no_grades'],
    ]);
  });

  it('is empty for a class without subjects', () => {
    expect(classGaps([], [], 27)).toEqual([]);
  });
});
