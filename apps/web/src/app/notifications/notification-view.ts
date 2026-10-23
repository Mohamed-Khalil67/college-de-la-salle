import { NOTIFICATION_KIND_LABELS, type NotificationKind } from '@cdls/shared';
import type { BadgeTone } from '../ui';

/** Pure display rules of the notifications (tested in notification-view.spec.ts). */

/** The accessible name of the bell: the count is in the words, the dot only repeats it. */
export function bellLabel(unread: number): string {
  if (unread <= 0) return 'Notifications, aucune non lue';
  return `Notifications, ${unread > 99 ? 'plus de 99' : unread} non lue${unread > 1 ? 's' : ''}`;
}

/** Badge tone of a kind: what was cancelled stands out, the rest stays calm. */
export function kindTone(kind: NotificationKind): BadgeTone {
  switch (kind) {
    case 'session_cancelled':
    case 'event_cancelled':
      return 'danger';
    case 'session_moved':
    case 'event_moved':
    case 'session_room_changed':
    case 'event_room_changed':
      return 'warning';
    case 'grade_published':
      return 'success';
    default:
      return 'info';
  }
}

export const kindLabel = (kind: NotificationKind) => NOTIFICATION_KIND_LABELS[kind];

const TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Cairo',
});
const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Cairo',
});

/** « à l’instant », « il y a 12 min », « il y a 3 h », then « le 21 octobre à 08:30 » (Cairo time). */
export function receivedAt(iso: string, now: Date): string {
  const at = new Date(iso);
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 24 * 60) return `il y a ${Math.floor(minutes / 60)} h`;
  return `le ${DATE.format(at)} à ${TIME.format(at)}`;
}

/** The status line of the feed panel. */
export function feedStatus(
  feed: { active: boolean; createdAt: string | null; lastUsedAt: string | null },
  now: Date,
): string {
  if (!feed.active || !feed.createdAt)
    return 'Aucun lien actif : votre agenda n’est pas synchronisé.';
  const used = feed.lastUsedAt
    ? `Dernière lecture par votre agenda ${receivedAt(feed.lastUsedAt, now)}.`
    : 'Votre agenda ne l’a pas encore lu.';
  return `Lien actif, créé ${receivedAt(feed.createdAt, now)}. ${used}`;
}
