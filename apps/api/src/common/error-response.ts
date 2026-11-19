import { HttpException } from '@nestjs/common';
import type { ApiError, DbErrorCode } from '@cdls/shared';

/** What the global exception filter sends, and whether it is a server fault to log. */
export interface MappedError {
  readonly status: number;
  readonly body: ApiError;
  /** Headers to add (`Retry-After` on a transient conflict). */
  readonly headers: Readonly<Record<string, string>>;
  /** A 5xx: logged with the request id. */
  readonly serverFault: boolean;
  /** Safe summary for the log (never SQL, values or personal data). */
  readonly logLine: string;
  /** The stack, for the log only. */
  readonly stack?: string;
}

export const INTERNAL_MESSAGE = 'Erreur interne. Réessayez, ou contactez le secrétariat si cela continue.';

interface PrismaLike {
  readonly code: string;
  readonly name?: unknown;
  readonly meta?: unknown;
}

/** Prisma's known request errors are `P` + four digits; duck-typed so this file never imports the generated client. */
function asPrisma(error: unknown): PrismaLike | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? (error as PrismaLike) : null;
}

const DB_MAPPING: Readonly<
  Record<string, { status: number; code: DbErrorCode; message: string; retryable?: true }>
> = {
  P2002: { status: 409, code: 'UNIQUE_VIOLATION', message: 'Cet élément existe déjà.' },
  P2003: {
    status: 409,
    code: 'REFERENCE_VIOLATION',
    message: 'Cet élément est lié à d’autres données: l’opération est impossible.',
  },
  P2025: { status: 404, code: 'RECORD_NOT_FOUND', message: 'Élément introuvable.' },
  P2034: {
    status: 409,
    code: 'SERIALIZATION_FAILURE',
    message: 'Un autre changement a eu lieu en même temps. Réessayez dans un instant.',
    retryable: true,
  },
};

/** An error raised by Express middleware (body-parser…): `status` 4xx and an `expose` flag. */
function asHttpError(error: unknown): { status: number; message: string } | null {
  if (typeof error !== 'object' || error === null) return null;
  const e = error as { status?: unknown; statusCode?: unknown; expose?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : e.statusCode;
  if (typeof status !== 'number' || status < 400 || status > 499 || e.expose !== true) return null;
  return { status, message: typeof e.message === 'string' ? e.message.slice(0, 200) : 'Requête invalide.' };
}

const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error === 'object' ? 'Object' : typeof error;

/**
 * Turns anything thrown into the one response shape `{ statusCode, message, code? }`.
 * HTTP exceptions keep their own body and message (validation lists, `TIMETABLE_CONFLICT`…); known Prisma
 * errors become 409/404; everything else is an opaque 500. Pure: no logging, no I/O.
 */
export function mapException(exception: unknown): MappedError {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const body: ApiError =
      typeof response === 'string'
        ? { statusCode: status, message: response }
        : { statusCode: status, ...(response as object) } as ApiError;
    return {
      status,
      body,
      headers: {},
      serverFault: status >= 500,
      logLine: `${exception.name} ${status}`,
      stack: exception.stack,
    };
  }

  const prisma = asPrisma(exception);
  const known = prisma ? DB_MAPPING[prisma.code] : undefined;
  if (prisma && known) {
    return {
      status: known.status,
      body: {
        statusCode: known.status,
        message: known.message,
        code: known.code,
        ...(known.retryable ? { retryable: true } : {}),
      },
      headers: known.retryable ? { 'Retry-After': '1' } : {},
      serverFault: false,
      logLine: `Prisma ${prisma.code}`,
    };
  }

  const http = asHttpError(exception);
  if (http)
    return {
      status: http.status,
      body: { statusCode: http.status, message: http.message },
      headers: {},
      serverFault: false,
      logLine: `${errorName(exception)} ${http.status}`,
    };

  // Unknown: never the message (a Prisma message can carry SQL and values), only what it is.
  const detail = prisma ? `${errorName(exception)} ${prisma.code}` : errorName(exception);
  return {
    status: 500,
    body: { statusCode: 500, message: INTERNAL_MESSAGE },
    headers: {},
    serverFault: true,
    logLine: detail,
    stack: exception instanceof Error && !prisma ? exception.stack : undefined,
  };
}
