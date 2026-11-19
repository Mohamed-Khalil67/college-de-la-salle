import { Controller, ForbiddenException, Get, type INestApplication, Post } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppLogger, requestLogging } from './app-logger.js';
import type { LogLevel } from './log-format.js';

const prisma = (code: string) =>
  Object.assign(new Error('Invalid `prisma.user.create()` invocation: INSERT INTO users (email) VALUES (\'eve@x.test\')'), {
    name: 'PrismaClientKnownRequestError',
    code,
  });

@Controller()
class FailingController {
  @Get('unique') unique(): never {
    throw prisma('P2002');
  }
  @Get('reference') reference(): never {
    throw prisma('P2003');
  }
  @Get('missing') missing(): never {
    throw prisma('P2025');
  }
  @Get('serialization') serialization(): never {
    throw prisma('P2034');
  }
  @Get('forbidden') forbidden(): never {
    throw new ForbiddenException('Action non autorisée.');
  }
  @Get('boom') boom(): never {
    throw new Error('connection to db at 10.0.0.5 failed, password=hunter2');
  }
  @Get('calendar/feed/:token') feed(): string {
    return 'BEGIN:VCALENDAR';
  }
  @Post('echo') echo(): string {
    return 'ok';
  }
}

describe('global exception filter and request logging', () => {
  let app: INestApplication;
  let lines: { line: string; level: LogLevel }[];
  const logged = () => lines.map((l) => JSON.parse(l.line) as Record<string, unknown>);

  beforeEach(async () => {
    lines = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [FailingController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    const logger = new AppLogger({
      level: 'debug',
      json: true,
      school: 'test-school',
      write: (line, level) => lines.push({ line, level }),
    });
    app.useLogger(logger);
    app.use(requestLogging(logger));
    await app.init();
  });

  afterEach(() => app.close());

  it.each([
    ['/unique', 409, 'UNIQUE_VIOLATION'],
    ['/reference', 409, 'REFERENCE_VIOLATION'],
    ['/missing', 404, 'RECORD_NOT_FOUND'],
    ['/serialization', 409, 'SERIALIZATION_FAILURE'],
  ])('%s answers %i %s in the common shape, without SQL or values', async (path, status, code) => {
    const res = await request(app.getHttpServer()).get(path).expect(status);
    expect(res.body).toMatchObject({ statusCode: status, code });
    expect(typeof (res.body as { message: unknown }).message).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/INSERT|eve@x\.test|prisma/i);
  });

  it('adds a retry hint to a serialization failure', async () => {
    const res = await request(app.getHttpServer()).get('/serialization').expect(409);
    expect(res.headers['retry-after']).toBe('1');
    expect((res.body as { retryable: boolean }).retryable).toBe(true);
  });

  it('keeps the message of an HTTP exception and does not log it as a server fault', async () => {
    const res = await request(app.getHttpServer()).get('/forbidden').expect(403);
    expect(res.body).toMatchObject({ statusCode: 403, message: 'Action non autorisée.' });
    expect(lines.some((l) => l.level === 'error')).toBe(false);
  });

  it('answers an unexpected error with an opaque 500 and logs it with the request id, without the secret', async () => {
    const res = await request(app.getHttpServer()).get('/boom').set('X-Request-Id', 'req-abc-12345').expect(500);
    expect(res.headers['x-request-id']).toBe('req-abc-12345');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|10\.0\.0\.5/);
    expect(res.body).toMatchObject({ statusCode: 500 });

    const errors = logged().filter((l) => l['level'] === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ school: 'test-school', requestId: 'req-abc-12345', context: 'Errors' });
    // The stack's first line repeats the message: it is scrubbed of the password pair.
    expect(lines.map((l) => l.line).join('\n')).not.toContain('hunter2');
  });

  it('echoes a sane X-Request-Id, and replaces a hostile or missing one with a generated id', async () => {
    const kept = await request(app.getHttpServer()).get('/forbidden').set('X-Request-Id', 'client-id-0001');
    expect(kept.headers['x-request-id']).toBe('client-id-0001');
    const hostile = await request(app.getHttpServer()).get('/forbidden').set('X-Request-Id', 'a b<script>');
    expect(hostile.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const none = await request(app.getHttpServer()).get('/forbidden');
    expect(none.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(none.headers['x-request-id']).not.toBe(hostile.headers['x-request-id']);
  });

  it('writes one access line per request with school and request id, and never the query string', async () => {
    await request(app.getHttpServer())
      .post('/echo?token=SECRETQUERY&x=1')
      .set('Authorization', 'Bearer abc.def.ghi')
      .set('Cookie', 'cdls_refresh=COOKIEVALUE')
      .send({ password: 'PASSWORDVALUE' })
      .expect(201);
    const access = logged().filter((l) => l['context'] === 'Http');
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({ school: 'test-school', method: 'POST', path: '/echo', status: 201 });
    expect(typeof access[0]!['requestId']).toBe('string');
    const everything = lines.map((l) => l.line).join('\n');
    for (const secret of ['SECRETQUERY', 'abc.def.ghi', 'COOKIEVALUE', 'PASSWORDVALUE']) expect(everything).not.toContain(secret);
  });

  it('does not write the calendar feed address (it is the credential) in the access line', async () => {
    await request(app.getHttpServer()).get('/calendar/feed/0123abcd.SECRETFEEDSECRET.ics?x=1').expect(200);
    const everything = lines.map((l) => l.line).join('\n');
    expect(everything).not.toContain('SECRETFEEDSECRET');
    expect(logged().find((l) => l['context'] === 'Http')).toMatchObject({ path: '/calendar/feed/:token' });
  });
});
