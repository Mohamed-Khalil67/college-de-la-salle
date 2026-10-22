import {
  type ClassStint,
  computeCards,
  computeReportCards,
  enrolledDuring,
  primaryClassId,
  subjectsOfStudent,
  subjectWeights,
} from './compute.js';

const subjects = [
  { subjectId: 'maths', subjectName: 'Mathématiques', coefficient: 4 },
  { subjectId: 'arabe', subjectName: 'Arabe', coefficient: 2 },
  { subjectId: 'arts', subjectName: 'Arts', coefficient: 1 },
];

const g = (studentId: string, subjectId: string, score: number, outOf = 20, coefficient = 1) => ({
  studentId,
  subjectId,
  score,
  outOf,
  coefficient,
});

describe('computeReportCards', () => {
  it('averages each subject with event coefficients and weights the general average by subject', () => {
    const [card] = computeReportCards(['s1'], subjects, [
      g('s1', 'maths', 10),
      g('s1', 'maths', 8, 10, 2), // 16/20, coefficient 2
      g('s1', 'arabe', 12),
    ]);
    expect(card!.subjects.map((s) => [s.subjectId, s.average, s.gradeCount])).toEqual([
      ['maths', 14, 2],
      ['arabe', 12, 1],
      ['arts', null, 0],
    ]);
    // (14 × 4 + 12 × 2) / 6, arts ignored (no grade)
    expect(card!.average).toBe(13.3);
  });

  it('ranks by general average with shared ranks for ties and no rank without grades', () => {
    const cards = computeReportCards(['a', 'b', 'c', 'd'], subjects, [
      g('a', 'maths', 12),
      g('b', 'maths', 15),
      g('c', 'maths', 12),
    ]);
    expect(cards.map((c) => [c.studentId, c.average, c.rank])).toEqual([
      ['a', 12, 2],
      ['b', 15, 1],
      ['c', 12, 2],
      ['d', null, null],
    ]);
  });
});

describe('subjectWeights', () => {
  it('weighs each subject of the class by its class-subject coefficient', () => {
    expect(
      subjectWeights([
        { subjectId: 'maths', coefficient: 4, subject: { name: 'Mathématiques' } },
        { subjectId: 'arabe', coefficient: 2, subject: { name: 'Arabe' } },
      ]),
    ).toEqual([
      { subjectId: 'maths', subjectName: 'Mathématiques', coefficient: 4 },
      { subjectId: 'arabe', subjectName: 'Arabe', coefficient: 2 },
    ]);
  });
});

describe('a student who changed class inside the period', () => {
  const maths = (coefficient: number) => ({ subjectId: 'maths', subjectName: 'Mathématiques', coefficient });
  const arabe = (coefficient: number) => ({ subjectId: 'arabe', subjectName: 'Arabe', coefficient });
  const histoire = { subjectId: 'histoire', subjectName: 'Histoire', coefficient: 2 };
  const old: ClassStint = { classId: 'old', enrolledOn: '2026-09-06', leftOn: '2026-10-20', subjects: [maths(4), arabe(2), histoire] };
  const now: ClassStint = { classId: 'new', enrolledOn: '2026-10-20', leftOn: null, subjects: [maths(6), arabe(2)] };
  const grade = (subjectId: string, score: number, classId: string, coefficient = 1) => ({
    studentId: 's1',
    subjectId,
    score,
    outOf: 20,
    coefficient,
    classId,
  });

  it('belongs to the class they ended the period in', () => {
    expect(primaryClassId([old, now])).toBe('new');
    expect(primaryClassId([now, old])).toBe('new');
    expect(primaryClassId([])).toBeNull();
    // Two enrolments the same day: the open one is the later one.
    expect(
      primaryClassId([
        { ...now, classId: 'a', enrolledOn: '2026-10-20', leftOn: '2026-10-20' },
        { ...now, classId: 'b', enrolledOn: '2026-10-20', leftOn: null },
      ]),
    ).toBe('b');
  });

  it('keeps the subjects of a single class exactly as they are', () => {
    expect(subjectsOfStudent([now], [grade('maths', 10, 'new')])).toEqual(now.subjects);
  });

  it('adds the earlier class subjects that have grades, and drops the ones without', () => {
    const subjects = subjectsOfStudent([old, now], [grade('histoire', 12, 'old')]);
    expect(subjects.map((s) => s.subjectId)).toEqual(['arabe', 'histoire', 'maths']);
    expect(subjects.find((s) => s.subjectId === 'histoire')!.coefficient).toBe(2);
    expect(subjectsOfStudent([old, now], []).map((s) => s.subjectId)).toEqual(['arabe', 'maths']);
  });

  it('weighs a subject by the coefficient of the class each grade belongs to', () => {
    // 1 grade (weight 1) in the old class (coefficient 4), 3 in the new one (coefficient 6): (4 + 18) / 4.
    const grades = [
      grade('maths', 10, 'old'),
      grade('maths', 12, 'new'),
      grade('maths', 14, 'new'),
      grade('maths', 16, 'new'),
    ];
    expect(subjectsOfStudent([old, now], grades).find((s) => s.subjectId === 'maths')!.coefficient).toBe(5.5);
    // All the grades in one class: exactly that class's coefficient.
    expect(
      subjectsOfStudent([old, now], [grade('maths', 10, 'old')]).find((s) => s.subjectId === 'maths')!
        .coefficient,
    ).toBe(4);
  });

  it('builds the card from the grades of both classes without changing the other students', () => {
    const other = { studentId: 's2', subjectId: 'maths', score: 12, outOf: 20, coefficient: 1, classId: 'new' };
    const mine = [grade('maths', 10, 'old'), grade('maths', 14, 'new'), grade('histoire', 16, 'old')];
    const [card, otherCard] = computeCards(
      [
        { studentId: 's1', subjects: subjectsOfStudent([old, now], mine) },
        { studentId: 's2', subjects: now.subjects },
      ],
      [...mine, other],
    );
    expect(card!.subjects.map((s) => [s.subjectId, s.average, s.coefficient])).toEqual([
      ['arabe', null, 2],
      ['histoire', 16, 2],
      ['maths', 12, 5],
    ]);
    // (16 × 2 + 12 × 5) / 7
    expect(card!.average).toBe(13.1);
    // The other student is computed exactly as by computeReportCards.
    const alone = computeReportCards(['s2'], now.subjects, [other])[0]!;
    expect({ ...otherCard, rank: null }).toEqual({ ...alone, rank: null });
    expect(otherCard!.average).toBe(12);
  });

  it('knows when an enrolment overlaps the period', () => {
    const window = { from: '2026-09-06', to: '2026-12-17' };
    expect(enrolledDuring({ enrolledOn: '2026-09-06', leftOn: null }, window)).toBe(true);
    expect(enrolledDuring({ enrolledOn: '2026-08-01', leftOn: '2026-09-05' }, window)).toBe(false);
    expect(enrolledDuring({ enrolledOn: '2026-12-18', leftOn: null }, window)).toBe(false);
    expect(enrolledDuring({ enrolledOn: '2026-07-01', leftOn: '2026-12-17' }, window)).toBe(true);
  });
});
