import { groupKey, groupsToCopy, membershipsToCreate } from './groups-copy.js';

const classMap = new Map([
  ['s-2nde', 't-2nde'],
  ['s-1ere', 't-1ere'],
]);

describe('groupsToCopy', () => {
  const source = [
    { id: 'g1', classId: 's-2nde', division: 'LV2', label: 'Allemand' },
    { id: 'g2', classId: 's-1ere', division: 'LV2', label: 'Allemand' },
    { id: 'g3', classId: 's-1ere', division: 'TP', label: 'A' },
    { id: 'g4', classId: 'elsewhere', division: 'TP', label: 'B' },
  ];

  it('creates each group on the copied class, matched on class, division and label', () => {
    const { create, existing } = groupsToCopy(source, [], classMap);
    expect(create.map(groupKey)).toEqual(['t-2nde|LV2|Allemand', 't-1ere|LV2|Allemand', 't-1ere|TP|A']);
    expect(existing).toBe(0);
  });

  it('creates nothing the second time', () => {
    const have = [
      { classId: 't-2nde', division: 'LV2', label: 'Allemand' },
      { classId: 't-1ere', division: 'LV2', label: 'Allemand' },
      { classId: 't-1ere', division: 'TP', label: 'A' },
    ];
    expect(groupsToCopy(source, have, classMap)).toEqual({ create: [], existing: 3 });
  });
});

describe('membershipsToCreate', () => {
  const targetGroups = new Map([
    [groupKey({ classId: 't-1ere', division: 'LV2', label: 'Allemand' }), 'new-lv2-all'],
    [groupKey({ classId: 't-2nde', division: 'LV2', label: 'Allemand' }), 'new-2nde-lv2-all'],
  ]);
  const member = (studentId: string, classId: string, label = 'Allemand', division = 'LV2') => ({
    studentId,
    classId,
    division,
    label,
  });

  it('puts a promoted student in the group of the same division and label of the new class', () => {
    const plan = membershipsToCreate(
      [member('promoted', 's-2nde')],
      new Map([['promoted', { classId: 't-1ere', enrolledOn: '2027-09-01' }]]),
      classMap,
      targetGroups,
      new Set(),
    );
    expect(plan.create).toEqual([
      { groupId: 'new-lv2-all', studentId: 'promoted', classId: 't-1ere', division: 'LV2', joinedOn: '2027-09-01' },
    ]);
  });

  it('gives a repeater, a graduate and a leaver nothing', () => {
    const plan = membershipsToCreate(
      [member('repeater', 's-2nde'), member('graduate', 's-1ere'), member('leaver', 's-1ere')],
      new Map([['repeater', { classId: 't-2nde', enrolledOn: '2027-09-01' }]]),
      classMap,
      targetGroups,
      new Set(),
    );
    expect(plan).toEqual({ create: [], existing: 0, skipped: 1 });
  });

  it('skips a group the new class does not have and keeps one open membership per division', () => {
    const plan = membershipsToCreate(
      [member('a', 's-2nde', 'Espagnol'), member('b', 's-2nde'), member('c', 's-2nde')],
      new Map([
        ['a', { classId: 't-1ere', enrolledOn: '2027-09-01' }],
        ['b', { classId: 't-1ere', enrolledOn: '2027-09-01' }],
        ['c', { classId: 't-1ere', enrolledOn: '2027-09-01' }],
      ]),
      classMap,
      targetGroups,
      new Set(['c|t-1ere|LV2']),
    );
    expect(plan.create.map((m) => m.studentId)).toEqual(['b']);
    expect(plan).toMatchObject({ existing: 1, skipped: 1 });
  });
});
