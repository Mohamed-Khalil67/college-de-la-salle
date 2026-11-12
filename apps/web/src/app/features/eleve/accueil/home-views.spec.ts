import type {
  ActivityTypeSummary,
  EventDto,
  HomeworkDto,
  OccurrenceDto,
  ReportCardDto,
  StudentAttendanceDto,
  StudentGradesDto,
} from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { blockState, bothOf, LOADING, type Snapshot } from '../../../shared/utils/block-state';
import { absencesView, gradesView, todoView } from './home-views';

/**
 * Each block of the student's home in its four states (loading, error, empty, data), as the block
 * computes them: `blockState` over its sources, then its view.
 */

const TODAY = '2026-11-10';
const failure = new Error('Le serveur ne répond pas.');

const type = (code: string, flags: Partial<ActivityTypeSummary> = {}): ActivityTypeSummary => ({
  id: `type-${code}`,
  code,
  label: code,
  colour: 'navy',
  icon: 'book',
  gradable: false,
  repeatable: false,
  homework: false,
  ...flags,
});
const DEVOIR = type('devoir', { homework: true, gradable: true });
const CONTROLE = type('controle', { gradable: true });
const COURS = type('cours', { repeatable: true });

function event(id: string, date: string, kind: ActivityTypeSummary): EventDto {
  return {
    id,
    activityTypeId: kind.id,
    type: kind,
    title: id,
    subjectId: 'mathematiques',
    classId: 'c1',
    sectionId: null,
    date,
    startTime: '08:00',
    endTime: '09:00',
    repeatUntil: null,
    roomId: null,
    roomName: null,
    place: '',
    periodId: null,
    description: '',
    attachments: [],
    coefficient: 1,
    target: { whole: true, groups: [], studentIds: [], concerned: null },
    authorId: 't1',
    authorName: 'Hany Mansour',
    createdAt: `${date}T08:00:00Z`,
    updatedAt: `${date}T08:00:00Z`,
  };
}
const hw = (id: string, date: string, done = false): HomeworkDto => ({ event: event(id, date, DEVOIR), done, doneAt: null });
const occ = (id: string, day: string, kind: ActivityTypeSummary): OccurrenceDto => ({ key: `${id}@${day}`, day, event: event(id, day, kind) });

describe('À faire', () => {
  const view = ([homework, events]: readonly [readonly HomeworkDto[], readonly OccurrenceDto[]]) => todoView(homework, events, TODAY);

  it('loads until both the homework and the tests are there', () => {
    expect(blockState(bothOf({ error: undefined, value: [hw('a', TODAY)] }, LOADING), view)).toEqual({ status: 'loading' });
  });
  it('shows the error of either list', () => {
    const down: Snapshot<readonly OccurrenceDto[]> = { error: failure, value: undefined };
    expect(blockState(bothOf<readonly HomeworkDto[], readonly OccurrenceDto[]>(LOADING, down), view)).toEqual({ status: 'error', error: failure });
  });
  it('is empty with nothing due and no test in the next two weeks', () => {
    const later = [hw('far', '2026-12-20')];
    const events = [occ('cours', TODAY, COURS), occ('far-test', '2026-12-01', CONTROLE)];
    expect(blockState({ error: undefined, value: [later, events] as const }, view)).toEqual({ status: 'empty' });
  });
  it('lists the next homework by due date, done ones kept in place, and the next tests', () => {
    const homework = [hw('c', '2026-11-14'), hw('a', TODAY, true), hw('b', '2026-11-12'), hw('old', '2026-11-01'), hw('d', '2026-11-15'), hw('e', '2026-11-16')];
    const events = [occ('t2', '2026-11-18', CONTROLE), occ('t1', '2026-11-11', CONTROLE), occ('lesson', '2026-11-11', COURS), occ('due', '2026-11-11', DEVOIR)];
    const state = blockState({ error: undefined, value: [homework, events] as const }, view);
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.data.homework.map((h) => h.event.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(state.data.tests.map((t) => t.event.id)).toEqual(['t1', 't2']);
  });
});

describe('Notes', () => {
  const grade = (id: string, date: string) => ({
    grade: { id, eventId: id, studentId: 's', score: 15, outOf: 20, comment: '', published: true, updatedAt: `${date}T10:00:00Z` },
    event: { id, type: CONTROLE, title: id, date, subjectId: 'mathematiques', coefficient: 1, periodId: 't1' },
  });
  const grades: StudentGradesDto = {
    studentId: 's',
    subjects: [
      { subjectId: 'mathematiques', average: 15, coefficient: 3, grades: [grade('a', '2026-10-01'), grade('b', '2026-10-15')] },
      { subjectId: 'francais', average: 11, coefficient: 1, grades: [grade('c', '2026-10-20'), grade('d', '2026-09-20')] },
    ],
  };
  const noGrades: StudentGradesDto = { studentId: 's', subjects: [] };
  const card = (periodId: string, publishedAt: string | null): ReportCardDto => ({
    id: `rc-${periodId}`,
    studentId: 's',
    studentName: 'Nadia Fawzy',
    periodId,
    classId: 'c1',
    average: 14,
    rank: null,
    appreciation: '',
    subjects: [],
    generatedAt: '2026-11-01T10:00:00Z',
    publishedAt,
  });
  const view = (data: StudentGradesDto, cards: readonly ReportCardDto[] = []) => gradesView(data, cards, 't1');

  it('loads, then fails with its own error', () => {
    expect(blockState(LOADING, view)).toEqual({ status: 'loading' });
    expect(blockState({ error: failure, value: undefined }, view)).toEqual({ status: 'error', error: failure });
  });
  it('is empty before the first published grade', () => {
    expect(blockState({ error: undefined, value: noGrades }, view)).toEqual({ status: 'empty' });
  });
  it('gives the weighted overall average and the three latest grades', () => {
    const state = blockState({ error: undefined, value: grades }, view);
    expect(state.status === 'ready' && state.data).toEqual({
      overall: 14,
      latest: [grades.subjects[1]!.grades[0], grades.subjects[0]!.grades[1], grades.subjects[0]!.grades[0]],
      reportCardPublished: false,
    });
  });
  it('says « Bulletin publié » only for a published card of the term', () => {
    expect(view(grades, [card('t1', null)])?.reportCardPublished).toBe(false);
    expect(view(grades, [card('t0', '2026-07-01T10:00:00Z')])?.reportCardPublished).toBe(false);
    expect(view(grades, [card('t1', '2026-11-05T10:00:00Z')])?.reportCardPublished).toBe(true);
    // A published card shows even before any grade of the term is listed.
    expect(view(noGrades, [card('t1', '2026-11-05T10:00:00Z')])).toEqual({ overall: null, latest: [], reportCardPublished: true });
  });
});

describe('Absences', () => {
  const record = (id: string, date: string, status: StudentAttendanceDto['record']['status']): StudentAttendanceDto => ({
    record: { id, eventId: 'e', studentId: 's', date, status, minutesLate: status === 'late' ? 10 : null, note: '' },
    event: { id: 'e', type: COURS, title: 'Mathématiques', subjectId: 'mathematiques', startTime: '08:00', endTime: '09:00' },
  });

  it('loads, then fails with its own error', () => {
    expect(blockState(LOADING, absencesView)).toEqual({ status: 'loading' });
    expect(blockState({ error: failure, value: undefined }, absencesView)).toEqual({ status: 'error', error: failure });
  });
  it('is empty without absence or late arrival this term', () => {
    expect(blockState({ error: undefined, value: [] }, absencesView)).toEqual({ status: 'empty' });
    expect(blockState({ error: undefined, value: [record('p', TODAY, 'present')] }, absencesView)).toEqual({ status: 'empty' });
  });
  it('counts absences (excused included) and late arrivals, and gives the latest', () => {
    const list = [record('a', '2026-10-01', 'absent'), record('b', '2026-11-03', 'late'), record('c', '2026-10-20', 'excused')];
    const state = blockState({ error: undefined, value: list }, absencesView);
    expect(state.status === 'ready' && state.data).toEqual({ absences: 2, late: 1, latest: list[1] });
  });
});
