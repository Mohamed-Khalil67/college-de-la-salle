import { eventChangeKind, type EventSchedule, eventUpcoming } from './event-changes.js';

const base: EventSchedule = {
  date: '2026-11-03',
  startTime: '10:00',
  endTime: '12:00',
  repeatUntil: null,
  roomId: 'r1',
  place: '',
};
const today = '2026-10-23';

describe('eventChangeKind', () => {
  it('announces a new day or time as a move', () => {
    expect(eventChangeKind(base, { ...base, date: '2026-11-04' }, today)).toBe('event_moved');
    expect(eventChangeKind(base, { ...base, startTime: '11:00' }, today)).toBe('event_moved');
    expect(eventChangeKind(base, { ...base, endTime: null }, today)).toBe('event_moved');
  });

  it('announces another room or place', () => {
    expect(eventChangeKind(base, { ...base, roomId: 'r2' }, today)).toBe('event_room_changed');
    expect(eventChangeKind(base, { ...base, place: 'Gymnase' }, today)).toBe('event_room_changed');
  });

  it('says nothing when only the title or the description changed', () => {
    expect(eventChangeKind(base, { ...base, place: '  ' }, today)).toBeNull();
    expect(eventChangeKind(base, base, today)).toBeNull();
  });

  it('says nothing about the past, but does about a past event moved to the future', () => {
    const past = { ...base, date: '2026-10-01' };
    expect(eventChangeKind(past, { ...past, roomId: 'r2' }, today)).toBeNull();
    expect(eventChangeKind(past, { ...past, date: '2026-10-30' }, today)).toBe('event_moved');
  });

  it('leaves weekly series out', () => {
    const weekly = { ...base, repeatUntil: '2026-12-20' };
    expect(eventChangeKind(weekly, { ...weekly, startTime: '09:00' }, today)).toBeNull();
  });
});

describe('eventUpcoming', () => {
  it('reads the last day of a series', () => {
    expect(eventUpcoming({ date: '2026-10-01', repeatUntil: '2026-12-01' }, today)).toBe(true);
    expect(eventUpcoming({ date: '2026-10-01', repeatUntil: null }, today)).toBe(false);
    expect(eventUpcoming({ date: today, repeatUntil: null }, today)).toBe(true);
  });
});
