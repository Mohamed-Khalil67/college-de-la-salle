import { randomBytes } from 'node:crypto';
import type { SessionResponse } from '@cdls/shared';
import type { Response } from 'supertest';
import { inject } from 'vitest';
import { bearer, createTestApp, type TestApp } from './helpers.js';

/**
 * The whole school reaches the site from one public address (every request here comes from 127.0.0.1).
 * Signed-in traffic counts per account and refreshes per token, so one busy class cannot sign out or
 * block the others; one token, and the address as a whole, stay limited.
 */
const saved = vi.hoisted(() => {
  const before = process.env['THROTTLE_LIMIT'];
  // A low general limit, so a few requests prove that it counts per account and not per address. Set
  // before AppModule loads (the general limit is read once, at start-up).
  process.env['THROTTLE_LIMIT'] = '20';
  return before;
});

const cookieOf = (res: Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith('cdls_refresh='))
    ?.split(';')[0] ?? '';

/** Sets a per-request limit for the duration of `run` (they are read from the environment on every request). */
async function withLimit(name: string, value: string, run: () => Promise<void>): Promise<void> {
  const before = process.env[name];
  process.env[name] = value;
  try {
    await run();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

describe('rate limits behind one shared address (e2e)', () => {
  let t: TestApp;
  const sessions: { email: string; token: string; cookie: string }[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    const students = await t.prisma.user.findMany({
      where: { status: 'active', student: { studentNumber: { startsWith: 'CDLS-' } } },
      orderBy: { email: 'desc' },
      take: 7,
      select: { email: true },
    });
    expect(students).toHaveLength(7);
    for (const { email } of students) {
      const res = await t
        .http()
        .post('/api/auth/login')
        .send({ email, password: inject('password') })
        .expect(200);
      sessions.push({ email, token: (res.body as SessionResponse).accessToken, cookie: cookieOf(res) });
    }
  });

  afterAll(async () => {
    await t.close();
    if (saved === undefined) delete process.env['THROTTLE_LIMIT'];
    else process.env['THROTTLE_LIMIT'] = saved;
  });

  it('counts signed-in requests per account, not per address', async () => {
    const [first, ...others] = sessions.slice(0, 6);
    if (!first) throw new Error('no session');
    // 6 accounts x 15 requests from one address: far above the limit of 20 for the address.
    for (const session of [first, ...others]) {
      for (let i = 0; i < 15; i++) {
        await t.http().get('/api/auth/me').set(bearer(session.token)).expect(200);
      }
    }
    // One account alone still stops at 20.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await t.http().get('/api/auth/me').set(bearer(first.token))).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it('lets many sessions behind one address refresh, each with its own budget', async () => {
    // 6 sessions x 8 refreshes = 48 from one address (the old limit was 30 a minute per address, or the
    // sign-in limit when higher: hold that at its production value so it cannot hide a regression).
    await withLimit('LOGIN_THROTTLE_LIMIT', '5', async () => {
      for (const session of sessions.slice(0, 6)) {
        for (let i = 0; i < 8; i++) {
          const res = await t.http().post('/api/auth/refresh').set('Cookie', session.cookie).expect(200);
          session.cookie = cookieOf(res);
          expect(session.cookie).not.toBe('');
        }
      }
    });
  });

  it('never counts a refresh without a cookie against the per-token limit', async () => {
    for (let i = 0; i < 15; i++) await t.http().post('/api/auth/refresh').expect(401);
  });

  it('stops one token from being replayed (REFRESH_THROTTLE_LIMIT per token)', async () => {
    const session = sessions[6];
    if (!session) throw new Error('no session');
    await withLimit('REFRESH_THROTTLE_LIMIT', '10', async () => {
      await t.http().post('/api/auth/refresh').set('Cookie', session.cookie).expect(200);
      const statuses: number[] = [];
      let limited: Response | undefined;
      for (let i = 0; i < 10; i++) {
        const res = await t.http().post('/api/auth/refresh').set('Cookie', session.cookie);
        statuses.push(res.status);
        if (res.status === 429) limited ??= res;
      }
      // Replays are reuse (401, the family is revoked) until the token's budget is spent, then 429.
      expect(statuses.slice(0, 9)).toEqual(Array<number>(9).fill(401));
      expect(statuses[9]).toBe(429);
      expect(Number(limited?.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  it('caps the address as a whole (REFRESH_IP_THROTTLE_LIMIT)', async () => {
    await withLimit('REFRESH_IP_THROTTLE_LIMIT', '12', async () => {
      const statuses: number[] = [];
      let limited: Response | undefined;
      // Every request carries another made-up token, so only the address ceiling can stop them.
      for (let i = 0; i < 30; i++) {
        const cookie = `cdls_refresh=${randomBytes(8).toString('hex')}.${randomBytes(16).toString('hex')}`;
        const res = await t.http().post('/api/auth/refresh').set('Cookie', cookie);
        statuses.push(res.status);
        if (res.status === 429) limited ??= res;
      }
      expect(statuses).toContain(429);
      expect(statuses.filter((s) => s !== 429).every((s) => s === 401)).toBe(true);
      expect(Number(limited?.headers['retry-after-ip'])).toBeGreaterThan(0);
    });
  });
});
