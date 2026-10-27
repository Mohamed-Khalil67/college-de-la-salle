import { Env } from './env.validation.js';

type LimitKey = 'LOGIN_THROTTLE_LIMIT' | 'CONTACT_THROTTLE_LIMIT' | 'FEED_THROTTLE_LIMIT';

const DEFAULTS = new Env();

/**
 * A per-route rate limit, read when a request arrives. `@Throttle()` runs where no `ConfigService` is
 * injected, so it reads the environment itself; the default is the one declared in `Env` (the value that
 * `validateEnv` checks at start-up), never a second copy of it.
 */
export function throttleLimit(key: LimitKey): () => number {
  return () => {
    const value = Number(process.env[key]);
    return Number.isInteger(value) && value >= 1 ? value : DEFAULTS[key];
  };
}
