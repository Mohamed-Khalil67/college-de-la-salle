import { AsyncLocalStorage } from 'node:async_hooks';
import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  acceptRequestId,
  accessPath,
  formatLine,
  type LogEntry,
  type LogLevel,
  levelEnabled,
  redact,
  scrub,
} from './log-format.js';

/** The request being served, visible to every log line written while it runs. */
const requestScope = new AsyncLocalStorage<{ readonly requestId: string }>();

/** Id of the request this code runs for; undefined outside a request (start-up, timers). */
export const currentRequestId = (): string | undefined => requestScope.getStore()?.requestId;

export interface AppLoggerOptions {
  readonly level: LogLevel;
  /** JSON lines (production) or readable lines. */
  readonly json: boolean;
  /** The active school pack id: in every line, so one log stream can hold many installs. */
  readonly school: string;
  /** Where lines go; stdout/stderr by default, a list in tests. */
  readonly write?: (line: string, level: LogLevel) => void;
}

const defaultWrite = (line: string, level: LogLevel): void => {
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
};

/**
 * Nest's logger, replaced by one that writes structured lines: level from `LOG_LEVEL`, the request id of
 * the request in progress, the school id, and no credential (strings are scrubbed, objects redacted).
 */
export class AppLogger implements LoggerService {
  readonly #options: AppLoggerOptions;

  constructor(options: AppLoggerOptions) {
    this.#options = options;
  }

  log(message: unknown, ...rest: unknown[]): void {
    this.#emit('info', message, rest);
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.#emit('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]): void {
    this.#emit('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]): void {
    this.#emit('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]): void {
    this.#emit('debug', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]): void {
    this.#emit('error', message, rest);
  }

  /** A line with structured fields (the access log). */
  event(level: LogLevel, context: string, message: string, fields: Record<string, unknown>): void {
    this.#write({ level, context, message, fields: redact(fields) as Record<string, unknown> });
  }

  #emit(level: LogLevel, message: unknown, rest: unknown[]): void {
    if (!levelEnabled(level, this.#options.level)) return;
    // Nest passes the context as the last string; `error(message, stack, context)` puts the stack before it.
    const strings = rest.filter((r): r is string => typeof r === 'string');
    const context = rest.length && typeof rest.at(-1) === 'string' ? strings.at(-1) : undefined;
    const stack = level === 'error' && strings.length > 1 ? strings[0] : undefined;
    const text = typeof message === 'string' ? scrub(message) : JSON.stringify(redact(message));
    this.#write({
      level,
      context,
      message: text,
      fields: stack ? { stack: scrub(stack) } : undefined,
    });
  }

  #write(partial: Pick<LogEntry, 'level' | 'context' | 'message' | 'fields'>): void {
    if (!levelEnabled(partial.level, this.#options.level)) return;
    const line = formatLine(
      { ...partial, time: new Date(), school: this.#options.school, requestId: currentRequestId() },
      this.#options.json,
    );
    (this.#options.write ?? defaultWrite)(line, partial.level);
  }
}

/**
 * Express middleware: gives the request an id (the caller's `X-Request-Id` when sane, else a UUID), echoes it
 * in the response header, runs the rest of the request inside its scope, and writes one access line when
 * the response is done: method, path WITHOUT query string (and without the calendar feed token), status,
 * duration. The health probes go to `debug`: a container healthcheck would otherwise fill the log.
 */
export function requestLogging(logger: AppLogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = acceptRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const path = accessPath(req.originalUrl);
      const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
      const level: LogLevel =
        res.statusCode >= 500 ? 'warn' : path.startsWith('/api/health') ? 'debug' : 'info';
      requestScope.run({ requestId }, () => {
        logger.event(level, 'Http', `${req.method} ${path} ${res.statusCode}`, {
          method: req.method,
          path,
          status: res.statusCode,
          ms,
        });
      });
    });
    requestScope.run({ requestId }, next);
  };
}
