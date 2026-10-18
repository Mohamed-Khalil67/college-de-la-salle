import { describe, expect, it } from 'vitest';
import {
  addDays,
  byDay,
  daysBetween,
  eventsFor,
  eventsForTarget,
  isClockTime,
  monthGrid,
  monthTitle,
  nextExam,
  occurrences,
  safeAttachments,
  shiftMonth,
  startOfWeek,
  timeRange,
  toIcs,
  videoEmbed,
  weekDays,
  type CalendarEvent,
} from './calendar.model';

const ev = (id: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  kind: 'cours',
  title: id,
  subject: '',
  target: 'all',
  date: '2026-11-12',
  start: '',
  end: '',
  repeatUntil: '',
  place: '',
  description: '',
  attachments: [],
  coefficient: 1,
  authorUid: 'u',
  authorName: 'Marc',
  createdAt: 1,
  ...over,
});

describe('days and weeks', () => {
  it('weeks start on Sunday (Egyptian school week)', () => {
    expect(startOfWeek('2026-11-12')).toBe('2026-11-08'); // a Thursday → the Sunday before
    expect(startOfWeek('2026-11-08')).toBe('2026-11-08');
    expect(weekDays('2026-11-12')).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  });

  it('adds days across months and years, and counts days between', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-18', '2026-10-21')).toBe(3);
    expect(daysBetween('2026-10-21', '2026-10-18')).toBe(-3);
  });

  it('a month grid covers whole weeks from Sunday to Saturday', () => {
    const weeks = monthGrid(2026, 11); // 1 November 2026 is a Sunday
    expect(weeks[0]![0]).toEqual({ day: '2026-11-01', inMonth: true });
    expect(weeks.at(-1)![6]!.day).toBe('2026-12-05');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(30);
    expect(monthGrid(2026, 10)[0]![0]).toEqual({ day: '2026-09-27', inMonth: false });
  });

  it('shifts months across years and titles them in French', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthTitle(2026, 11)).toBe('novembre 2026');
  });

  it('validates clock times and formats a time range', () => {
    expect(isClockTime('')).toBe(true);
    expect(isClockTime('08:30')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(timeRange({ start: '08:30', end: '10:00' })).toBe('08:30 – 10:00');
    expect(timeRange({ start: '08:30', end: '' })).toBe('08:30');
    expect(timeRange({ start: '', end: '' })).toBe('Toute la journée');
  });
});

describe('occurrences', () => {
  it('a single event appears once, inside the range only', () => {
    expect(occurrences([ev('a')], '2026-11-01', '2026-11-30').map((o) => o.key)).toEqual(['a@2026-11-12']);
    expect(occurrences([ev('a')], '2026-11-13', '2026-11-30')).toEqual([]);
  });

  it('a weekly class repeats every 7 days until its last day, starting inside the range', () => {
    const weekly = ev('maths', { date: '2026-10-05', repeatUntil: '2026-11-30' });
    expect(occurrences([weekly], '2026-11-01', '2026-11-30').map((o) => o.day)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(occurrences([weekly], '2026-12-01', '2026-12-31')).toEqual([]);
  });

  it('only repeatable categories repeat (an exam never does)', () => {
    expect(occurrences([ev('x', { kind: 'examen', repeatUntil: '2026-12-31' })], '2026-11-01', '2026-12-31')).toHaveLength(1);
  });

  it('sorts by day, all-day items first, then by start time; groups by day', () => {
    const list = occurrences([ev('b', { start: '10:00' }), ev('a', { start: '08:30' }), ev('c'), ev('d', { date: '2026-11-13' })], '2026-11-01', '2026-11-30');
    expect(list.map((o) => o.event.id)).toEqual(['c', 'a', 'b', 'd']);
    expect([...byDay(list).keys()]).toEqual(['2026-11-12', '2026-11-13']);
  });

  it('finds the next exam or test from today', () => {
    const list = occurrences([ev('c1', { kind: 'cours', date: '2026-11-02' }), ev('old', { kind: 'examen', date: '2026-10-01' }), ev('ex', { kind: 'controle', date: '2026-11-05' })], '2026-10-01', '2026-12-01');
    expect(nextExam(list, '2026-10-18')?.event.id).toBe('ex');
    expect(nextExam(list, '2026-11-06')).toBeNull();
  });
});

describe('audiences', () => {
  it('a student sees only events for everyone, their section and their class', () => {
    const list = [ev('all'), ev('bac', { target: 'bac' }), ev('premiere', { target: 'bac-premiere' }), ev('terminale', { target: 'bac-terminale' }), ev('nationale', { target: 'nationale' })];
    expect(eventsFor(list, 'bac', 'premiere').map((e) => e.id)).toEqual(['all', 'bac', 'premiere']);
  });

  it('a teacher’s class filter includes its section; a section filter includes its classes', () => {
    const list = [ev('all'), ev('bac', { target: 'bac' }), ev('premiere', { target: 'bac-premiere' }), ev('terminale', { target: 'bac-terminale' }), ev('nat', { target: 'nationale' })];
    expect(eventsForTarget(list, 'all')).toHaveLength(5);
    expect(eventsForTarget(list, 'bac-premiere').map((e) => e.id)).toEqual(['all', 'bac', 'premiere']);
    expect(eventsForTarget(list, 'bac').map((e) => e.id)).toEqual(['all', 'bac', 'premiere', 'terminale']);
  });
});

describe('attachments and videos', () => {
  it('keeps only https links', () => {
    expect(
      safeAttachments([
        { label: 'ok', url: 'https://example.org/cours.pdf' },
        { label: 'http', url: 'http://example.org' },
        { label: 'js', url: 'javascript:alert(1)' },
      ]).map((a) => a.label),
    ).toEqual(['ok']);
  });

  it('turns YouTube and Drive links into privacy-friendly players, rebuilt from the id', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing')).toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview');
  });

  it('anything else stays a plain link', () => {
    expect(videoEmbed('https://example.org/video.mp4')).toBeNull();
    expect(videoEmbed('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoEmbed('https://www.youtube.com/watch?v=<script>')).toBeNull();
    expect(videoEmbed('https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoEmbed('pas un lien')).toBeNull();
  });
});

describe('« Ajouter à mon agenda »', () => {
  it('writes a valid iCalendar event with time, place and weekly repetition', () => {
    const ics = toIcs(ev('e1', { kind: 'tp', title: 'TP Chimie; titrage', date: '2026-11-12', start: '10:00', end: '12:00', place: 'Labo 2', repeatUntil: '2026-12-17' }));
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20261112T100000');
    expect(ics).toContain('DTEND:20261112T120000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261217T235959');
    expect(ics).toContain('SUMMARY:TP — TP Chimie\\; titrage');
    expect(ics).toContain('LOCATION:Labo 2');
    expect(ics.split('\r\n').at(-2)).toBe('END:VCALENDAR');
  });

  it('an all-day event uses dates, and a non-repeatable one never repeats', () => {
    const ics = toIcs(ev('e2', { kind: 'devoir', repeatUntil: '2026-12-31' }));
    expect(ics).toContain('DTSTART;VALUE=DATE:20261112');
    expect(ics).toContain('DTEND;VALUE=DATE:20261113');
    expect(ics).not.toContain('RRULE');
  });
});
