import { describe, expect, it } from 'vitest';
import {
  failureKind,
  MAX_RETRY_DELAY_MS,
  REFRESH_RETRIES,
  refreshWithRetry,
  retryDelayMs,
} from './refresh-retry';

/** An HTTP error like Angular's HttpErrorResponse. */
function httpError(status: number, headers: Record<string, string> = {}) {
  return { status, headers: { get: (name: string) => headers[name] ?? null } };
}

/** A send() that fails with each error in turn, then answers `session`. */
function sequence(errors: unknown[], session = 'session') {
  let calls = 0;
  const send = (): Promise<string> => {
    const error = errors[calls++];
    return error === undefined ? Promise.resolve(session) : Promise.reject(error);
  };
  return { send, calls: () => calls };
}

function recorder() {
  const waits: number[] = [];
  return { waits, wait: (ms: number) => (waits.push(ms), Promise.resolve()) };
}

describe('failureKind', () => {
  it('signs out only when the API refuses the token', () => {
    expect(failureKind(401)).toBe('signed-out');
    expect(failureKind(403)).toBe('signed-out');
  });

  it('retries a busy server, a server error and a lost connection', () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504]) expect(failureKind(status)).toBe('retry');
  });

  it('gives up (without signing out) on anything else', () => {
    expect(failureKind(400)).toBe('give-up');
    expect(failureKind(404)).toBe('give-up');
  });
});

describe('retryDelayMs', () => {
  const noJitter = () => 0;

  it('backs off 1 s, 2 s, 4 s without Retry-After', () => {
    expect([0, 1, 2].map((attempt) => retryDelayMs(attempt, [], noJitter))).toEqual([1000, 2000, 4000]);
  });

  it('honours Retry-After (the larger of the two headers) and adds jitter', () => {
    expect(retryDelayMs(0, ['3', null], noJitter)).toBe(3000);
    expect(retryDelayMs(0, [null, '5'], noJitter)).toBe(5000);
    expect(retryDelayMs(0, ['2', '4'], noJitter)).toBe(4000);
    expect(retryDelayMs(0, ['2'], () => 0.5)).toBe(2125);
  });

  it('ignores a Retry-After it cannot read and never waits longer than the cap', () => {
    expect(retryDelayMs(1, ['soon', ''], noJitter)).toBe(2000);
    expect(retryDelayMs(0, ['60'], noJitter)).toBe(MAX_RETRY_DELAY_MS);
    expect(retryDelayMs(10, [], noJitter)).toBe(MAX_RETRY_DELAY_MS);
  });
});

describe('refreshWithRetry', () => {
  it('returns the session on success, without waiting', async () => {
    const { waits, wait } = recorder();
    await expect(refreshWithRetry(sequence([]).send, wait)).resolves.toEqual({
      outcome: 'ok',
      session: 'session',
    });
    expect(waits).toEqual([]);
  });

  it('signs out at once on 401 and on 403', async () => {
    for (const status of [401, 403]) {
      const { waits, wait } = recorder();
      const attempts = sequence([httpError(status)]);
      await expect(refreshWithRetry(attempts.send, wait)).resolves.toEqual({ outcome: 'signed-out' });
      expect(attempts.calls()).toBe(1);
      expect(waits).toEqual([]);
    }
  });

  it('waits as Retry-After says on a 429, then succeeds', async () => {
    const { waits, wait } = recorder();
    const attempts = sequence([httpError(429, { 'Retry-After': '2' })]);
    const result = await refreshWithRetry(attempts.send, wait);
    expect(result.outcome).toBe('ok');
    expect(attempts.calls()).toBe(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(2000);
    expect(waits[0]).toBeLessThan(2250);
  });

  it('retries a 5xx and a network error', async () => {
    const { wait } = recorder();
    const attempts = sequence([httpError(503), httpError(0), new TypeError('Failed to fetch')]);
    await expect(refreshWithRetry(attempts.send, wait)).resolves.toMatchObject({ outcome: 'ok' });
    expect(attempts.calls()).toBe(4);
  });

  it('stops after a bounded number of retries and reports the server unavailable, not signed out', async () => {
    const { waits, wait } = recorder();
    const attempts = sequence(Array.from({ length: 10 }, () => httpError(429)));
    await expect(refreshWithRetry(attempts.send, wait)).resolves.toEqual({ outcome: 'unavailable' });
    expect(attempts.calls()).toBe(REFRESH_RETRIES + 1);
    expect(waits).toHaveLength(REFRESH_RETRIES);
  });

  it('signs out when a retry is finally refused', async () => {
    const { wait } = recorder();
    const attempts = sequence([httpError(502), httpError(401)]);
    await expect(refreshWithRetry(attempts.send, wait)).resolves.toEqual({ outcome: 'signed-out' });
  });

  it('gives up without retrying (and without signing out) on another client error', async () => {
    const { waits, wait } = recorder();
    const attempts = sequence([httpError(400)]);
    await expect(refreshWithRetry(attempts.send, wait)).resolves.toEqual({ outcome: 'unavailable' });
    expect(waits).toEqual([]);
  });
});
