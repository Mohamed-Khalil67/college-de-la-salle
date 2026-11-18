/**
 * What to do when POST /api/auth/refresh fails. The whole school reaches the site from one address, so a
 * busy minute can answer 429 (or a 5xx, or nothing): the session is still good then, and signing the user
 * out would only send a whole class back to the login page. Only the API's own « this refresh token is
 * invalid » (401, 403) ends the session. Framework-free, tested in refresh-retry.spec.ts.
 */

/** `ok`: a new session. `signed-out`: the API refused the token. `unavailable`: no answer worth trusting yet. */
export type RefreshOutcome = 'ok' | 'signed-out' | 'unavailable';

export type RefreshResult<T> =
  | { readonly outcome: 'ok'; readonly session: T }
  | { readonly outcome: 'signed-out' | 'unavailable' };

/** Retries after the first attempt (so four requests at most). */
export const REFRESH_RETRIES = 3;
/** Longest single wait, even when Retry-After asks for more: a page load must not hang. */
export const MAX_RETRY_DELAY_MS = 8_000;

/** The part of an HTTP error response read here (Angular's HttpErrorResponse has it). */
interface FailedResponse {
  readonly status: number;
  readonly headers?: { get(name: string): string | null };
}

function isFailedResponse(error: unknown): error is FailedResponse {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

/** 401/403: the token is invalid. 0 (network), 408, 429 and 5xx: try again. Anything else: give up for now. */
export function failureKind(status: number): 'signed-out' | 'retry' | 'give-up' {
  if (status === 401 || status === 403) return 'signed-out';
  if (status === 0 || status === 408 || status === 429 || status >= 500) return 'retry';
  return 'give-up';
}

/**
 * Milliseconds to wait before retry number `attempt` (0 for the first retry). A Retry-After in seconds
 * (the API sends `Retry-After`, or `Retry-After-ip` for its per-address ceiling) wins; otherwise 1 s, 2 s,
 * 4 s… with up to 250 ms of jitter so a class does not retry in step. Never more than MAX_RETRY_DELAY_MS.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter: readonly (string | null | undefined)[] = [],
  random: () => number = Math.random,
): number {
  const asked = retryAfter
    .map((value) => (value == null || value.trim() === '' ? Number.NaN : Number(value)))
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0);
  const jitter = Math.floor(random() * 250);
  const base = asked.length ? Math.max(...asked) * 1000 : 1000 * 2 ** attempt;
  return Math.min(base + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Sends the refresh, retrying a 429, a 5xx or a network error up to REFRESH_RETRIES times (waiting as
 * `retryDelayMs` says), and says how it ended. It never decides to sign out on anything but a 401 or 403.
 */
export async function refreshWithRetry<T>(
  send: () => Promise<T>,
  wait: (ms: number) => Promise<void>,
  retries = REFRESH_RETRIES,
): Promise<RefreshResult<T>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return { outcome: 'ok', session: await send() };
    } catch (error: unknown) {
      const failure = isFailedResponse(error) ? error : { status: 0 };
      const kind = failureKind(failure.status);
      if (kind === 'signed-out') return { outcome: 'signed-out' };
      if (kind === 'give-up' || attempt >= retries) return { outcome: 'unavailable' };
      const headers = failure.headers;
      await wait(retryDelayMs(attempt, [headers?.get('Retry-After'), headers?.get('Retry-After-ip')]));
    }
  }
}
