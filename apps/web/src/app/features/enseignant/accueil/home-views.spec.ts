import type {
  ActivityTypeSummary,
  RepeatedAbsenceDto,
  TeacherSummaryDto,
  TeacherSummaryLessonDto,
  CalendarDayDto,
  EventDto,
  OccurrenceDto,
  PendingGradingDto,
  TimetableOccurrenceDto,
} from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../../../shared/utils/block-state';
import {
  daysBetween,
  dueLabel,
  absenceLine,
  gradingView,
  homeworkView,
  lessonsEmptyText,
  lessonsView,
  progressText,
  ticksLine,
  lateLine,
  lateNotes,
  sectionSnapshot,
  watchView,
} from './home-views';

// 2026-11-10 is a Tuesday; 2026-11-13 a Friday.
const TODAY = '2026-11-10';
const ME = 'teacher-1';

function lesson(start: string, end: string, extra: Partial<TimetableOccurrenceDto> = {}): TimetableOccurrenceDto {
  const values = { date: TODAY, startTime: start, endTime: end, roomId: 'r1', roomName: 'Salle 12', teacherId: ME, teacherName: 'Hany Mansour' };
  return {
    key: `slot-${start}@${TODAY}`,
    slotId: `slot-${start}`,
    originalDate: TODAY,
    status: 'normal',
    current: values,
    original: values,
    changes: [],
    movedTo: null,
    exceptionId: null,
    reason: '',
    classId: 'c1',
    classLabel: 'Première',
    subjectId: 's1',
    subjectName: 'Mathématiques',
    activityType: { code: 'cours', label: 'Cours' } as ActivityTypeSummary,
    division: null,
    groupId: null,
    groupLabel: null,
    canChange: false,
    ...extra,
  };
}

const TYPES = {
  cours: { code: 'cours', label: 'Cours', gradable: false, homework: false, repeatable: true },
  devoir: { code: 'devoir', label: 'Devoir', gradable: false, homework: true, repeatable: false },
  controle: { code: 'controle', label: 'Contrôle', gradable: true, homework: false, repeatable: false },
} as const;

/** A session as the summary gives it (roll call not taken unless said). */
function held(session: TimetableOccurrenceDto, rollCallDone = false): TeacherSummaryLessonDto {
  return { session, rollCallDone };
}

function occurrence(id: string, day: string, kind: keyof typeof TYPES, extra: Partial<EventDto> = {}): OccurrenceDto {
  const event = {
    id,
    title: `Événement ${id}`,
    type: TYPES[kind] as unknown as ActivityTypeSummary,
    classId: 'c1',
    authorId: ME,
    date: day,
    startTime: '08:00',
    endTime: '09:00',
    target: { whole: true, groups: [], studentIds: [], concerned: 27 },
    ...extra,
  } as unknown as EventDto;
  return { key: `${id}@${day}`, day, event };
}

describe('lessonsView', () => {
  it('is null without a lesson', () => {
    expect(lessonsView([], TODAY, '08:00')).toBeNull();
  });

  it('puts the lessons in time order and marks where each stands against the clock', () => {
    const view = lessonsView([held(lesson('14:00', '15:00')), held(lesson('08:00', '09:00')), held(lesson('10:00', '11:00'))], TODAY, '10:30');
    expect(view?.lessons.map((l) => l.phase)).toEqual(['past', 'current', 'upcoming']);
    expect(view?.lessons.map((l) => l.live)).toEqual([false, true, false]);
    expect(view?.lead).toBe('3 cours aujourd’hui');
  });

  it('counts only the lessons that take place, and never highlights a cancelled one', () => {
    const view = lessonsView([held(lesson('08:00', '09:00', { status: 'cancelled' })), held(lesson('10:00', '11:00'))], TODAY, '08:30');
    expect(view?.lessons[0]).toMatchObject({ struck: true, live: false });
    expect(view?.lead).toBe('1 cours aujourd’hui');
    expect(lessonsView([held(lesson('08:00', '09:00', { status: 'cancelled' }))], TODAY, '08:30')?.lead).toBe(
      'Aucun cours n’a lieu aujourd’hui',
    );
  });

  it('says « Appel fait » for a lesson whose roll was taken, never for a cancelled one', () => {
    const view = lessonsView(
      [
        held(lesson('08:00', '09:00'), true),
        held(lesson('09:00', '10:00')),
        held(lesson('10:00', '11:00', { status: 'cancelled' }), true),
      ],
      TODAY,
      '09:30',
    );
    expect(view?.lessons.map((l) => l.rollCallDone)).toEqual([true, false, false]);
  });

  it('ignores sessions of other days', () => {
    const other = lesson('08:00', '09:00');
    const moved = { ...other, current: { ...other.current, date: '2026-11-11' }, original: { ...other.original, date: '2026-11-11' } };
    expect(lessonsView([held(moved)], TODAY, '08:00')).toBeNull();
  });
});

describe('lessonsEmptyText', () => {
  const holiday = { type: 'holiday', label: 'Fête nationale', startsOn: '2026-11-09', endsOn: '2026-11-11' } as CalendarDayDto;
  it('names the holiday, the week-end, or says there is no class', () => {
    expect(lessonsEmptyText([holiday], TODAY)).toBe('Fête nationale. Pas de cours aujourd’hui.');
    expect(lessonsEmptyText([], '2026-11-13')).toContain('week-end');
    expect(lessonsEmptyText([], TODAY)).toBe('Pas de cours aujourd’hui dans votre emploi du temps.');
  });
});

describe('gradingView', () => {
  const math = { classId: 'c1', subjectId: 's1', label: 'Première, Mathématiques' };
  const pending = (id: string, day: string, entered: number, published = false): PendingGradingDto =>
    ({ event: occurrence(id, day, 'controle').event, entered, total: 27, published, outOf: entered ? 20 : null });

  it('is null when nothing is left to finish', () => {
    expect(gradingView([{ choice: math, pending: [] }], TODAY)).toBeNull();
    expect(gradingView([], TODAY)).toBeNull();
  });

  it('lists the newest first with their progress and where to go', () => {
    const view = gradingView([{ choice: math, pending: [pending('a', '2026-11-03', 18), pending('b', '2026-11-09', 0)] }], TODAY);
    expect(view?.items.map((i) => i.eventId)).toEqual(['b', 'a']);
    expect(view?.items[1]).toMatchObject({ progress: '18 / 27', state: 'Brouillon', classId: 'c1', subjectId: 's1' });
    expect(view?.items[0]?.progress).toBe('Aucune note saisie');
    expect(view?.items[1]?.meta).toBe('Première, Mathématiques · Mar. 3 nov.');
  });

  it('says « Prévu » for a planned exam without marks and « Publiée en partie » once some are visible', () => {
    const view = gradingView(
      [{ choice: math, pending: [pending('future', '2026-11-20', 0), pending('shown', '2026-11-05', 20, true)] }],
      TODAY,
    );
    expect(view?.items.map((i) => i.state)).toEqual(['Prévu', 'Publiée en partie']);
  });

  it('shows four and says how many more', () => {
    const many = ['01', '02', '03', '04', '05', '06'].map((d) => pending(`e${d}`, `2026-11-${d}`, 5));
    const view = gradingView([{ choice: math, pending: many }], TODAY);
    expect(view?.items).toHaveLength(4);
    expect(view).toMatchObject({ total: 6, more: 'et 2 autres' });
    expect(gradingView([{ choice: math, pending: many.slice(0, 2) }], TODAY)?.more).toBe('');
  });

  it('progressText', () => {
    expect(progressText({ entered: 0, total: 27 })).toBe('Aucune note saisie');
    expect(progressText({ entered: 27, total: 27 })).toBe('27 / 27');
  });
});

describe('homework given', () => {
  it('writes how many students ticked it', () => {
    expect(ticksLine(12, 27)).toBe('12 élèves sur 27 l’ont fait');
    expect(ticksLine(1, 27)).toBe('1 élève sur 27 l’a fait');
    expect(ticksLine(0, 27)).toBe('Aucun élève sur 27 ne l’a fait');
    expect(ticksLine(3, null)).toBe('3 élèves l’ont fait');
    expect(ticksLine(0, null)).toBe('Personne ne l’a encore fait');
  });

  it('is null without homework and labels the due day', () => {
    expect(homeworkView([])).toBeNull();
    expect(homeworkView([{ occurrence: occurrence('a', TODAY, 'devoir'), done: 0 }])).toHaveLength(1);
    expect(dueLabel(TODAY, TODAY)).toBe('Aujourd’hui');
    expect(dueLabel('2026-11-11', TODAY)).toBe('Demain');
    expect(dueLabel('2026-11-15', TODAY)).toBe('Dim. 15 nov.');
  });
});

describe('what to watch', () => {
    const math = { classId: 'c1', subjectId: 's1', label: 'Première, Mathématiques' };
  const pending = (id: string, day: string, entered: number): PendingGradingDto => ({
    event: occurrence(id, day, 'controle').event,
    entered,
    total: 27,
    published: false,
    outOf: entered ? 20 : null,
  });

  it('lists the notes still unfinished a week after the work, the oldest first, three at most', () => {
    const entries = [
      {
        choice: math,
        pending: [
          pending('recent', '2026-11-05', 4),
          pending('old', '2026-10-20', 18),
          pending('older', '2026-10-01', 0),
          pending('edge', '2026-11-03', 27),
          pending('another', '2026-10-25', 2),
        ],
      },
    ];
    const late = lateNotes(entries, TODAY);
    expect(late.map((n) => n.eventId)).toEqual(['older', 'old', 'another']);
    expect(late[1]).toMatchObject({ progress: '18 / 27', classId: 'c1', subjectId: 's1', daysAgo: 21 });
    expect(late[0]?.progress).toBe('Aucune note saisie');
    expect(lateLine(late[1]!)).toBe('18 / 27, donnée il y a 21 jours');
    // Exactly seven days ago counts, six does not.
    expect(lateNotes([{ choice: math, pending: [pending('seven', '2026-11-03', 1), pending('six', '2026-11-04', 1)] }], TODAY).map((n) => n.eventId)).toEqual(['seven']);
    expect(lateNotes([], TODAY)).toEqual([]);
  });

  it('counts days between two calendar days', () => {
    expect(daysBetween('2026-11-10', '2026-11-10')).toBe(0);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(lateLine({ progress: '3 / 27', daysAgo: 1 })).toBe('3 / 27, donnée il y a 1 jour');
  });

  it('shows the students often absent, three at most, with their days', () => {
    const absence = (id: string, days: number): RepeatedAbsenceDto => ({
      studentId: id,
      firstName: 'Élève',
      lastName: id,
      classId: 'c1',
      classLabel: 'Première',
      days,
      lastDay: '2026-11-09',
    });
    const view = watchView([], [], [absence('a', 5), absence('b', 4), absence('c', 3), absence('d', 3)]);
    expect(view?.absences.map((a) => a.studentId)).toEqual(['a', 'b', 'c']);
    expect(absenceLine(absence('a', 5))).toBe('5 jours d’absence sur 30 jours, dernière le Lun. 9 nov.');
    expect(absenceLine(absence('a', 1))).toContain('1 jour d’absence');
  });

  it('is null when there is nothing to watch', () => {
    expect(watchView([], [])).toBeNull();
    const late = lateNotes([{ choice: math, pending: [pending('old', '2026-10-20', 3)] }], TODAY);
    expect(watchView(late, [])?.late).toHaveLength(1);
    expect(watchView([], [occurrence('t', '2026-11-12', 'controle')])?.tests).toHaveLength(1);
  });
});

describe('sectionSnapshot', () => {
  const summary = (failed: TeacherSummaryDto['failed']): TeacherSummaryDto =>
    ({ today: TODAY, failed, classes: [], lessons: [], calendarDays: [], pending: [], homework: [], tests: [], absences: [] }) satisfies TeacherSummaryDto;
  const of = (error: unknown, value?: TeacherSummaryDto): Snapshot<TeacherSummaryDto> => ({ error, value });

  it('loads until the summary is there', () => {
    expect(sectionSnapshot(of(undefined), ['pending'], (s) => s.pending)).toEqual({ error: undefined, value: undefined });
  });
  it('is the request’s error when the whole call failed', () => {
    const error = new Error('down');
    expect(sectionSnapshot(of(error), ['pending'], (s) => s.pending).error).toBe(error);
  });
  it('is an error only for a block that uses a failed section', () => {
    const value = summary(['homework']);
    expect(sectionSnapshot(of(undefined, value), ['homework'], (s) => s.homework).error).toBeInstanceOf(Error);
    expect(sectionSnapshot(of(undefined, value), ['pending', 'homework'], (s) => s.pending).error).toBeInstanceOf(Error);
    expect(sectionSnapshot(of(undefined, value), ['pending'], (s) => s.pending)).toEqual({ error: undefined, value: [] });
  });
});
