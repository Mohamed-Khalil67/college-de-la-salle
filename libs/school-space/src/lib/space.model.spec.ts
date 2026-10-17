import { describe, expect, it } from 'vitest';
import {
  audienceMatches,
  averageOnTwenty,
  classTarget,
  dueState,
  frenchError,
  gradesBySubject,
  isCalendarDay,
  isHttpsUrl,
  isValidTarget,
  onTwenty,
  parseNumber,
  postsFor,
  splitAssignments,
  TARGET_OPTIONS,
  targetLabel,
  todayIso,
  type Grade,
  type Post,
} from './space.model';

const post = (id: string, over: Partial<Post> = {}): Post => ({
  id,
  type: 'announcement',
  title: id,
  body: '',
  subject: '',
  target: 'all',
  dueDate: null,
  url: null,
  authorUid: 'u',
  authorName: 'Marc',
  createdAt: 1,
  ...over,
});

const grade = (id: string, subject: string, score: number, outOf: number, createdAt = 1): Grade => ({
  id,
  studentUid: 's',
  studentName: 'Sara',
  subject,
  title: id,
  score,
  outOf,
  comment: '',
  teacherUid: 't',
  teacherName: 'Marc',
  createdAt,
});

describe('audiences', () => {
  it('a post reaches everyone, a section, or one class', () => {
    expect(audienceMatches('all', 'bac', 'premiere')).toBe(true);
    expect(audienceMatches('bac', 'bac', 'premiere')).toBe(true);
    expect(audienceMatches('bac', 'nationale', 'secondaire-3')).toBe(false);
    expect(audienceMatches('bac-premiere', 'bac', 'premiere')).toBe(true);
    expect(audienceMatches('bac-terminale', 'bac', 'premiere')).toBe(false);
    expect(audienceMatches(classTarget('nationale', 'secondaire-3'), 'nationale', 'secondaire-3')).toBe(true);
  });

  it('the options are the ones the security rules accept: all, 2 sections, 6 classes', () => {
    expect(TARGET_OPTIONS.map((t) => t.value)).toEqual([
      'all', 'nationale', 'nationale-secondaire-1', 'nationale-secondaire-2', 'nationale-secondaire-3',
      'bac', 'bac-seconde', 'bac-premiere', 'bac-terminale',
    ]);
    expect(isValidTarget('bac-premiere')).toBe(true);
    expect(isValidTarget('cm2')).toBe(false);
    expect(targetLabel('bac-premiere')).toBe('Bac français — Première');
    expect(targetLabel('all')).toBe('Tous les élèves');
  });

  it('postsFor keeps one type and the student’s audience, newest first', () => {
    const posts = [
      post('old', { createdAt: 1 }),
      post('new', { createdAt: 3 }),
      post('other-class', { target: 'bac-terminale', createdAt: 4 }),
      post('homework', { type: 'assignment', createdAt: 5 }),
    ];
    expect(postsFor(posts, 'announcement', 'bac', 'premiere').map((p) => p.id)).toEqual(['new', 'old']);
  });
});

describe('homework', () => {
  it('splits to-do (soonest due first) from done', () => {
    const list = [
      post('b', { type: 'assignment', dueDate: '2026-11-05' }),
      post('a', { type: 'assignment', dueDate: '2026-11-02' }),
      post('c', { type: 'assignment', dueDate: '2026-11-09' }),
    ];
    const { todo, finished } = splitAssignments(list, ['c']);
    expect(todo.map((p) => p.id)).toEqual(['a', 'b']);
    expect(finished.map((p) => p.id)).toEqual(['c']);
  });

  it('describes the due date relative to today', () => {
    expect(dueState('2026-11-01', '2026-11-02')).toBe('overdue');
    expect(dueState('2026-11-02', '2026-11-02')).toBe('today');
    expect(dueState('2026-11-05', '2026-11-02')).toBe('soon');
    expect(dueState('2026-11-06', '2026-11-02')).toBe('later');
  });

  it('formats today as a local calendar day', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('validates days and links', () => {
    expect(isCalendarDay('2026-11-03')).toBe(true);
    expect(isCalendarDay('demain')).toBe(false);
    expect(isCalendarDay('2026-13-40')).toBe(false);
    expect(isHttpsUrl('https://example.org/cours.pdf')).toBe(true);
    expect(isHttpsUrl('http://example.org')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('example.org')).toBe(false);
  });
});

describe('grades', () => {
  it('ramps every grade to a mark out of 20', () => {
    expect(onTwenty({ score: 7, outOf: 10 })).toBe(14);
    expect(onTwenty({ score: 15, outOf: 20 })).toBe(15);
    expect(onTwenty({ score: 40, outOf: 50 })).toBe(16);
  });

  it('averages on 20 to one decimal, and has no average without grades', () => {
    expect(averageOnTwenty([{ score: 14, outOf: 20 }, { score: 7, outOf: 10 }, { score: 18, outOf: 20 }])).toBe(15.3);
    expect(averageOnTwenty([])).toBeNull();
  });

  it('groups by subject with the newest first and one average per subject', () => {
    const groups = gradesBySubject([
      grade('m1', 'mathematiques', 10, 20, 1),
      grade('f1', 'francais', 12, 20, 2),
      grade('m2', 'mathematiques', 16, 20, 3),
    ]);
    expect(groups.map((g) => g.subject)).toEqual(['francais', 'mathematiques']);
    expect(groups[1]!.grades.map((g) => g.id)).toEqual(['m2', 'm1']);
    expect(groups[1]!.average).toBe(13);
  });

  it('reads marks with a comma or a point, and rejects the rest', () => {
    expect(parseNumber('14,5')).toBe(14.5);
    expect(parseNumber(' 14.5 ')).toBe(14.5);
    expect(parseNumber('0')).toBe(0);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('-3')).toBeNaN();
  });
});

describe('error messages', () => {
  it('are French and never leak Firebase codes', () => {
    expect(frenchError({ code: 'auth/invalid-credential' })).toBe('E-mail ou mot de passe incorrect.');
    expect(frenchError({ code: 'auth/email-already-in-use' })).toContain('Connectez-vous');
    expect(frenchError({ code: 'permission-denied' })).toBe('Action non autorisée.');
    expect(frenchError(new Error('boom'))).toBe('Une erreur est survenue. Réessayez.');
    expect(frenchError({ code: 'auth/some-new-code' })).not.toContain('auth/');
  });
});
