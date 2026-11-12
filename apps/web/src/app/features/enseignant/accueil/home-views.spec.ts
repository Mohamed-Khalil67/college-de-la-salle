import type {
  ActivityTypeSummary,
  CalendarDayDto,
  EventDto,
  OccurrenceDto,
  PendingGradingDto,
  TimetableOccurrenceDto,
} from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import type { ClassSubjectChoice } from '../noter/noter-logic';
import {
  daysBetween,
  dueLabel,
  givenHomework,
  gradingView,
  homeworkView,
  lessonsEmptyText,
  lessonsView,
  progressText,
  ticksLine,
  lateLine,
  lateNotes,
  upcomingTests,
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
    const view = lessonsView([lesson('14:00', '15:00'), lesson('08:00', '09:00'), lesson('10:00', '11:00')], TODAY, '10:30');
    expect(view?.lessons.map((l) => l.phase)).toEqual(['past', 'current', 'upcoming']);
    expect(view?.lessons.map((l) => l.live)).toEqual([false, true, false]);
    expect(view?.lead).toBe('3 cours aujourd’hui');
  });

  it('counts only the lessons that take place, and never highlights a cancelled one', () => {
    const view = lessonsView([lesson('08:00', '09:00', { status: 'cancelled' }), lesson('10:00', '11:00')], TODAY, '08:30');
    expect(view?.lessons[0]).toMatchObject({ struck: true, live: false });
    expect(view?.lead).toBe('1 cours aujourd’hui');
    expect(lessonsView([lesson('08:00', '09:00', { status: 'cancelled' })], TODAY, '08:30')?.lead).toBe(
      'Aucun cours n’a lieu aujourd’hui',
    );
  });

  it('ignores sessions of other days', () => {
    const other = lesson('08:00', '09:00');
    const moved = { ...other, current: { ...other.current, date: '2026-11-11' }, original: { ...other.original, date: '2026-11-11' } };
    expect(lessonsView([moved], TODAY, '08:00')).toBeNull();
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
  const math: ClassSubjectChoice = { key: 'c1|s1', classId: 'c1', subjectId: 's1', classLabel: 'Première', label: 'Première, Mathématiques' };
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
  it('keeps the teacher’s own homework due from today on, soonest first, four at most', () => {
    const list = [
      occurrence('late', '2026-11-20', 'devoir'),
      occurrence('old', '2026-11-09', 'devoir'),
      occurrence('other', '2026-11-11', 'devoir', { authorId: 'teacher-2' }),
      occurrence('lesson', '2026-11-11', 'cours'),
      occurrence('far', '2026-12-20', 'devoir'),
      occurrence('soon', '2026-11-11', 'devoir'),
      occurrence('today', TODAY, 'devoir'),
    ];
    expect(givenHomework(list, ME, TODAY).map((o) => o.event.id)).toEqual(['today', 'soon', 'late']);
    const five = ['11', '12', '13', '14', '15'].map((d) => occurrence(`h${d}`, `2026-11-${d}`, 'devoir'));
    expect(givenHomework(five, ME, TODAY)).toHaveLength(4);
  });

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
  const classes = new Set(['c1']);
  const math: ClassSubjectChoice = { key: 'c1|s1', classId: 'c1', subjectId: 's1', classLabel: 'Première', label: 'Première, Mathématiques' };
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

  it('lists the exams of my classes in the next two weeks, soonest first', () => {
    const list = [
      occurrence('later', '2026-11-23', 'controle'),
      occurrence('soon', '2026-11-12', 'controle', { authorId: 'planner' }),
      occurrence('past', '2026-11-09', 'controle'),
      occurrence('far', '2026-12-30', 'controle'),
      occurrence('lesson', '2026-11-12', 'cours'),
      occurrence('other', '2026-11-12', 'controle', { classId: 'c9' }),
    ];
    expect(upcomingTests(list, classes, TODAY).map((o) => o.event.id)).toEqual(['soon', 'later']);
    expect(upcomingTests(list, classes, TODAY, 1)).toHaveLength(1);
  });

  it('is null when there is nothing to watch', () => {
    expect(watchView([], [])).toBeNull();
    const late = lateNotes([{ choice: math, pending: [pending('old', '2026-10-20', 3)] }], TODAY);
    expect(watchView(late, [])?.late).toHaveLength(1);
    expect(watchView([], [occurrence('t', '2026-11-12', 'controle')])?.tests).toHaveLength(1);
  });
});
