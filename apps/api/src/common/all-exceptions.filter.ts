import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { currentRequestId } from './app-logger.js';
import { accessPath, scrub } from './log-format.js';
import { mapException } from './error-response.js';

/**
 * The one exception filter (`APP_FILTER`): every error leaves as `{ statusCode, message, code? }`.
 * See `mapException` for the rules; here only the I/O: headers, the body, and the log line of a 5xx
 * (request id from the request scope, path without query, no values, no SQL).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const mapped = mapException(exception);

    if (mapped.serverFault) {
      const id = currentRequestId();
      this.logger.error(
        `${req.method} ${accessPath(req.originalUrl)} -> ${mapped.status} ${scrub(mapped.logLine)}${id ? ` request ${id}` : ''}`,
        mapped.stack ? scrub(mapped.stack) : undefined,
      );
    }

    if (res.headersSent) return;
    for (const [name, value] of Object.entries(mapped.headers)) res.setHeader(name, value);
    res.status(mapped.status).json(mapped.body);
  }
}
