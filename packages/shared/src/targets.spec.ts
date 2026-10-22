import { describe, expect, it } from 'vitest';
import {
  concernedLabel,
  concernsStudent,
  entriesOf,
  isWholeClass,
  targetedStudentIds,
  type TargetContext,
  wasTargeted,
} from './targets.js';

const context = (classStudentIds: string[], groups: Record<string, string[]> = {}): TargetContext => ({
  classStudentIds,
  groupMembers: new Map(Object.entries(groups)),
});

const ROSTER = ['a', 'b', 'c', 'd', 'e'];

describe('targetedStudentIds', () => {
  it('concerns the whole class when there is no target row (the default)', () => {
    expect(targetedStudentIds([], context(ROSTER))).toEqual(ROSTER);
  });

  it('concerns the whole class for a class row, and ignores anything next to it', () => {
    const entries = [{ scope: 'class' as const }, { scope: 'student' as const, studentId: 'a' }];
    expect(isWholeClass(entries)).toBe(true);
    expect(targetedStudentIds(entries, context(ROSTER))).toEqual(ROSTER);
  });

  it('concerns the current members of a group', () => {
    const ctx = context(ROSTER, { g1: ['b', 'd'] });
    expect(targetedStudentIds([{ scope: 'group', groupId: 'g1' }], ctx)).toEqual(['b', 'd']);
  });

  it('concerns individual students, in class order', () => {
    const ids = targetedStudentIds(
      [
        { scope: 'student', studentId: 'e' },
        { scope: 'student', studentId: 'a' },
      ],
      context(ROSTER),
    );
    expect(ids).toEqual(['a', 'e']);
  });

  it('mixes groups and students without counting anyone twice', () => {
    const ctx = context(ROSTER, { g1: ['a', 'b'], g2: ['b', 'c'] });
    const ids = targetedStudentIds(
      [
        { scope: 'group', groupId: 'g1' },
        { scope: 'group', groupId: 'g2' },
        { scope: 'student', studentId: 'c' },
        { scope: 'student', studentId: 'e' },
      ],
      ctx,
    );
    expect(ids).toEqual(['a', 'b', 'c', 'e']);
  });

  it('includes a student who joined the group after the work was assigned', () => {
    const entries = [{ scope: 'group' as const, groupId: 'g1' }];
    const before = targetedStudentIds(entries, context(ROSTER, { g1: ['a'] }));
    const after = targetedStudentIds(entries, context(ROSTER, { g1: ['a', 'd'] }));
    expect(before).toEqual(['a']);
    expect(after).toEqual(['a', 'd']);
  });

  it('leaves out a student who left the group', () => {
    const entries = [{ scope: 'group' as const, groupId: 'g1' }];
    expect(targetedStudentIds(entries, context(ROSTER, { g1: ['a'] }))).toEqual(['a']);
    expect(concernsStudent(entries, context(ROSTER, { g1: [] }), 'a')).toBe(false);
  });

  it('leaves out a student who left the class, even one named individually', () => {
    const ctx = context(['a', 'b'], { g1: ['a', 'z'] });
    const ids = targetedStudentIds(
      [
        { scope: 'group', groupId: 'g1' },
        { scope: 'student', studentId: 'y' },
      ],
      ctx,
    );
    expect(ids).toEqual(['a']);
  });

  it('knows nothing of an unknown group', () => {
    expect(targetedStudentIds([{ scope: 'group', groupId: 'zz' }], context(ROSTER))).toEqual([]);
  });
});

describe('wasTargeted', () => {
  it('is true for everyone when the whole class is the target', () => {
    expect(wasTargeted([], 'a', new Set())).toBe(true);
  });
  it('keeps a student who moved to another group of the same division', () => {
    const entries = [{ scope: 'group' as const, groupId: 'g1' }];
    expect(wasTargeted(entries, 'a', new Set(['g1', 'g2']))).toBe(true);
    expect(wasTargeted(entries, 'a', new Set(['g2']))).toBe(false);
  });
  it('is true for a student named individually', () => {
    expect(wasTargeted([{ scope: 'student', studentId: 'a' }], 'a', new Set())).toBe(true);
    expect(wasTargeted([{ scope: 'student', studentId: 'a' }], 'b', new Set())).toBe(false);
  });
});

describe('entriesOf and labels', () => {
  it('turns an empty request into the whole class', () => {
    expect(entriesOf({ groupIds: [], studentIds: [] })).toEqual([{ scope: 'class' }]);
  });
  it('drops duplicates', () => {
    expect(entriesOf({ groupIds: ['g', 'g'], studentIds: ['s', 's'] })).toEqual([
      { scope: 'group', groupId: 'g' },
      { scope: 'student', studentId: 's' },
    ]);
  });
  it('writes the count in French', () => {
    expect(concernedLabel(1)).toBe('1 élève concerné');
    expect(concernedLabel(12)).toBe('12 élèves concernés');
    expect(concernedLabel(0)).toBe('0 élèves concernés');
  });
});
