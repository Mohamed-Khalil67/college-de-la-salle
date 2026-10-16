import {
  applyLayout,
  buildLayout,
  deliveredQuestions,
  parseRoster,
  questionsDelivered,
  toCanonicalAnswers,
} from './delivery';
import type { Question } from './exam.contracts';

const bank: Question[] = [
  { id: 'q1', type: 'CHOICE', prompt: 'a', options: ['A0', 'A1', 'A2'], points: 1 },
  { id: 'q2', type: 'CHOICE', prompt: 'b', options: ['B0', 'B1'], points: 1 },
  { id: 'q3', type: 'TEXT', prompt: 'c', points: 3, maxLength: 100 },
  { id: 'q4', type: 'CHOICE', prompt: 'd', options: ['D0', 'D1', 'D2', 'D3'], points: 2 },
];

/** Deterministic "random": always picks the last remaining slot (reverses on Fisher–Yates). */
const reverse = (n: number) => n - 1;
const keep = () => 0;

describe('buildLayout', () => {
  it('delivers everything in authored order by default', () => {
    expect(buildLayout(bank, undefined, reverse)).toEqual({
      questionIds: ['q1', 'q2', 'q3', 'q4'],
      optionOrders: { q1: [0, 1, 2], q2: [0, 1], q4: [0, 1, 2, 3] },
    });
  });

  it('shuffles questions and options independently', () => {
    const layout = buildLayout(
      bank,
      { shuffleQuestions: true, shuffleOptions: true, questionsPerCandidate: null },
      keep,
    );
    expect(layout.questionIds).toHaveLength(4);
    expect(new Set(layout.questionIds)).toEqual(new Set(['q1', 'q2', 'q3', 'q4']));
    expect(layout.optionOrders['q1']).not.toEqual([0, 1, 2]);
    expect([...layout.optionOrders['q1']].sort()).toEqual([0, 1, 2]);
    expect(layout.optionOrders['q3']).toBeUndefined(); // written questions have no options
  });

  it('draws N questions from the bank, keeping authored order unless shuffling', () => {
    const layout = buildLayout(
      bank,
      { shuffleQuestions: false, shuffleOptions: false, questionsPerCandidate: 2 },
      keep,
    );
    expect(layout.questionIds).toHaveLength(2);
    const positions = layout.questionIds.map((id) => bank.findIndex((q) => q.id === id));
    expect(positions).toEqual([...positions].sort());
  });

  it('treats an out-of-range draw size as "all questions"', () => {
    expect(questionsDelivered(4, { shuffleQuestions: false, shuffleOptions: false, questionsPerCandidate: 9 })).toBe(4);
    expect(questionsDelivered(4, { shuffleQuestions: false, shuffleOptions: false, questionsPerCandidate: 0 })).toBe(4);
    expect(questionsDelivered(4, { shuffleQuestions: false, shuffleOptions: false, questionsPerCandidate: 3 })).toBe(3);
  });
});

describe('applyLayout and toCanonicalAnswers', () => {
  const layout = { questionIds: ['q4', 'q1'], optionOrders: { q4: [3, 2, 1, 0], q1: [2, 0, 1] } };

  it('shows the candidate their questions with options in their order', () => {
    const paper = applyLayout(bank, layout);
    expect(paper.map((q) => q.id)).toEqual(['q4', 'q1']);
    expect(paper[0].type === 'CHOICE' && paper[0].options).toEqual(['D3', 'D2', 'D1', 'D0']);
    expect(paper[1].type === 'CHOICE' && paper[1].options).toEqual(['A2', 'A0', 'A1']);
  });

  it('maps displayed choices back to authored indexes', () => {
    // Candidate clicked the 1st displayed option of q4 (= D3) and the 2nd of q1 (= A0).
    expect(toCanonicalAnswers({ q4: 0, q1: 1 }, layout)).toEqual({ q4: 3, q1: 0 });
  });

  it('drops answers to questions the candidate was not given, and invalid indexes', () => {
    expect(toCanonicalAnswers({ q2: 1, q3: 'text', q4: 7 }, layout)).toEqual({});
  });

  it('passes answers through unchanged without a layout (older sessions)', () => {
    expect(toCanonicalAnswers({ q1: 2, q3: 'x' }, null)).toEqual({ q1: 2, q3: 'x' });
  });

  it('lists delivered questions in session order', () => {
    expect(deliveredQuestions(bank, ['q3', 'q1']).map((q) => q.id)).toEqual(['q3', 'q1']);
    expect(deliveredQuestions(bank, null)).toHaveLength(4);
  });
});

describe('access lists', () => {
  it('parses pasted rosters, de-duplicating and reporting invalid entries', () => {
    expect(parseRoster('a@x.com, B@x.com\nb@x.com; not-an-email ، c@y.org')).toEqual({
      emails: ['a@x.com', 'b@x.com', 'c@y.org'],
      invalid: ['not-an-email'],
    });
  });
});
