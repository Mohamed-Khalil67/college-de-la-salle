import type { ReportGapDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { canRemind, gapDetail, reminderMessage, teachersText } from './preparation-logic';

const gap = (over: Partial<ReportGapDto> = {}): ReportGapDto => ({
  subjectId: 'maths',
  subjectName: 'Mathématiques',
  reason: 'incomplete',
  entered: 18,
  total: 27,
  teachers: [{ teacherId: 't1', name: 'Hany Mansour' }],
  ...over,
});

describe('gapDetail', () => {
  it('says what is missing for each reason', () => {
    expect(gapDetail(gap())).toBe('18 / 27 notes saisies');
    expect(gapDetail(gap({ reason: 'no_grades', entered: 0, total: 0 }))).toBe('aucune note saisie');
    expect(gapDetail(gap({ reason: 'unpublished' }))).toBe('notes à publier aux élèves');
    expect(gapDetail(gap({ total: 0 }))).toBe('notes à saisir');
  });
});

describe('teachersText', () => {
  it('names the teachers, or says nobody is assigned', () => {
    expect(teachersText(gap())).toBe('Hany Mansour');
    expect(teachersText(gap({ teachers: [{ teacherId: 'a', name: 'A B' }, { teacherId: 'b', name: 'C D' }] }))).toBe('A B, C D');
    expect(teachersText(gap({ teachers: [] }))).toBe('aucun enseignant affecté');
  });
});

describe('canRemind', () => {
  it('needs an open term and a subject to finish that somebody teaches', () => {
    expect(canRemind([{ gaps: [gap()] }], false)).toBe(true);
    expect(canRemind([{ gaps: [gap()] }], true)).toBe(false);
    expect(canRemind([{ gaps: [] }], false)).toBe(false);
    expect(canRemind([{ gaps: [gap({ teachers: [] })] }], false)).toBe(false);
    expect(canRemind([], false)).toBe(false);
  });
});

describe('reminderMessage', () => {
  const result = { teachers: 0, notified: 0, alreadyReminded: 0, unreachable: 0, withoutTeacher: 0 };

  it('counts the teachers reminded', () => {
    expect(reminderMessage({ ...result, teachers: 1, notified: 1 })).toBe('1 enseignant relancé.');
    expect(reminderMessage({ ...result, teachers: 3, notified: 3 })).toBe('3 enseignants relancés.');
  });

  it('says who was left alone, and why', () => {
    expect(reminderMessage({ ...result, teachers: 3, notified: 2, alreadyReminded: 1 })).toBe(
      '2 enseignants relancés. 1 autre a déjà été relancé il y a moins de 12 heures.',
    );
    expect(reminderMessage({ ...result, teachers: 2, alreadyReminded: 2 })).toContain('Réessayez plus tard.');
  });

  it('says when a teacher could not be reached, instead of « tout est prêt »', () => {
    expect(reminderMessage({ ...result, teachers: 1, notified: 1, unreachable: 1 })).toBe(
      '1 enseignant relancé. 1 enseignant n’a pas pu être joint : compte désactivé ou archivé.',
    );
    expect(reminderMessage({ ...result, unreachable: 1 })).toContain('n’a pas pu être joint');
  });

  it('points at subjects nobody teaches', () => {
    expect(reminderMessage({ ...result, withoutTeacher: 2 })).toContain('2 matières n’ont aucun enseignant affecté');
  });

  it('says so when nothing is left to do', () => {
    expect(reminderMessage(result)).toBe('Aucun enseignant à relancer : tout est prêt.');
  });
});
