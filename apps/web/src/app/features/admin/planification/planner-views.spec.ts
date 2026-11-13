import { describe, expect, it } from 'vitest';
import type {
  CalendarDayDto,
  PlannerChangeDto,
  PlannerClassCoverageDto,
  PlannerTimetablesDto,
  SchoolYearDto,
  TimetableWarningDto,
} from '@cdls/shared';
import { blockState } from '../../../shared/utils/block-state';
import {
  changesView,
  changeSummary,
  dateRangeText,
  fixView,
  freeUntilText,
  roomsView,
  timetablesView,
  yearView,
} from './planner-views';

const cls = (label: string, missing: number): PlannerClassCoverageDto => ({
  classId: label,
  label,
  expectedHours: 10,
  placedHours: 10 - missing,
  missing: missing ? [{ subjectName: 'Maths', missingHours: missing }] : [],
  complete: missing === 0,
});
const timetables = (...classes: PlannerClassCoverageDto[]): PlannerTimetablesDto => ({
  yearLabel: '2026-2027',
  classes,
  teachersPlaced: 3,
  teachersTotal: 4,
});
const warning = (message: string): TimetableWarningDto => ({
  code: 'room_capacity',
  slotId: 's',
  date: '2026-11-15',
  message,
});
const change = (over: Partial<PlannerChangeDto>): PlannerChangeDto => ({
  slotId: 's',
  date: '2026-11-15',
  kind: 'cancelled',
  classLabel: '1ère A',
  subjectName: 'Maths',
  startTime: '08:00',
  endTime: '09:00',
  teacherName: 'Hany Mansour',
  coverName: null,
  roomName: 'B12',
  reason: '',
  movedFrom: null,
  notified: true,
  ...over,
});

describe('fixView', () => {
  it('is empty when nothing needs the planner', () => {
    expect(fixView([], timetables(cls('A', 0)))).toBeNull();
    expect(fixView([], null)).toBeNull();
  });
  it('lists the first warnings and the incomplete classes, the most behind first', () => {
    const view = fixView(
      [1, 2, 3, 4, 5].map((n) => warning(`w${n}`)),
      timetables(cls('A', 1), cls('B', 4), cls('C', 0)),
    )!;
    expect(view.warnings).toHaveLength(4);
    expect(view.more).toBe(1);
    expect(view.warningCount).toBe(5);
    expect(view.incomplete.map((c) => c.label)).toEqual(['B', 'A']);
    expect(view.incompleteCount).toBe(2);
    expect(view.warnings[0]).toEqual({ label: 'Salle trop petite', message: 'w1' });
  });
  it('shows the incomplete classes even when the summary is the only thing to fix', () => {
    expect(fixView([], timetables(cls('A', 2)))?.warningCount).toBe(0);
  });
  it('goes through the four block states', () => {
    expect(blockState({ error: undefined, value: undefined }, () => null).status).toBe('loading');
    expect(blockState({ error: new Error('x'), value: undefined }, () => null).status).toBe(
      'error',
    );
    expect(
      blockState({ error: undefined, value: [] as TimetableWarningDto[] }, (w) => fixView(w, null))
        .status,
    ).toBe('empty');
    expect(
      blockState({ error: undefined, value: [warning('w')] }, (w) => fixView(w, null)).status,
    ).toBe('ready');
  });
});

describe('changesView', () => {
  it('is empty without changes', () => {
    expect(changesView({ date: '2026-11-15', changes: [] })).toBeNull();
  });
  it('counts each kind and the changes nobody was told about', () => {
    const view = changesView({
      date: '2026-11-15',
      changes: [
        change({}),
        change({ kind: 'substitute', coverName: 'Ingy Samir' }),
        change({ kind: 'study', coverName: 'Ingy Samir', notified: false }),
        change({ kind: 'room_change' }),
        change({ kind: 'moved' }),
        change({}),
        change({}),
      ],
    })!;
    expect([view.toCover, view.covered, view.study, view.roomChanges, view.moved]).toEqual([
      3, 1, 1, 1, 1,
    ]);
    expect(view.untold).toBe(1);
    expect(view.shown).toHaveLength(5);
    expect(view.more).toBe(2);
  });
  it('says what became of each lesson', () => {
    expect(changeSummary(change({}))).toContain('Annulée');
    expect(changeSummary(change({ kind: 'substitute', coverName: 'Ingy Samir' }))).toBe(
      'Remplacée par Ingy Samir',
    );
    expect(changeSummary(change({ kind: 'study', coverName: 'Ingy Samir' }))).toBe(
      'Étude surveillée par Ingy Samir',
    );
    expect(changeSummary(change({ kind: 'room_change' }))).toBe('Salle changée, B12');
    expect(changeSummary(change({ kind: 'moved' }))).toBe('Déplacée');
    expect(
      changeSummary(
        change({
          kind: 'moved',
          movedFrom: { date: '2026-11-03', startTime: '08:00', endTime: '09:00' },
        }),
      ),
    ).toBe('Déplacée. Avant : Mar. 3 nov., 8 h 00 – 9 h 00');
  });
});

describe('roomsView', () => {
  it('is empty without active rooms', () => {
    expect(roomsView({ date: '2026-11-15', time: '09:00', free: [], total: 0 })).toBeNull();
  });
  it('keeps the first rooms and counts the rest; a school with no free room is still a view', () => {
    const rooms = Array.from({ length: 8 }, (_, i) => ({
      id: `r${i}`,
      name: `S${i}`,
      kind: 'classroom' as const,
      capacity: 30,
      freeUntil: null,
    }));
    const view = roomsView({ date: '2026-11-15', time: '09:00', free: rooms, total: 10 })!;
    expect(view).toMatchObject({ free: 8, total: 10, more: 2 });
    expect(roomsView({ date: '2026-11-15', time: '09:00', free: [], total: 10 })).toMatchObject({
      free: 0,
      shown: [],
    });
  });
  it('words the time a room stays free', () => {
    expect(freeUntilText('11:15')).toBe('libre jusqu’à 11 h 15');
    expect(freeUntilText('09:00')).toBe('libre jusqu’à 9 h');
    expect(freeUntilText(null)).toBe('libre jusqu’à la fin de la journée');
  });
});

describe('yearView', () => {
  const year: SchoolYearDto = {
    id: 'y',
    label: '2026-2027',
    startsOn: '2026-09-01',
    endsOn: '2027-06-30',
    isCurrent: true,
    status: 'current',
    archivedAt: null,
    periods: [
      {
        id: 'p2',
        schoolYearId: 'y',
        kind: 'trimester',
        sectionId: null,
        number: 2,
        label: 'Trimestre 2',
        startsOn: '2027-01-01',
        endsOn: '2027-03-31',
        closedAt: null,
      },
      {
        id: 'p1',
        schoolYearId: 'y',
        kind: 'trimester',
        sectionId: null,
        number: 1,
        label: 'Trimestre 1',
        startsOn: '2026-09-01',
        endsOn: '2026-12-31',
        closedAt: null,
      },
    ],
  };
  const day = (
    id: string,
    type: CalendarDayDto['type'],
    startsOn: string,
    endsOn: string,
  ): CalendarDayDto => ({
    id,
    schoolYearId: 'y',
    type,
    label: id,
    startsOn,
    endsOn,
    sectionId: null,
    classIds: [],
  });
  it('is empty without a year', () => {
    expect(yearView(null, [], '2026-11-15')).toBeNull();
  });
  it('marks the terms and lists the next exam weeks and holidays', () => {
    const view = yearView(
      year,
      [
        day('old', 'holiday', '2026-10-01', '2026-10-02'),
        day('exam', 'exam_week', '2026-12-10', '2026-12-17'),
        day('winter', 'holiday', '2026-12-20', '2027-01-03'),
        day('event', 'event_day', '2026-11-20', '2026-11-20'),
      ],
      '2026-11-15',
    )!;
    expect(view.terms.map((t) => [t.label, t.state])).toEqual([
      ['Trimestre 1', 'current'],
      ['Trimestre 2', 'next'],
    ]);
    expect(view.keyDates.map((d) => d.id)).toEqual(['exam', 'winter']);
    expect(view.next?.id).toBe('exam');
  });
  it('shows a term once even when each section has its own', () => {
    const doubled = {
      ...year,
      periods: [...year.periods, { ...year.periods[1]!, id: 'p1b', sectionId: 's' }],
    };
    expect(yearView(doubled, [], '2026-11-15')!.terms).toHaveLength(2);
  });
  it('words a date range', () => {
    expect(dateRangeText('2026-12-10', '2026-12-17')).toBe('du 10 décembre au 17 décembre');
    expect(dateRangeText('2026-12-10', '2026-12-10')).toBe('le 10 décembre');
  });
});

describe('timetablesView', () => {
  it('is empty without classes', () => {
    expect(timetablesView(timetables())).toBeNull();
  });
  it('counts complete and incomplete classes', () => {
    expect(
      timetablesView(timetables(cls('A', 0), cls('B', 2), cls('C', 0), cls('D', 1))),
    ).toMatchObject({
      complete: 2,
      incomplete: 2,
      total: 4,
      percent: 50,
      teachersPlaced: 3,
      teachersTotal: 4,
    });
  });
});
