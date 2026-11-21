import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DB_ERROR_CODES, HTTP_ERROR_CODES } from '@cdls/shared';
import {
  INTERNAL_MESSAGE,
  INVALID_PARAMETER_MESSAGE,
  RATE_LIMITED_MESSAGE,
  ROUTE_NOT_FOUND_MESSAGE,
  mapException,
} from './error-response.js';

/** What Prisma throws, without importing the generated client. */
const prismaError = (code: string, message = 'Invalid `prisma.user.create()` invocation: SELECT * FROM users WHERE email = \'a@b.c\'') =>
  Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code, meta: { target: ['email'] } });

/** What Prisma 7 with the pg adapter throws when a `$queryRaw`/`$executeRaw` fails in Postgres. */
const rawQueryError = (sqlstate: string, text: string) =>
  Object.assign(new Error(`Raw query failed. Code: \`${sqlstate}\`. Message: \`${text}\``), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2010',
    meta: {
      driverAdapterError: Object.assign(new Error(text), {
        name: 'DriverAdapterError',
        cause: {
          originalCode: sqlstate,
          originalMessage: text,
          kind: sqlstate.startsWith('40') ? 'TransactionWriteConflict' : 'postgres',
        },
      }),
    },
  });

describe('mapException', () => {
  it('keeps the body and message of an HTTP exception, and adds the status code', () => {
    const m = mapException(new ConflictException('Salle déjà prise.'));
    expect(m.status).toBe(409);
    expect(m.body).toMatchObject({ statusCode: 409, message: 'Salle déjà prise.' });
    expect(m.serverFault).toBe(false);
  });

  it('keeps a custom body untouched (conflict lists, codes, validation messages)', () => {
    const body = { statusCode: 409, message: 'Conflit.', code: 'TIMETABLE_CONFLICT', conflicts: [{ id: 1 }] };
    expect(mapException(new HttpException(body, 409)).body).toEqual(body);
    expect(mapException(new BadRequestException(['a must be a string', 'b is required'])).body).toMatchObject({
      statusCode: 400,
      message: ['a must be a string', 'b is required'],
    });
    expect(mapException(new ForbiddenException()).status).toBe(403);
  });

  it('wraps a plain string response', () => {
    expect(mapException(new HttpException('Salle introuvable.', 404)).body).toEqual({
      statusCode: 404,
      message: 'Salle introuvable.',
    });
  });

  it('says a 429 in French with RATE_LIMITED, keeping a French message of our own', () => {
    expect(mapException(new ThrottlerException()).body).toEqual({
      statusCode: 429,
      message: RATE_LIMITED_MESSAGE,
      code: 'RATE_LIMITED',
      retryable: true,
    });
    expect(mapException(new HttpException('Trop vite.', 429)).body).toEqual({
      statusCode: 429,
      message: 'Trop vite.',
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('turns the router 404 « Cannot GET /… » into ROUTE_NOT_FOUND without echoing the path', () => {
    const m = mapException(new NotFoundException('Cannot GET /api/nope?x=secret'));
    expect(m.body).toEqual({ statusCode: 404, message: ROUTE_NOT_FOUND_MESSAGE, code: 'ROUTE_NOT_FOUND' });
    expect(JSON.stringify(m.body)).not.toContain('nope');
  });

  it('turns a parse pipe refusal into VALIDATION_FAILED in French', () => {
    const m = mapException(new BadRequestException('Validation failed (uuid is expected)'));
    expect(m.body).toEqual({ statusCode: 400, message: INVALID_PARAMETER_MESSAGE, code: 'VALIDATION_FAILED' });
    expect(HTTP_ERROR_CODES).toContain(m.body.code);
  });

  it.each([
    ['P2002', 409, 'UNIQUE_VIOLATION'],
    ['P2003', 409, 'REFERENCE_VIOLATION'],
    ['P2025', 404, 'RECORD_NOT_FOUND'],
    ['P2034', 409, 'SERIALIZATION_FAILURE'],
  ])('maps Prisma %s to %i with code %s and never leaks SQL, values or meta', (code, status, apiCode) => {
    const m = mapException(prismaError(code));
    expect(m.status).toBe(status);
    expect(m.body.code).toBe(apiCode);
    expect(DB_ERROR_CODES).toContain(m.body.code);
    expect(m.serverFault).toBe(false);
    const sent = JSON.stringify(m.body);
    expect(sent).not.toMatch(/SELECT|prisma|a@b\.c|email/i);
  });

  it('tells the caller a serialization failure is worth retrying', () => {
    const m = mapException(prismaError('P2034'));
    expect(m.body.retryable).toBe(true);
    expect(m.headers['Retry-After']).toBe('1');
    expect(mapException(prismaError('P2002')).body.retryable).toBeUndefined();
  });

  it.each([
    ['40P01', 'deadlock detected'],
    ['40001', 'could not serialize access due to concurrent update'],
  ])('maps a %s raised inside a raw query (P2010) like P2034: 409, retryable, Retry-After', (sqlstate, text) => {
    const m = mapException(rawQueryError(sqlstate, text));
    expect(m.status).toBe(409);
    expect(m.body).toMatchObject({ statusCode: 409, code: 'SERIALIZATION_FAILURE', retryable: true });
    expect(m.headers['Retry-After']).toBe('1');
    expect(m.serverFault).toBe(false);
    expect(JSON.stringify(m.body)).not.toMatch(/deadlock|serialize|occupancy/);
    expect(m.logLine).toBe('Prisma P2010 (transient)');
  });

  it('finds the SQLSTATE in the cause chain or on the driver error itself', () => {
    const pg = Object.assign(new Error('deadlock detected'), { name: 'DatabaseError', code: '40P01' });
    expect(mapException(pg)).toMatchObject({ status: 409, body: { code: 'SERIALIZATION_FAILURE' } });
    const wrapped = Object.assign(new Error('transaction failed'), { cause: pg });
    expect(mapException(wrapped).status).toBe(409);
    // Only the message says it (a meta without the adapter error).
    const bare = prismaError('P2010', 'Raw query failed. Code: `40001`. Message: `could not serialize`');
    expect(mapException(bare).body.code).toBe('SERIALIZATION_FAILURE');
  });

  it('keeps any other raw-query failure an opaque 500', () => {
    const m = mapException(rawQueryError('23P01', 'conflicting key value violates exclusion constraint'));
    expect(m.status).toBe(500);
    expect(m.serverFault).toBe(true);
    // A text mentioning the code outside « Code: `…` » is not enough.
    expect(mapException(prismaError('P2010', 'value 40P01 in a column')).status).toBe(500);
  });

  it('turns an unknown Prisma code into an opaque 500, logged without the message', () => {
    const m = mapException(prismaError('P1001'));
    expect(m.status).toBe(500);
    expect(m.body).toEqual({ statusCode: 500, message: INTERNAL_MESSAGE });
    expect(m.serverFault).toBe(true);
    expect(m.logLine).toBe('PrismaClientKnownRequestError P1001');
    expect(m.logLine).not.toMatch(/SELECT/);
    expect(m.stack).toBeUndefined();
  });

  it('turns any other error, or a thrown non-error, into an opaque 500', () => {
    for (const thrown of [new TypeError('secret detail at /srv/app.js'), 'boom', null, { a: 1 }]) {
      const m = mapException(thrown);
      expect(m.status).toBe(500);
      expect(JSON.stringify(m.body)).not.toMatch(/secret|srv|boom/);
      expect(m.serverFault).toBe(true);
    }
  });

  it('flags a 5xx HTTP exception as a server fault but keeps its message', () => {
    const m = mapException(new HttpException('Base injoignable.', 503));
    expect(m.serverFault).toBe(true);
    expect(m.body.message).toBe('Base injoignable.');
  });

  it('passes a client error raised by Express middleware (malformed JSON, payload too large)', () => {
    const parse = Object.assign(new SyntaxError('Unexpected token } in JSON'), { status: 400, expose: true });
    expect(mapException(parse)).toMatchObject({ status: 400, serverFault: false });
    const hidden = Object.assign(new Error('internal'), { status: 400, expose: false });
    expect(mapException(hidden).status).toBe(500);
  });
});
