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

/**
 * A visitor's address made safe for a `mailto:` link. An address typed on the public form may hold
 * `?`, `&` or `%` (valid in e-mail addresses), which would otherwise add headers such as `bcc=` to the
 * reply (RFC 6068): each part is percent-encoded, the `@` kept.
 */
export function mailtoAddress(email: string): string {
  const at = email.lastIndexOf('@');
  const encode = (part: string) => encodeURIComponent(part);
  return at < 0 ? encode(email) : `${encode(email.slice(0, at))}@${encode(email.slice(at + 1))}`;
}

/** A `mailto:` link to answer the visitor, the subject prefixed with « Re : ». */
export function replyMailto(message: Pick<ContactMessageDto, 'email' | 'subject'>): string {
  return `mailto:${mailtoAddress(message.email)}?subject=${encodeURIComponent(`Re : ${message.subject}`)}`;
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
