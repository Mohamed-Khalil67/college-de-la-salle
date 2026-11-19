import { randomUUID } from 'node:crypto';

/* Pure pieces of the logging: request ids, redaction, line formatting, the path an access line may show.
 * No Nest, no I/O, so each has a spec. */

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const RANK: Readonly<Record<LogLevel, number>> = { error: 0, warn: 1, info: 2, debug: 3 };

/** Is a line of `level` written when the configured level is `threshold`? */
export const levelEnabled = (level: LogLevel, threshold: LogLevel): boolean =>
  RANK[level] <= RANK[threshold];

/* Request id ----------------------------------------------------------------------------------- */

const SANE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;

/**
 * The id of a request: the caller's `X-Request-Id` when it is a sane token (8 to 64 characters of
 * `A-Z a-z 0-9 . _ -`, so it cannot forge log lines or headers), otherwise a fresh UUID.
 */
export function acceptRequestId(
  header: unknown,
  generate: () => string = randomUUID,
): string {
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && SANE_REQUEST_ID.test(value) ? value : generate();
}

/* Redaction ------------------------------------------------------------------------------------ */

export const REDACTED = '[redacted]';
/** Keys whose value is never written: headers and body fields that carry a credential. */
const SECRET_KEY = /authorization|cookie|password|passwd|token|secret|api[-_]?key|credential|hash/i;
const MAX_DEPTH = 6;

/** Deep copy of `value` with every secret-looking key replaced; strings lose any `Bearer …` token. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrub(value);
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return out;
}

/** Removes bearer tokens and `token=`/`password=` pairs from free text. */
export function scrub(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(token|password|secret)=[^\s&"']+/gi, `$1=${REDACTED}`);
}

/* Access path ---------------------------------------------------------------------------------- */

const FEED_PATH = /(\/calendar\/feed\/)[^/?#]+/i;

/**
 * The path an access line shows: never the query string (it can carry a token), and never the calendar
 * feed address, which is itself the credential (`/api/calendar/feed/:token.ics`).
 */
export function accessPath(url: string): string {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return path.replace(FEED_PATH, '$1:token').slice(0, 200);
}

/* Line ----------------------------------------------------------------------------------------- */

export interface LogEntry {
  readonly time: Date;
  readonly level: LogLevel;
  readonly school: string;
  readonly context?: string;
  readonly message: string;
  readonly requestId?: string;
  /** Extra structured fields (already redacted). */
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** One log line: a JSON object in production, a readable line otherwise. */
export function formatLine(entry: LogEntry, json: boolean): string {
  if (json) {
    // Extra fields first: they can never overwrite the standard ones.
    return JSON.stringify({
      ...entry.fields,
      time: entry.time.toISOString(),
      level: entry.level,
      school: entry.school,
      ...(entry.context ? { context: entry.context } : {}),
      ...(entry.requestId ? { requestId: entry.requestId } : {}),
      msg: entry.message,
    });
  }
  const fields = entry.fields && Object.keys(entry.fields).length ? ` ${JSON.stringify(entry.fields)}` : '';
  const hhmmss = entry.time.toISOString().slice(11, 19);
  return `${hhmmss} ${entry.level.toUpperCase().padEnd(5)} [${entry.context ?? 'App'}]${
    entry.requestId ? ` (${entry.requestId.slice(0, 8)})` : ''
  } ${entry.message}${fields}`;
}
