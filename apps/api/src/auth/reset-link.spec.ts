import { linkToken, newSeed, retryDelayMs, tokenDigest, validityMinutes } from './reset-link.js';

const KEY = 'k'.repeat(40);

describe('reset link', () => {
  it('derives the same token from the same seed and key, and a different one otherwise', () => {
    const seed = newSeed();
    expect(linkToken(KEY, seed)).toBe(linkToken(KEY, seed));
    expect(linkToken(KEY, seed)).not.toBe(linkToken(KEY, newSeed()));
    expect(linkToken('other-secret-'.repeat(4), seed)).not.toBe(linkToken(KEY, seed));
  });

  it('gives a 43-character URL-safe token from a 43-character seed', () => {
    const seed = newSeed();
    expect(seed).toMatch(/^[\w-]{43}$/);
    expect(linkToken(KEY, seed)).toMatch(/^[\w-]{43}$/);
  });

  it('never contains the seed, and the stored digest never contains the token or the seed', () => {
    const seed = newSeed();
    const token = linkToken(KEY, seed);
    const digest = tokenDigest(KEY, token);
    expect(token).not.toContain(seed);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
  });

  it('retries after 30 s, doubling up to 5 minutes', () => {
    expect([0, 1, 2, 3, 4, 5, 9, 50].map(retryDelayMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000, 300_000,
    ]);
    expect(retryDelayMs(-3)).toBe(30_000);
  });

  it('says how long the link is still valid, rounded up, at least a minute', () => {
    const now = new Date('2026-10-04T10:00:00Z');
    expect(validityMinutes(new Date('2026-10-04T10:30:00Z'), now)).toBe(30);
    expect(validityMinutes(new Date('2026-10-04T10:29:59.990Z'), now)).toBe(30);
    expect(validityMinutes(new Date('2026-10-04T10:00:10Z'), now)).toBe(1);
    expect(validityMinutes(new Date('2026-10-04T09:00:00Z'), now)).toBe(1);
  });
});
