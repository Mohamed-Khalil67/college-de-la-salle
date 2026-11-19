import { BadRequestException, ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { DB_ERROR_CODES } from '@cdls/shared';
import { INTERNAL_MESSAGE, mapException } from './error-response.js';

/** What Prisma throws, without importing the generated client. */
const prismaError = (code: string, message = 'Invalid `prisma.user.create()` invocation: SELECT * FROM users WHERE email = \'a@b.c\'') =>
  Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code, meta: { target: ['email'] } });

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
    expect(mapException(new HttpException('Trop vite.', 429)).body).toEqual({ statusCode: 429, message: 'Trop vite.' });
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
