import { computeReportCards, subjectWeights } from './compute.js';

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
