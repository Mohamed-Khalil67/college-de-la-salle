import type {
  TimetableRoomSuggestionDto,
  TimetableSuggestionDto,
  TimetableTimeSuggestionDto,
} from '@cdls/shared';

/** The suggestions of a refused write, rooms and times apart (each list keeps the API's order, best first). */
export function splitSuggestions(list: readonly TimetableSuggestionDto[]): {
  rooms: TimetableRoomSuggestionDto[];
  times: TimetableTimeSuggestionDto[];
} {
  return {
    rooms: list.filter((s): s is TimetableRoomSuggestionDto => s.kind === 'room'),
    times: list.filter((s): s is TimetableTimeSuggestionDto => s.kind === 'time'),
  };
}

/** The fields of « Cette séance » a suggestion fills in (form values: '' means none). */
export interface SessionFields {
  newDate: string;
  newStart: string;
  newEnd: string;
  /** The room of a room change. */
  roomId: string;
  /** The room a moved session goes to; '' keeps its own. */
  moveRoomId: string;
}

/**
 * A suggestion applied to one session being moved or given another room: a time moves it (its room choice
 * stays), a room goes where the action puts rooms. A series suggestion leaves it unchanged.
 */
export function applyToSession<M extends SessionFields>(
  model: M,
  action: 'move' | 'room',
  s: TimetableSuggestionDto,
): M {
  if (s.target !== 'session') return model;
  if (s.kind === 'time')
    return action === 'move' && s.date
      ? { ...model, newDate: s.date, newStart: s.startTime, newEnd: s.endTime }
      : model;
  return action === 'move' ? { ...model, moveRoomId: s.roomId } : { ...model, roomId: s.roomId };
}

/** The fields of a weekly rule a suggestion fills in (form values: the weekday as a string). */
export interface SeriesFields {
  weekday: string;
  startTime: string;
  endTime: string;
  roomId: string;
}

/** A suggestion applied to a weekly rule: another weekday and hours, or another room. */
export function applyToSeries<M extends SeriesFields>(model: M, s: TimetableSuggestionDto): M {
  if (s.target !== 'series') return model;
  if (s.kind === 'room') return { ...model, roomId: s.roomId };
  return { ...model, weekday: String(s.weekday), startTime: s.startTime, endTime: s.endTime };
}
