import type { SessionResponse } from '@cdls/shared';
import { inject } from 'vitest';
import { ADMIN, bearer, createTestApp, type TestApp } from './helpers.js';

const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const header = res.headers['set-cookie'] as string[] | undefined;
  return header?.find((c) => c.startsWith('cdls_refresh='))?.split(';')[0] ?? '';
};

describe('Auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('logs in, rotates the refresh cookie, detects reuse and logs out', async () => {
    const login = await t
      .http()
      .post('/api/auth/login')
      .send({ email: ADMIN, password: inject('password') })
      .expect(200);
    const session = login.body as SessionResponse;
    expect(session.user).toMatchObject({ email: ADMIN, role: 'admin', studentId: null });
    expect(session.expiresIn).toBe(15 * 60);
    const setCookie = (login.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).toMatch(/Path=\/api\/auth/);
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');

    await t.http().get('/api/auth/me').set(bearer(session.accessToken)).expect(200);

    const first = cookieOf(login);
    const refreshed = await t.http().post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = cookieOf(refreshed);
    expect(second).not.toBe(first);

    // The first cookie was rotated away: using it again revokes the whole session family.
    await t.http().post('/api/auth/refresh').set('Cookie', first).expect(401);
    await t.http().post('/api/auth/refresh').set('Cookie', second).expect(401);

    await t.http().post('/api/auth/logout').set('Cookie', second).expect(204);
  });

  it('refuses a refresh without a cookie and a forged access token', async () => {
    await t.http().post('/api/auth/refresh').expect(401);
    await t.http().get('/api/auth/me').set(bearer('not.a.jwt')).expect(401);
  });

  it('refuses deactivated accounts', async () => {
    // A seeded demo student (they carry a CDLS- number), always the same one: other specs leave their own
    // fixture accounts around, and an unordered findFirst may return any of them.
    const user = await t.prisma.user.findFirstOrThrow({
      where: { role: 'student', student: { studentNumber: { startsWith: 'CDLS-' } } },
      orderBy: { email: 'asc' },
    });
    await t.prisma.user.update({ where: { id: user.id }, data: { status: 'disabled' } });
    try {
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: user.email, password: inject('password') })
        .expect(401);
    } finally {
      await t.prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
    }
  });

  it('rate-limits login attempts', async () => {
    // The limit is read per request: test the production default whatever .env says (the browser
    // tests raise it).
    const before = process.env['LOGIN_THROTTLE_LIMIT'];
    process.env['LOGIN_THROTTLE_LIMIT'] = '5';
    try {
      const attempt = () =>
        t.http().post('/api/auth/login').send({ email: ADMIN, password: 'wrong-password' });
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);
      expect(statuses).toContain(429);
    } finally {
      if (before === undefined) delete process.env['LOGIN_THROTTLE_LIMIT'];
      else process.env['LOGIN_THROTTLE_LIMIT'] = before;
    }
  });
});
