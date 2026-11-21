import type { CreatedUserResponse } from '@cdls/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createTestApp, deleteUsers, type TestApp } from './helpers.js';

/**
 * Finding 7: Prisma writes and reads timestamps in the session's zone. On a cluster that is not on UTC (the
 * embedded dev server takes the host's zone, Africa/Cairo on the school's machines) stored instants were 2 h
 * off. Every connection now runs `TimeZone=UTC`; these checks fail on such a cluster without it.
 */
describe('database session (UTC on every connection)', () => {
  let t: TestApp;
  let admin: string;
  const created: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
  });

  afterAll(async () => {
    await deleteUsers(t.prisma, created);
    await t.close();
  });

  it('runs every connection of the pool in UTC, whatever the server default', async () => {
    // Several at once so more than one pooled connection answers.
    const zones = await Promise.all(
      Array.from({ length: 4 }, () => t.prisma.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`),
    );
    expect(zones.map((z) => z[0]?.zone)).toEqual(['UTC', 'UTC', 'UTC', 'UTC']);
  });

  it('stores the real instant: a row written now is now for the database too', async () => {
    const row = await t.prisma.contactMessage.create({
      data: { name: 'Fuseau', email: 'fuseau@example.org', subject: 'UTC', message: 'Vérification du fuseau.' },
    });
    try {
      const [drift] = await t.prisma.$queryRaw<{ seconds: number }[]>`
        SELECT abs(extract(epoch FROM (created_at - now())))::float8 AS seconds
          FROM contact_messages WHERE id = ${row.id}::uuid`;
      expect(drift?.seconds).toBeLessThan(60);
    } finally {
      await t.prisma.contactMessage.delete({ where: { id: row.id } });
    }
  });

  it('refuses a temporary password the database itself says has expired (phase 4, P2-1)', async () => {
    const user = (
      await t
        .http()
        .post('/api/users')
        .set(bearer(admin))
        .send({ role: 'teacher', firstName: 'Fuseau', lastName: `Expire${Date.now().toString(36)}` })
        .expect(201)
    ).body as CreatedUserResponse;
    created.push(user.user.id);
    await t.prisma.$executeRaw`
      UPDATE users SET temporary_password_expires_at = now() - interval '1 minute' WHERE id = ${user.user.id}::uuid`;
    const res = await t
      .http()
      .post('/api/auth/login')
      .send({ email: user.user.email, password: user.temporaryPassword })
      .expect(401);
    expect((res.body as { message: string }).message).toMatch(/expiré/);
  });
});
