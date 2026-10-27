import { describe, expect, it } from 'vitest';
import type { GroupWithMembersDto, StudentSummaryDto } from '@cdls/shared';
import {
  audienceChangeNote,
  concernedStudents,
  eventTargetLine,
  isWhole,
  targetSentence,
  targetValueOf,
  toTargetInput,
  WHOLE_CLASS,
} from './targets';

const student = (id: string, lastName: string): StudentSummaryDto => ({
  id,
  userId: `u-${id}`,
  firstName: 'Élève',
  lastName,
  studentNumber: null,
});
const roster = ['a', 'b', 'c', 'd', 'e'].map((id) => student(id, id.toUpperCase()));
const group = (id: string, division: string, label: string, memberIds: string[]): GroupWithMembersDto => ({
  id,
  classId: 'c1',
  classLabel: 'Première',
  division,
  label,
  memberCount: memberIds.length,
  createdAt: '2026-10-01T00:00:00.000Z',
  memberIds,
});
const groups = [
  group('g2', 'TP', 'TP B', ['d', 'e']),
  group('g1', 'TP', 'TP A', ['a', 'b']),
  group('g3', 'LV2', 'Allemand', ['a']),
];

describe('« Assigner à »', () => {
  it('is the whole class by default', () => {
    expect(isWhole(WHOLE_CLASS)).toBe(true);
    expect(concernedStudents(WHOLE_CLASS, roster, groups)).toHaveLength(5);
    expect(targetSentence(WHOLE_CLASS, roster, groups)).toBe('Toute la classe : 5 élèves concernés.');
  });

  it('counts the union of groups and students with the shared rule', () => {
    const value = { groupIds: ['g1'], studentIds: ['d', 'a'] };
    expect(concernedStudents(value, roster, groups).map((s) => s.id)).toEqual(['a', 'b', 'd']);
    expect(targetSentence(value, roster, groups)).toBe('TP A, Élève D, Élève A : 3 élèves concernés.');
    expect(targetSentence({ groupIds: [], studentIds: ['c'] }, roster, groups)).toBe('Élève C : 1 élève concerné.');
  });

  it('round-trips an event target', () => {
    const value = targetValueOf({
      whole: false,
      groups: [{ id: 'g1', division: 'TP', label: 'TP A' }],
      studentIds: ['c'],
      concerned: 3,
    });
    expect(toTargetInput(value)).toEqual({ groupIds: ['g1'], studentIds: ['c'] });
    expect(isWhole(targetValueOf(undefined))).toBe(true);
  });

  it('writes the target of an event and what a change does to the grades', () => {
    expect(eventTargetLine({ whole: true, groups: [], studentIds: [], concerned: 10 })).toBe('Toute la classe : 10 élèves concernés');
    expect(
      eventTargetLine({ whole: false, groups: [{ id: 'g1', division: 'TP', label: 'TP A' }], studentIds: ['x', 'y'], concerned: 7 }),
    ).toBe('TP A, 2 élèves nommés : 7 élèves concernés');
    expect(audienceChangeNote(0)).toContain('librement');
    expect(audienceChangeNote(1)).toContain('1 note existe');
    expect(audienceChangeNote(4)).toContain('4 notes existent');
  });
});
