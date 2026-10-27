import { describe, expect, it } from 'vitest';
import type { GroupWithMembersDto, StudentSummaryDto } from '@cdls/shared';
import { divisionBlocks, memberLists } from './groups-logic';

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

describe('divisionBlocks', () => {
  it('groups by division, sorted, with the students who are in none of the division', () => {
    const blocks = divisionBlocks(groups, roster);
    expect(blocks.map((b) => b.division)).toEqual(['LV2', 'TP']);
    expect(blocks[1]!.groups.map((g) => g.label)).toEqual(['TP A', 'TP B']);
    expect(blocks[1]!.withoutGroup.map((s) => s.id)).toEqual(['c']);
    expect(blocks[0]!.withoutGroup.map((s) => s.id)).toEqual(['b', 'c', 'd', 'e']);
  });
});

describe('memberLists', () => {
  it('says where a student already is within the division, and ignores other divisions', () => {
    const lists = memberLists(groups[1]!, groups, roster);
    expect(lists.members.map((s) => s.id)).toEqual(['a', 'b']);
    const byId = new Map(lists.others.map((o) => [o.student.id, o.elsewhere?.label ?? null]));
    expect(byId.get('c')).toBeNull();
    expect(byId.get('d')).toBe('TP B');
    // « a » is in the LV2 group, which is another division: no conflict.
    expect(lists.others.every((o) => o.student.id !== 'a')).toBe(true);
  });
});
