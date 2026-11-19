import { createHmac, randomBytes } from 'node:crypto';

/*
 * Pure pieces of the « mot de passe oublié » link and of the outbox that mails it.
 *
 * The link token is NOT stored, not even encrypted: it is derived on demand,
 *     token = base64url(HMAC-SHA256(server secret, "password-reset-link:" + seed))
 * from a random `seed` kept in the outbox row only until the mail is sent (or the link expires). The row's
 * `tokenHash` is the HMAC of that token, as before, so the lookup at reset time is unchanged. A database
 * leak alone gives a seed (useless without the secret) and a hash (one-way); with the secret AND the
 * database an attacker could derive the tokens of the few unsent mails, but with the secret he could
 * forge sessions anyway.
 */

/** A fresh random seed (32 bytes, base64url: 43 characters). */
export const newSeed = (): string => randomBytes(32).toString('base64url');

/** The token the e-mailed link carries: 32 bytes, base64url (43 characters). */
export const linkToken = (key: string, seed: string): string =>
  createHmac('sha256', key).update(`password-reset-link:${seed}`).digest('base64url');

/** What is stored to find the row again: the HMAC of the token (prefix `password-reset:`). */
export const tokenDigest = (key: string, token: string): string =>
  createHmac('sha256', key).update(`password-reset:${token}`).digest('hex');

/** Delay before the next try of a mail that failed: 30 s, then doubling, never more than 5 minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts), 300_000);
}

/** Minutes the link stays valid from `now`, rounded up (what the mail says); never below 1. */
export function validityMinutes(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 60_000));
}
