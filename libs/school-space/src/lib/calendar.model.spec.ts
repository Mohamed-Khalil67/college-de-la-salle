import { describe, expect, it } from 'vitest';
import { eventsFor, eventsForTarget, eventsOn, isClockTime, monthGrid, monthTitle, shiftMonth, type CalendarEvent } from './calendar.model';

const ev = (id: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  kind: 'exam',
  title: id,
  date: '2026-11-12',
  time: '',
  target: 'all',
  subject: '',
  note: '',
  authorUid: 'u',
  authorName: 'Marc',
  createdAt: 1,
  ...over,
});

describe('month grid', () => {
  it('starts on Monday and covers whole weeks', () => {
    const weeks = monthGrid(2026, 11); // 1 November 2026 is a Sunday
    expect(weeks[0]![0]!.day).toBe('2026-10-26');
    expect(weeks[0]![6]!.day).toBe('2026-11-01');
    expect(weeks[0]![6]!.inMonth).toBe(true);
    expect(weeks.at(-1)![6]!.day).toBe('2026-12-06');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(30);
  });

  it('a month that starts on Monday has no leading days', () => {
    const weeks = monthGrid(2026, 6); // 1 June 2026 is a Monday
    expect(weeks[0]![0]).toEqual({ day: '2026-06-01', inMonth: true });
    expect(weeks).toHaveLength(5);
  });

  it('shifts across years and titles in French', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthTitle(2026, 11)).toBe('novembre 2026');
  });
});

describe('events', () => {
  it('a day lists all-day events first, then by time', () => {
    const list = [ev('b', { time: '10:00' }), ev('a', { time: '08:30' }), ev('c'), ev('other', { date: '2026-11-13' })];
    expect(eventsOn(list, '2026-11-12').map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('a student sees only events for everyone, their section and their class', () => {
    const list = [
      ev('all'),
      ev('bac', { target: 'bac' }),
      ev('premiere', { target: 'bac-premiere' }),
      ev('terminale', { target: 'bac-terminale' }),
      ev('nationale', { target: 'nationale' }),
    ];
    expect(eventsFor(list, 'bac', 'premiere').map((e) => e.id)).toEqual(['all', 'bac', 'premiere']);
  });

  it('a teacher’s filter shows what concerns that audience, including its section and its classes', () => {
    const list = [ev('all'), ev('bac', { target: 'bac' }), ev('premiere', { target: 'bac-premiere' }), ev('terminale', { target: 'bac-terminale' }), ev('nat', { target: 'nationale' })];
    expect(eventsForTarget(list, 'all')).toHaveLength(5);
    expect(eventsForTarget(list, 'bac-premiere').map((e) => e.id)).toEqual(['all', 'bac', 'premiere']);
    expect(eventsForTarget(list, 'bac').map((e) => e.id)).toEqual(['all', 'bac', 'premiere', 'terminale']);
  });

  it('validates clock times', () => {
    expect(isClockTime('')).toBe(true);
    expect(isClockTime('08:30')).toBe(true);
    expect(isClockTime('23:59')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('8:30')).toBe(false);
  });
});
