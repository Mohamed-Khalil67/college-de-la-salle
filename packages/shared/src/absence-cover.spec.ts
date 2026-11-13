import { describe, expect, it } from 'vitest';
import {
  type CoverLesson,
  type CoverPick,
  heldAround,
  lessonsOverlap,
  offerable,
  proposeCover,
  reconcileCovers,
} from './absence-cover.js';

const mona = { teacherId: 'mona', sameSubject: true };
const omar = { teacherId: 'omar', sameSubject: false };
const nour = { teacherId: 'nour', sameSubject: true };

/** a 08:00-09:00 and b 08:30-09:30 overlap; c 09:00-10:00 touches a and overlaps b. */
const lessons = (over: Partial<CoverLesson>[] = []): CoverLesson[] =>
  [
    { key: 'a@d', date: '2026-12-01', startTime: '08:00', endTime: '09:00', free: [omar, mona] },
    { key: 'b@d', date: '2026-12-01', startTime: '08:30', endTime: '09:30', free: [omar, mona] },
    { key: 'c@d', date: '2026-12-01', startTime: '09:00', endTime: '10:00', free: [omar, mona] },
  ].map((l, i) => ({ ...l, ...over[i] }));
const sub = (teacherId = ''): CoverPick => ({ kind: 'substitute', teacherId });

describe('lessonsOverlap', () => {
  it('shares minutes of one day; touching lessons and other days do not', () => {
    const [a, b, c] = lessons();
    expect(lessonsOverlap(a!, b!)).toBe(true);
    expect(lessonsOverlap(a!, c!)).toBe(false);
    expect(lessonsOverlap(a!, { ...b!, date: '2026-12-02' })).toBe(false);
  });
});

describe('offerable and proposeCover', () => {
  it('does not offer a teacher held by an overlapping lesson, but offers them for a later one', () => {
    const l = lessons();
    const picked = { 'a@d': 'mona' };
    expect(heldAround(l[1]!, l, picked)).toEqual(new Set(['mona']));
    expect(offerable(l[1]!, l, picked).map((t) => t.teacherId)).toEqual(['omar']);
    expect(offerable(l[2]!, l, picked).map((t) => t.teacherId)).toEqual(['omar', 'mona']);
  });
  it('never counts the lesson’s own pick as held', () => {
    const l = lessons();
    expect(offerable(l[0]!, l, { 'a@d': 'mona' })).toHaveLength(2);
  });
  it('proposes a teacher of the subject, or nobody', () => {
    const l = lessons();
    expect(proposeCover(l[1]!, l, { 'a@d': 'mona' })).toBe('');
    expect(proposeCover(l[2]!, l, { 'a@d': 'mona' })).toBe('mona');
  });
});

describe('reconcileCovers', () => {
  it('proposes different teachers for simultaneous lessons', () => {
    const two = lessons([{}, { free: [mona, nour] }]).slice(0, 2);
    const out = reconcileCovers(two, { 'a@d': sub(), 'b@d': sub() });
    expect(out.teachers).toEqual({ 'a@d': 'mona', 'b@d': 'nour' });
  });
  it('proposes nobody for the second when only one teacher of the subject is free', () => {
    const out = reconcileCovers(lessons().slice(0, 2), { 'a@d': sub(), 'b@d': sub() });
    expect(out.teachers).toEqual({ 'a@d': 'mona', 'b@d': '' });
    expect(out.replaced).toEqual([]);
  });
  it('keeps a valid pick and lets the same teacher cover a lesson that does not overlap', () => {
    const out = reconcileCovers(lessons(), { 'a@d': sub('mona'), 'c@d': sub() });
    expect(out.teachers).toEqual({ 'a@d': 'mona', 'c@d': 'mona' });
  });
  it('replaces a teacher who is no longer free and says so', () => {
    const gone = reconcileCovers(lessons([{ free: [omar] }]), { 'a@d': sub('mona') });
    expect(gone.teachers['a@d']).toBe('');
    expect(gone.replaced).toEqual([{ key: 'a@d', was: 'mona', now: '', reason: 'busy' }]);
    const other = reconcileCovers(lessons([{ free: [omar, nour] }]), { 'a@d': sub('mona') });
    expect(other.replaced[0]).toMatchObject({ now: 'nour', reason: 'busy' });
  });
  it('gives a teacher picked twice at the same time to the earlier lesson only', () => {
    const out = reconcileCovers(lessons().slice(0, 2), { 'a@d': sub('mona'), 'b@d': sub('mona') });
    expect(out.teachers).toEqual({ 'a@d': 'mona', 'b@d': '' });
    expect(out.replaced).toEqual([{ key: 'b@d', was: 'mona', now: '', reason: 'taken' }]);
  });
  it('never proposes a supervisor for a study', () => {
    const out = reconcileCovers(lessons().slice(0, 1), {
      'a@d': { kind: 'study', teacherId: 'ghost' },
    });
    expect(out.teachers['a@d']).toBe('');
  });
  it('ignores lessons without a pick', () => {
    expect(reconcileCovers(lessons(), {}).teachers).toEqual({});
  });
});
