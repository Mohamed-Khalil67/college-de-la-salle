import {
  acceptRequestId,
  accessPath,
  formatLine,
  levelEnabled,
  redact,
  REDACTED,
  scrub,
} from './log-format.js';

describe('acceptRequestId', () => {
  it('keeps a sane id from the caller', () => {
    expect(acceptRequestId('abc12345-req.1_x')).toBe('abc12345-req.1_x');
    expect(acceptRequestId(['abc12345'])).toBe('abc12345');
  });

  it.each([undefined, '', 'short', 'has space in it 12', 'line\nbreak12345', 'x'.repeat(65), '<script>alert(1)', 42])(
    'generates a fresh id for %j',
    (value) => {
      expect(acceptRequestId(value, () => 'generated-id')).toBe('generated-id');
    },
  );

  it('generates a UUID by default', () => {
    expect(acceptRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('redact', () => {
  it('hides credentials by key, at any depth', () => {
    const out = redact({
      method: 'POST',
      headers: { Authorization: 'Bearer abc.def', cookie: 'cdls_refresh=1', 'Set-Cookie': ['a=b'], accept: '*/*' },
      body: { email: 'a@b.c', password: 'Secret!', newPassword: 'x', token: 't', nested: [{ refreshToken: 'r' }] },
    });
    expect(out).toEqual({
      method: 'POST',
      headers: { Authorization: REDACTED, cookie: REDACTED, 'Set-Cookie': REDACTED, accept: '*/*' },
      body: { email: 'a@b.c', password: REDACTED, newPassword: REDACTED, token: REDACTED, nested: [{ refreshToken: REDACTED }] },
    });
  });

  it('scrubs bearer tokens and token= pairs from text, and keeps only name and message of an Error', () => {
    expect(scrub('GET failed with Bearer eyJhbGci.abc.def here')).toBe(`GET failed with Bearer ${REDACTED} here`);
    expect(scrub('/connexion?token=abc123&x=1')).toBe(`/connexion?token=${REDACTED}&x=1`);
    const err = redact(new Error('bad Bearer abc')) as Record<string, unknown>;
    expect(err).toEqual({ name: 'Error', message: `bad Bearer ${REDACTED}` });
    expect('stack' in err).toBe(false);
  });

  it('stops on deep or circular-looking structures', () => {
    const loop: Record<string, unknown> = {};
    loop['self'] = loop;
    expect(JSON.stringify(redact(loop))).toContain('[truncated]');
  });
});

describe('accessPath', () => {
  it('drops the query string and the fragment', () => {
    expect(accessPath('/api/users?search=a&token=zzz')).toBe('/api/users');
  });

  it('never shows the calendar feed address (it is the credential)', () => {
    expect(accessPath('/api/calendar/feed/0123456789abcdef0123456789abcdef.SECRET.ics?x=1')).toBe(
      '/api/calendar/feed/:token',
    );
  });
});

describe('levelEnabled', () => {
  it('orders error < warn < info < debug', () => {
    expect(levelEnabled('error', 'warn')).toBe(true);
    expect(levelEnabled('info', 'warn')).toBe(false);
    expect(levelEnabled('debug', 'debug')).toBe(true);
  });
});

describe('formatLine', () => {
  const entry = {
    time: new Date('2026-10-04T09:00:00Z'),
    level: 'info' as const,
    school: 'cdls-daher',
    context: 'Http',
    message: 'GET /api/health 200',
    requestId: 'abcd1234-ef',
  };

  it('writes one JSON object with the school and the request id', () => {
    const line = JSON.parse(formatLine({ ...entry, fields: { status: 200, level: 'forged' } }, true)) as Record<string, unknown>;
    expect(line).toMatchObject({
      time: '2026-10-04T09:00:00.000Z',
      level: 'info',
      school: 'cdls-daher',
      context: 'Http',
      requestId: 'abcd1234-ef',
      msg: 'GET /api/health 200',
      status: 200,
    });
  });

  it('writes a readable line in development', () => {
    expect(formatLine(entry, false)).toBe('09:00:00 INFO  [Http] (abcd1234) GET /api/health 200');
  });
});
