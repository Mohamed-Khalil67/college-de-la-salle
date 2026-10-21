import type { TimetableOccurrence } from '@cdls/shared';
import type { SlotData } from '../occupancy/slot-data.js';
import { hoursWarning, sessionWarnings, type WarningFacts } from './warnings.js';

const slot = (over: Partial<SlotData> = {}, type = { isSystem: true, code: 'cours' }): SlotData =>
  ({
    id: 's1',
    target: 'bac-premiere',
    classId: 'c1',
    division: null,
    row: {
      activityType: type,
      classSubject: { subject: { name: 'Mathématiques' }, schoolClass: { label: 'Première' } },
    },
    ...over,
  }) as unknown as SlotData;

const session = (
  date: string,
  roomId: string | null,
  s: SlotData = slot(),
): TimetableOccurrence<SlotData> =>
  ({
    key: `${s.id}@${date}`,
    slot: s,
    originalDate: date,
    status: 'normal',
    current: { date, startTime: '08:00', endTime: '09:00', roomId, teacherId: 't1' },
    original: { date, startTime: '08:00', endTime: '09:00', roomId, teacherId: 't1' },
    changes: [],
    exception: null,
    movedTo: null,
  }) as unknown as TimetableOccurrence<SlotData>;

const facts = (over: Partial<WarningFacts> = {}): WarningFacts => ({
  examWeeks: [],
  classSize: new Map([['c1', 30]]),
  rooms: new Map([
    ['small', { name: 'Salle 3', capacity: 20, kind: 'classroom' as const }],
    ['big', { name: 'Salle 12', capacity: 40, kind: 'classroom' as const }],
    ['lab', { name: 'Labo', capacity: 30, kind: 'lab' as const }],
  ]),
  assessments: new Map(),
  ...over,
});

describe('sessionWarnings', () => {
  it('stays silent when nothing is wrong', () => {
    expect(sessionWarnings([session('2026-11-01', 'big')], facts())).toEqual([]);
  });

  it('warns once per series about an exam week, with the first day and the count', () => {
    const exam = [{ startsOn: '2026-11-01', endsOn: '2026-11-14', targets: ['bac'] }];
    const out = sessionWarnings(
      [session('2026-11-01', 'big'), session('2026-11-08', 'big'), session('2026-11-15', 'big')],
      facts({ examWeeks: exam }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'exam_week', date: '2026-11-01' });
    expect(out[0]!.message).toMatch(
      /semaine d’examens \(Mathématiques, Première\) \(et 1 autre séance\)/,
    );
  });

  it('ignores an exam week of another section', () => {
    const exam = [{ startsOn: '2026-11-01', endsOn: '2026-11-14', targets: ['nationale'] }];
    expect(sessionWarnings([session('2026-11-01', 'big')], facts({ examWeeks: exam }))).toEqual([]);
  });

  it('warns when the room has fewer seats than the class, not for a group or an unknown capacity', () => {
    const out = sessionWarnings([session('2026-11-01', 'small')], facts());
    expect(out.map((w) => w.code)).toEqual(['room_capacity']);
    expect(out[0]!.message).toBe(
      'Salle 3 compte 20 places pour 30 élèves (Mathématiques, Première).',
    );
    expect(
      sessionWarnings([session('2026-11-01', 'small', slot({ division: 'TP' }))], facts()),
    ).toEqual([]);
    expect(
      sessionWarnings(
        [session('2026-11-01', 'small')],
        facts({
          rooms: new Map([['small', { name: 'Salle 3', capacity: null, kind: 'classroom' as const }]]),
        }),
      ),
    ).toEqual([]);
  });

  it('warns about a TP outside a laboratory (or without a room), not in one, not for other types', () => {
    const tp = slot({}, { isSystem: true, code: 'tp' });
    expect(sessionWarnings([session('2026-11-01', 'big', tp)], facts()).map((w) => w.code)).toEqual([
      'tp_outside_lab',
    ]);
    expect(sessionWarnings([session('2026-11-01', null, tp)], facts())[0]!.message).toMatch(
      /sans salle/,
    );
    expect(sessionWarnings([session('2026-11-01', 'lab', tp)], facts())).toEqual([]);
    // A teacher's own type named « tp » is not the system TP.
    const own = slot({}, { isSystem: false, code: 'tp' });
    expect(sessionWarnings([session('2026-11-01', 'big', own)], facts())).toEqual([]);
  });

  it('warns once a day when a class has more than two assessments', () => {
    const many = facts({ assessments: new Map([['c1|2026-11-01', 3]]) });
    const out = sessionWarnings(
      [session('2026-11-01', 'big'), session('2026-11-01', 'big', slot({ id: 's2' }))],
      many,
    );
    expect(out.map((w) => w.code)).toEqual(['assessments_overload']);
    expect(
      sessionWarnings(
        [session('2026-11-01', 'big')],
        facts({ assessments: new Map([['c1|2026-11-01', 2]]) }),
      ),
    ).toEqual([]);
  });
});

describe('hoursWarning', () => {
  const slots = (...hours: [string, string, 'A' | 'B' | null][]) =>
    hours.map(([startTime, endTime, weekParity]) => ({ startTime, endTime, weekParity }));

  it('compares the hours of the week with hoursPerWeek, a fortnightly slot counting half', () => {
    expect(
      hoursWarning(slot(), slots(['08:00', '10:00', null], ['10:00', '12:00', null]), 3)!.message,
    ).toBe('Mathématiques, Première : 4 h par semaine pour 3 h prévues.');
    expect(
      hoursWarning(slot(), slots(['08:00', '10:00', null], ['10:00', '12:00', 'A']), 3),
    ).toBeNull();
    expect(hoursWarning(slot(), slots(['08:00', '10:30', null]), 2.5)).toBeNull();
    expect(hoursWarning(slot(), slots(['08:00', '12:00', null]), null)).toBeNull();
  });
});
