import { describe, expect, it } from 'vitest';
import type { TimetableRoomSuggestionDto, TimetableTimeSuggestionDto } from '@cdls/shared';
import { applyToSeries, applyToSession, splitSuggestions } from './suggestions';

const room = (target: 'session' | 'series'): TimetableRoomSuggestionDto => ({
  kind: 'room',
  target,
  roomId: 'r14',
  roomName: 'Salle 14',
  capacity: 32,
  roomKind: 'classroom',
  label: 'Salle 14 (32 places)',
});
const sessionTime: TimetableTimeSuggestionDto = {
  kind: 'time',
  target: 'session',
  date: '2026-11-03',
  weekday: 2,
  startTime: '10:15',
  endTime: '11:15',
  label: 'mardi 3 novembre, 10:15 – 11:15',
};
const seriesTime: TimetableTimeSuggestionDto = {
  ...sessionTime,
  target: 'series',
  date: null,
  label: 'le mardi, 10:15 – 11:15',
};

const session = {
  newDate: '2026-11-02',
  newStart: '09:00',
  newEnd: '10:00',
  roomId: '',
  moveRoomId: '',
  reason: 'Sortie',
};
const series = { weekday: '1', startTime: '08:00', endTime: '09:00', roomId: 'r1', division: '' };

describe('splitSuggestions', () => {
  it('keeps rooms and times apart, in their order', () => {
    const list = [room('session'), sessionTime, { ...room('session'), roomId: 'r2' }];
    const { rooms, times } = splitSuggestions(list);
    expect(rooms.map((r) => r.roomId)).toEqual(['r14', 'r2']);
    expect(times).toEqual([sessionTime]);
  });
});

describe('applyToSession', () => {
  it('moves the session to the suggested day and hours, keeping the rest', () => {
    expect(applyToSession(session, 'move', sessionTime)).toEqual({
      ...session,
      newDate: '2026-11-03',
      newStart: '10:15',
      newEnd: '11:15',
    });
  });

  it('puts a suggested room on the move, or as the new room of a room change', () => {
    expect(applyToSession(session, 'move', room('session')).moveRoomId).toBe('r14');
    expect(applyToSession(session, 'move', room('session')).newDate).toBe('2026-11-02');
    expect(applyToSession(session, 'room', room('session')).roomId).toBe('r14');
  });

  it('ignores what does not fit: a time for a room change, a series suggestion', () => {
    expect(applyToSession(session, 'room', sessionTime)).toBe(session);
    expect(applyToSession(session, 'move', seriesTime)).toBe(session);
  });
});

describe('applyToSeries', () => {
  it('moves the rule to the weekday and hours, or to the room', () => {
    expect(applyToSeries(series, seriesTime)).toEqual({
      ...series,
      weekday: '2',
      startTime: '10:15',
      endTime: '11:15',
    });
    expect(applyToSeries(series, room('series'))).toEqual({ ...series, roomId: 'r14' });
  });

  it('ignores a session suggestion', () => {
    expect(applyToSeries(series, sessionTime)).toBe(series);
  });
});
