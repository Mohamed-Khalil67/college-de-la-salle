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

/** Ids of the messages on a page that can be selected for bulk handling: the waiting ones. */
export function selectableIds(messages: readonly Pick<ContactMessageDto, 'id' | 'handledAt'>[]): string[] {
  return messages.filter((m) => !m.handledAt).map((m) => m.id);
}

/** The selection with `id` added or removed (a new set: signals compare by reference). */
export function toggleSelected(selected: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(selected);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** Drops from the selection what is no longer on screen or no longer waiting (handled, deleted, other page). */
export function keepSelectable(selected: ReadonlySet<string>, selectable: readonly string[]): ReadonlySet<string> {
  return new Set(selectable.filter((id) => selected.has(id)));
}

/** State of the « select the whole page » box. */
export function selectAllState(selected: ReadonlySet<string>, selectable: readonly string[]): 'none' | 'some' | 'all' {
  const count = selectable.filter((id) => selected.has(id)).length;
  return count === 0 ? 'none' : count === selectable.length ? 'all' : 'some';
}

/** Confirmation after a bulk handling: how many were marked, and why some were not. */
export function bulkHandledNotice(handled: number, asked: number): string {
  if (handled === 0) return 'Aucun message marqué comme traité : ils l’étaient déjà ou ont été supprimés.';
  const done = handled > 1 ? `${handled} messages marqués comme traités.` : '1 message marqué comme traité.';
  const skipped = asked - handled;
  if (skipped <= 0) return done;
  return `${done} ${skipped > 1 ? `${skipped} autres l’étaient déjà ou ont été supprimés.` : 'Un autre l’était déjà ou a été supprimé.'}`;
}

/**
 * The page to show after `removed` messages left a page of `onPage`: the previous one when the page
 * would be left empty (and is not the first).
 */
export function pageAfterRemoval(page: number, onPage: number, removed: number): number {
  return page > 1 && removed >= onPage ? page - 1 : page;
}
