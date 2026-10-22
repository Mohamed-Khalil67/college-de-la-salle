import { groupHold } from './event-hold.js';

const group = (groupId: string, division: string) => ({ scope: 'group' as const, groupId, group: { division } });

describe('groupHold', () => {
  it('holds the division of the one group it is for, with the group', () => {
    expect(groupHold([group('b', 'TP')])).toEqual({ divisionKey: 'TP', groupId: 'b' });
  });
  it.each([
    ['no target (the whole class)', []],
    ['a class target', [{ scope: 'class' as const, groupId: null }]],
    ['a student among the groups', [group('a', 'TP'), { scope: 'student' as const, groupId: null }]],
    ['several groups, even of one division', [group('a', 'TP'), group('b', 'TP')]],
    ['groups of two divisions', [group('a', 'TP'), group('c', 'LV2')]],
  ])('holds the whole class for %s', (_, targets) => {
    expect(groupHold(targets)).toBeNull();
  });
});
