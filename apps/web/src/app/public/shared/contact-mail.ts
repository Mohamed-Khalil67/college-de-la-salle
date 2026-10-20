import type { ContactMessageRequest } from '@cdls/shared';

/**
 * Pure helpers for the public contact blocks. No Angular here, so they are unit-tested in
 * contact-mail.spec.ts.
 */

/** What a visitor fills in on a contact form. Empty strings are left out of the e-mail. */
export interface ContactMessage {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly subject: string;
  readonly track: string;
  readonly message: string;
}

/** Subject used when the form has no subject field (home page block). */
export const DEFAULT_CONTACT_SUBJECT = 'Message depuis le site';

/** The body of POST /api/contact: trimmed, without the empty optional fields. */
export function contactRequest(message: ContactMessage): ContactMessageRequest {
  const phone = message.phone.trim();
  const track = message.track.trim();
  return {
    name: message.name.trim(),
    email: message.email.trim(),
    subject: message.subject.trim() || DEFAULT_CONTACT_SUBJECT,
    message: message.message.trim(),
    ...(phone ? { phone } : {}),
    ...(track ? { track } : {}),
  };
}

/** `tel:` target for a displayed number: `+20 2 2590 47 40` gives `tel:+20225904740`. */
export function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}

/**
 * A `mailto:` link that opens the visitor's e-mail app with the message ready to send: the fallback
 * when the message could not be sent to the site (server unreachable).
 */
export function contactMailto(to: string, message: ContactMessage): string {
  const subject = [message.subject || DEFAULT_CONTACT_SUBJECT, message.track].filter(Boolean).join(', ');
  const lines = [
    message.message.trim(),
    '',
    '--',
    message.name.trim(),
    message.email.trim(),
    message.phone.trim(),
    message.track ? `Filière et classe : ${message.track}` : '',
  ].filter((line, index) => index < 3 || line !== '');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

/** Sentence case for labels written in lower case in the content files. */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1);
}
