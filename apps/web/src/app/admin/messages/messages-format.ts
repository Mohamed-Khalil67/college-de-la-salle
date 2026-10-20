/**
 * Framework-free helpers for the contact messages page. No Angular here, so they are unit-tested with
 * Vitest (messages-format.spec.ts).
 */
import type { ContactMessageDto } from '@cdls/shared';

/** Tabs of the page: waiting messages first. */
export type MessageFilter = 'waiting' | 'handled' | 'all';

export const MESSAGE_FILTERS: readonly { readonly id: MessageFilter; readonly label: string }[] = [
  { id: 'waiting', label: 'À traiter' },
  { id: 'handled', label: 'Traités' },
  { id: 'all', label: 'Tous' },
];

export function isMessageFilter(value: string): value is MessageFilter {
  return MESSAGE_FILTERS.some((f) => f.id === value);
}

/** The `handled` query of GET /contact-messages for a tab. */
export function handledQuery(filter: MessageFilter): boolean | undefined {
  return filter === 'all' ? undefined : filter === 'handled';
}

/** A `mailto:` link to answer the visitor, the subject prefixed with « Re : ». */
export function replyMailto(message: Pick<ContactMessageDto, 'email' | 'subject'>): string {
  return `mailto:${message.email}?subject=${encodeURIComponent(`Re : ${message.subject}`)}`;
}

const RECEIVED = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Africa/Cairo',
});

/** « 20 octobre 2026 à 9 h 14 » (Cairo time). */
export function formatReceived(iso: string): string {
  const parts = RECEIVED.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('year')} à ${Number(part('hour'))} h ${part('minute')}`;
}
