import type { NotificationKind } from '@cdls/shared';

/** What a one-off event's notification compares before and after a change. */
export interface EventSchedule {
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  /** Weekly series (legacy events) are not announced session by session. */
  readonly repeatUntil: string | null;
  readonly roomId: string | null;
  readonly place: string;
}

/**
 * The notification an edit calls for: `event_moved` when the day or the times changed, else
 * `event_room_changed` when the room or the place did; null when nothing the students rely on changed,
 * when the event is a weekly series, or when it was and stays in the past.
 */
export function eventChangeKind(
  before: EventSchedule,
  after: EventSchedule,
  today: string,
): Extract<NotificationKind, 'event_moved' | 'event_room_changed'> | null {
  if (before.repeatUntil || after.repeatUntil) return null;
  if (before.date < today && after.date < today) return null;
  if (
    before.date !== after.date ||
    before.startTime !== after.startTime ||
    before.endTime !== after.endTime
  )
    return 'event_moved';
  if (before.roomId !== after.roomId || before.place.trim() !== after.place.trim())
    return 'event_room_changed';
  return null;
}

/** Is an event still to come (its day, or the last day of its series, is today or later)? */
export function eventUpcoming(
  e: Pick<EventSchedule, 'date' | 'repeatUntil'>,
  today: string,
): boolean {
  return (e.repeatUntil ?? e.date) >= today;
}
