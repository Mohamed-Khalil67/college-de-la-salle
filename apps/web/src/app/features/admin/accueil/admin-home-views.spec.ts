import type {
  ClassDto,
  ContactMessageDto,
  Paginated,
  PeriodDto,
  PostDto,
  ReportPreparationDto,
  SchoolYearDto,
  SectionChangeRequestDto,
  UserDto,
} from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { blockState, bothOf, LOADING, type Snapshot } from '../../../shared/utils/block-state';
import {
  approvalsView,
  classesView,
  messagesView,
  newsView,
  reportsView,
  rolesView,
  yearView,
} from './admin-home-views';

/**
 * Each block of the administration's home in its four states (loading, error, empty, data), as the block
 * computes them: `blockState` over its sources, then its view.
 */

const TODAY = '2026-11-12';
const failure = new Error('Le serveur ne répond pas.');
const page = <T>(items: readonly T[], total = items.length): Paginated<T> => ({ items, total, page: 1, pageSize: 3 });
const ready = <T>(value: T): Snapshot<T> => ({ error: undefined, value });
const broken: Snapshot<never> = { error: failure, value: undefined };

const request = (id: string): SectionChangeRequestDto =>
  ({
    id,
    studentFirstName: 'Nour',
    studentLastName: 'Haddad',
    fromSection: 'bac',
    toSection: 'nationale',
  }) as SectionChangeRequestDto;
const message = (id: string): ContactMessageDto => ({ id, name: 'Mme Karam', subject: 'Inscription' }) as ContactMessageDto;
const klass = (id: string, studentCount: number): ClassDto => ({ id, studentCount }) as ClassDto;
const user = (first: string): UserDto => ({ firstName: first, lastName: 'Samir' }) as UserDto;
const post = (id: string): PostDto => ({ id, title: 'Rentrée' }) as PostDto;
const term = (over: Partial<PeriodDto> = {}): PeriodDto =>
  ({ id: 'p1', label: 'Trimestre 1', startsOn: '2026-09-01', endsOn: '2026-12-18', closedAt: null, ...over }) as PeriodDto;

describe('À valider', () => {
  const state = (requests: Snapshot<Paginated<SectionChangeRequestDto>>, never: Snapshot<number | null>) =>
    blockState(bothOf(requests, never), ([r, n]) => approvalsView(r, n));

  it('loads, fails, is empty, then lists the requests', () => {
    expect(state(LOADING, ready(0)).status).toBe('loading');
    expect(state(broken, ready(0)).status).toBe('error');
    expect(state(ready(page([])), ready(0)).status).toBe('empty');
    const s = state(ready(page([request('r1')], 4)), ready(2));
    expect(s).toMatchObject({ status: 'ready', data: { pending: 4, neverActivated: 2 } });
    if (s.status === 'ready') expect(s.data.lines[0]).toEqual({ id: 'r1', student: 'Nour Haddad', change: 'Bac français vers Bac nationale' });
  });

  it('keeps three lines at most, and shows the block for accounts alone', () => {
    const many = approvalsView(page([request('1'), request('2'), request('3'), request('4')], 4), null);
    expect(many?.lines).toHaveLength(3);
    expect(approvalsView(page([]), 5)?.pending).toBe(0);
    expect(approvalsView(page([]), null)).toBeNull();
  });
});

describe('Messages', () => {
  it('has its four states', () => {
    expect(blockState(LOADING, messagesView).status).toBe('loading');
    expect(blockState(broken, messagesView).status).toBe('error');
    expect(blockState(ready(page<ContactMessageDto>([])), messagesView).status).toBe('empty');
    const s = blockState(ready(page([message('m1'), message('m2')], 7)), messagesView);
    expect(s).toMatchObject({ status: 'ready', data: { waiting: 7 } });
  });
});

describe('Classes', () => {
  it('has its four states', () => {
    const state = (classes: Snapshot<readonly ClassDto[]>, students: Snapshot<number | null>) =>
      blockState(bothOf(classes, students), ([c, n]) => classesView(c, n));
    expect(state(LOADING, ready(0)).status).toBe('loading');
    expect(state(broken, ready(0)).status).toBe('error');
    expect(state(ready([]), ready(0)).status).toBe('empty');
    expect(state(ready([klass('a', 25), klass('b', 28)]), ready(60)).status).toBe('ready');
  });

  it('averages the class sizes and counts the students no class holds', () => {
    expect(classesView([klass('a', 25), klass('b', 28)], 60)).toEqual({ classCount: 2, averageSize: 27, withoutClass: 7 });
    expect(classesView([klass('a', 25)], 20)?.withoutClass).toBe(0);
    expect(classesView([klass('a', 25)], null)?.withoutClass).toBeNull();
  });
});

describe('Bulletins', () => {
  const prep = (over: Partial<ReportPreparationDto> = {}): ReportPreparationDto => ({
    period: term(),
    classes: [
      {
        classId: 'c1',
        label: '1re',
        sectionCode: 'bac',
        studentCount: 27,
        subjectCount: 3,
        complete: false,
        cardsGenerated: 0,
        cardsPublished: 0,
        gaps: [
          { subjectId: 'm', subjectName: 'Maths', reason: 'incomplete', entered: 18, total: 27, teachers: [{ teacherId: 't1', name: 'Hany Mansour' }] },
          { subjectId: 'p', subjectName: 'Physique', reason: 'no_grades', entered: 0, total: 0, teachers: [{ teacherId: 't1', name: 'Hany Mansour' }, { teacherId: 't2', name: 'Ali Aziz' }] },
        ],
      },
    ],
    classCount: 1,
    completeClassCount: 0,
    subjectCount: 3,
    readySubjectCount: 1,
    lateTeacherCount: 2,
    ...over,
  });
  const state = (snapshot: Snapshot<ReportPreparationDto | null>) => blockState(snapshot, (p) => reportsView(p, TODAY));

  it('has its four states, « no term today » being the empty one', () => {
    expect(state(LOADING).status).toBe('loading');
    expect(state(broken).status).toBe('error');
    expect(state(ready(null)).status).toBe('empty');
    expect(state(ready(prep({ classes: [], classCount: 0 }))).status).toBe('empty');
    expect(state(ready(prep())).status).toBe('ready');
  });

  it('gives the progress, the closing date and the teachers most behind first', () => {
    const v = reportsView(prep(), TODAY);
    expect(v).toMatchObject({ readyPercent: 33, readySubjects: 1, subjectCount: 3, daysLeft: 36, closed: false, lateTeacherCount: 2 });
    expect(v?.lateTeachers.map((t) => [t.name, t.count])).toEqual([['Hany Mansour', 2], ['Ali Aziz', 1]]);
  });

  it('knows a closed term, and never counts down below zero', () => {
    const v = reportsView(prep({ period: term({ closedAt: '2026-12-19T10:00:00Z', endsOn: '2026-11-01' }) }), TODAY);
    expect(v).toMatchObject({ closed: true, daysLeft: 0 });
  });

  it('does not divide by zero without subjects', () => {
    expect(reportsView(prep({ subjectCount: 0, readySubjectCount: 0 }), TODAY)?.readyPercent).toBe(0);
  });
});

describe('Rôles', () => {
  it('lists the planners and counts the administrators', () => {
    const v = rolesView(page([user('Ingy'), user('Sara')], 6), 2);
    expect(v).toEqual({ planners: ['Ingy Samir', 'Sara Samir'], plannerCount: 6, adminCount: 2 });
    expect(rolesView(page([]), null)).toEqual({ planners: [], plannerCount: 0, adminCount: null });
  });

  it('has its loading and error states', () => {
    const state = (a: Snapshot<Paginated<UserDto>>) => blockState(bothOf(a, ready<number | null>(1)), ([p, n]) => rolesView(p, n));
    expect(state(LOADING).status).toBe('loading');
    expect(state(broken).status).toBe('error');
    expect(state(ready(page([]))).status).toBe('ready');
  });
});

describe('Année scolaire', () => {
  const year = (over: Partial<SchoolYearDto> = {}): SchoolYearDto =>
    ({ id: 'y1', label: '2026-2027', startsOn: '2026-09-01', endsOn: '2027-06-30', isCurrent: true, status: 'current', periods: [term()], ...over }) as SchoolYearDto;
  const state = (s: Snapshot<readonly SchoolYearDto[]>) => blockState(s, (years) => yearView(years, TODAY));

  it('has its four states', () => {
    expect(state(LOADING).status).toBe('loading');
    expect(state(broken).status).toBe('error');
    expect(state(ready([])).status).toBe('empty');
    expect(state(ready([year()])).status).toBe('ready');
  });

  it('gives the term of today, the days left and the year being prepared', () => {
    const next = year({ id: 'y2', label: '2027-2028', isCurrent: false, status: 'upcoming', startsOn: '2027-09-01', periods: [] });
    const v = yearView([year(), next], TODAY);
    expect(v?.term?.label).toBe('Trimestre 1');
    expect(v?.daysLeft).toBe(230);
    expect(v?.next?.label).toBe('2027-2028');
    expect(yearView([year()], TODAY)?.next).toBeNull();
  });
});

describe('Annonces', () => {
  it('has its four states and keeps the two latest', () => {
    expect(blockState(LOADING, newsView).status).toBe('loading');
    expect(blockState(broken, newsView).status).toBe('error');
    expect(blockState(ready(page<PostDto>([])), newsView).status).toBe('empty');
    const s = blockState(ready(page([post('a'), post('b'), post('c')])), newsView);
    expect(s.status === 'ready' && s.data.length).toBe(2);
  });
});
