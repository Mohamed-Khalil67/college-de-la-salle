import type { CalendarEvent } from './calendar.js';
import {
  calendarDayFeedItem,
  eventFeedItems,
  type FeedItem,
  feedSequence,
  feedToken,
  feedWindow,
  foldLine,
  latestInstant,
  parseFeedToken,
  sessionFeedItem,
  type SessionFeedInfo,
  toFeedIcs,
  webcalUrl,
} from './feed.js';
import { expandTimetable, type SlotExceptionRule, type SlotRule } from './timetable.js';

const slot: SlotRule = {
  id: 's1',
  target: 'bac-premiere',
  weekday: 0,
  startTime: '08:30',
  endTime: '10:00',
  validFrom: '2026-10-04',
  validTo: '2026-10-31',
  weekParity: null,
  roomId: 'r1',
  teacherId: 't1',
};
const info: SessionFeedInfo = {
  subject: 'Mathématiques',
  activity: 'Cours',
  room: 'B12',
  originalRoom: 'B12',
  teacher: 'Hany Mansour',
  className: 'Première',
  group: null,
  updatedAt: '2026-10-01T08:00:00.000Z',
};
const ex = (over: Partial<SlotExceptionRule>): SlotExceptionRule => ({
  id: 'e1',
  slotId: 's1',
  date: '2026-10-11',
  kind: 'cancelled',
  newDate: null,
  newStart: null,
  newEnd: null,
  newRoomId: null,
  newTeacherId: null,
  reason: '',
  ...over,
});
const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'ev1',
  type: { label: 'Examen', gradable: true, repeatable: false, homework: false },
  title: 'Fonctions',
  subject: 'mathematiques',
  target: 'bac-premiere',
  date: '2026-10-20',
  start: '10:00',
  end: '12:00',
  repeatUntil: '',
  place: 'Salle B12',
  description: '',
  attachments: [],
  coefficient: 1,
  authorUid: 't1',
  authorName: 'Hany Mansour',
  createdAt: Date.UTC(2026, 9, 1),
  ...over,
});

const items = (exceptions: SlotExceptionRule[]) =>
  expandTimetable([slot], exceptions, '2026-10-01', '2026-10-31')
    .map((o) => sessionFeedItem(o, info))
    .filter((i): i is FeedItem => !!i);

describe('feed window and sequence', () => {
  it('covers 30 days back and 180 days ahead', () => {
    expect(feedWindow('2026-10-23')).toEqual({ from: '2026-09-23', to: '2027-04-21' });
  });

  it('counts seconds since 2026 and grows with every change', () => {
    expect(feedSequence('2026-01-01T00:00:00.000Z')).toBe(0);
    expect(feedSequence('2026-01-01T01:00:59.000Z')).toBe(3659);
    expect(feedSequence('2025-06-01T00:00:00.000Z')).toBe(0);
    expect(feedSequence('garbage')).toBe(0);
    expect(feedSequence('2026-10-02T00:00:00Z')).toBeGreaterThan(
      feedSequence('2026-10-01T00:00:00Z'),
    );
  });

  it('picks the latest instant', () => {
    expect(latestInstant('2026-10-01T00:00:00Z', null, '2026-10-03T00:00:00Z', undefined)).toBe(
      '2026-10-03T00:00:00Z',
    );
  });
});

describe('sessions in the feed', () => {
  it('lists every weekly session with a UID per original day', () => {
    const list = items([]);
    expect(list.map((i) => i.day)).toEqual([
      '2026-10-04',
      '2026-10-11',
      '2026-10-18',
      '2026-10-25',
    ]);
    expect(list[1]!.uid).toBe('slot-s1-2026-10-11');
    expect(list[1]!).toMatchObject({
      start: '08:30',
      end: '10:00',
      location: 'B12',
      summary: 'Mathématiques',
    });
  });

  it('removes a cancelled session', () => {
    expect(items([ex({ kind: 'cancelled' })]).map((i) => i.day)).not.toContain('2026-10-11');
  });

  it('shows a moved session at its new day and time under the same UID, without its trace', () => {
    const list = items([
      ex({
        kind: 'moved',
        newDate: '2026-10-13',
        newStart: '14:00',
        newEnd: '15:30',
        reason: 'Sortie',
      }),
    ]);
    const moved = list.filter((i) => i.uid === 'slot-s1-2026-10-11');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ day: '2026-10-13', start: '14:00', end: '15:30' });
    expect(moved[0]!.description).toContain('prévue initialement le dimanche 11 octobre à 08:30');
    expect(moved[0]!.description).toContain('Motif : Sortie');
    expect(list.some((i) => i.day === '2026-10-11')).toBe(false);
  });

  it('shows the new room of a room change', () => {
    const [o] = expandTimetable(
      [slot],
      [ex({ kind: 'room_change', newRoomId: 'r2' })],
      '2026-10-11',
      '2026-10-11',
    );
    const item = sessionFeedItem(o!, { ...info, room: 'Labo 1' });
    expect(item).toMatchObject({ location: 'Labo 1' });
    expect(item!.description).toContain('Salle changée (avant : B12)');
  });
});

describe('events and closed days in the feed', () => {
  const meta = new Map([
    ['ev1', { homework: false, assessment: true, updatedAt: '2026-10-05T00:00:00.000Z' }],
    ['hw', { homework: true, assessment: false, updatedAt: '2026-10-06T00:00:00.000Z' }],
  ]);

  it('keeps one UID per one-off event, whatever its day', () => {
    const [a] = eventFeedItems([event()], meta, '2026-10-01', '2026-10-31');
    const [b] = eventFeedItems([event({ date: '2026-10-22' })], meta, '2026-10-01', '2026-10-31');
    expect(a!.uid).toBe('event-ev1');
    expect(b!.uid).toBe(a!.uid);
    expect(a).toMatchObject({ kind: 'exam', summary: 'Examen — Fonctions', location: 'Salle B12' });
  });

  it('names homework as a deadline', () => {
    const [hw] = eventFeedItems(
      [
        event({
          id: 'hw',
          type: { label: 'Devoir', gradable: true, repeatable: false, homework: true },
          title: 'Exercices',
          end: '',
        }),
      ],
      meta,
      '2026-10-01',
      '2026-10-31',
    );
    expect(hw).toMatchObject({ kind: 'homework', summary: 'À rendre — Exercices', end: null });
  });

  it('expands a weekly event with one UID per day and skips its closed days', () => {
    const weekly = event({
      id: 'w',
      type: { label: 'Révision', gradable: false, repeatable: true, homework: false },
      date: '2026-10-04',
      repeatUntil: '2026-10-25',
    });
    const list = eventFeedItems([weekly], new Map(), '2026-10-01', '2026-10-31', [
      { startsOn: '2026-10-18', endsOn: '2026-10-18', targets: ['all'] },
    ]);
    expect(list.map((i) => i.uid)).toEqual([
      'event-w-2026-10-04',
      'event-w-2026-10-11',
      'event-w-2026-10-25',
    ]);
  });

  it('writes closed days as all-day entries', () => {
    const item = calendarDayFeedItem({
      id: 'd1',
      label: 'Vacances d’octobre',
      typeLabel: 'Vacances',
      startsOn: '2026-10-25',
      endsOn: '2026-10-29',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    const ics = toFeedIcs([item], { name: 'Agenda', now: '2026-10-23T10:00:00.000Z' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261025\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261030\r\n');
    expect(ics).toContain('UID:day-d1@college-de-la-salle-daher\r\n');
  });
});

describe('the iCalendar file', () => {
  const now = '2026-10-23T10:00:00.000Z';

  it('uses the Cairo zone, a stable UID, SEQUENCE and CRLF lines', () => {
    const ics = toFeedIcs(items([]).slice(0, 1), { name: 'Collège de la Salle — Nadia', now });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Africa/Cairo\r\n');
    expect(ics).toContain('DTSTART;TZID=Africa/Cairo:20261004T083000\r\n');
    expect(ics).toContain('DTEND;TZID=Africa/Cairo:20261004T100000\r\n');
    expect(ics).toContain('UID:slot-s1-2026-10-04@college-de-la-salle-daher\r\n');
    expect(ics).toContain(`SEQUENCE:${feedSequence(info.updatedAt)}\r\n`);
    expect(ics).toContain('DTSTAMP:20261023T100000Z\r\n');
    expect(ics).toContain('LAST-MODIFIED:20261001T080000Z\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/);
  });

  it('gives the same file for the same data (order does not depend on input order)', () => {
    const list = items([]);
    expect(toFeedIcs(list, { name: 'A', now })).toBe(
      toFeedIcs([...list].reverse(), { name: 'A', now }),
    );
  });

  it('escapes text and folds long lines at 75 octets without splitting a character', () => {
    const long = `Révision ; chapitre, ${'é'.repeat(80)}\nfin`;
    const ics = toFeedIcs([{ ...items([])[0]!, description: long }], { name: 'A', now });
    const lines = ics.split('\r\n');
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('Révision \\; chapitre\\, ');
    expect(unfolded).toContain('\\nfin');
    expect(foldLine('short')).toBe('short');
  });
});

describe('feed tokens', () => {
  const id = '0193b2c4-7d1e-7a00-8b11-123456789abc';
  const secret = 'A'.repeat(43);

  it('round-trips the id and the secret', () => {
    const token = feedToken(id, secret);
    expect(token).toHaveLength(75);
    expect(parseFeedToken(token)).toEqual({ id, secret });
  });

  it('refuses malformed tokens', () => {
    expect(parseFeedToken('')).toBeNull();
    expect(parseFeedToken(`${feedToken(id, secret)}x`)).toBeNull();
    expect(parseFeedToken(`${'G'.repeat(32)}${secret}`)).toBeNull();
    expect(parseFeedToken('../../etc/passwd')).toBeNull();
  });

  it('builds the webcal address', () => {
    expect(webcalUrl('https://ecole.eg/api/calendar/feed/x.ics')).toBe(
      'webcal://ecole.eg/api/calendar/feed/x.ics',
    );
  });
});
