import type { CreatedUserResponse, SessionResponse } from '@cdls/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createTestApp, deleteUsers, type TestApp } from './helpers.js';

/**
 * Finding 15: `pg` 8 warns (and pg 9 will throw) when a query is sent on a client that is still busy with
 * another one. It happened on `GET /section-changes` and `POST /auth/password`. This file runs in its own
 * process (one fork per spec file), so the once-per-process deprecation warning is seen here if it happens.
 */
describe('no two queries at once on one pg client', () => {
  let t: TestApp;
  let admin: string;
  const warnings: string[] = [];
  const created: string[] = [];
  const onWarning = (w: Error) => {
    if (w.message.includes('already executing a query')) warnings.push(w.stack ?? w.message);
  };

  beforeAll(async () => {
    // Long enough to name the service that sent the second query.
    Error.stackTraceLimit = 60;
    process.on('warning', onWarning);
    t = await createTestApp();
    admin = await t.token(ADMIN);
  });

  afterAll(async () => {
    process.off('warning', onWarning);
    await deleteUsers(t.prisma, created);
    await t.close();
  });

  it('GET /section-changes (a page and its count)', async () => {
    for (const status of ['', '?status=pending', '?status=approved'])
      await t.http().get(`/api/section-changes${status}`).set(bearer(admin)).expect(200);
    // Warnings are emitted on the next tick.
    await new Promise((resolve) => setImmediate(resolve));
    expect(warnings).toEqual([]);
  });

  it('POST /auth/password (first sign-in password change)', async () => {
    const user = (
      await t
        .http()
        .post('/api/users')
        .set(bearer(admin))
        .send({ role: 'teacher', firstName: 'Requete', lastName: `Seule${Date.now().toString(36)}` })
        .expect(201)
    ).body as CreatedUserResponse;
    created.push(user.user.id);
    const session = (
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: user.user.email, password: user.temporaryPassword })
        .expect(200)
    ).body as SessionResponse;
    await t
      .http()
      .post('/api/auth/password')
      .set(bearer(session.accessToken))
      .send({ currentPassword: user.temporaryPassword, newPassword: 'Une-Requete-A-La-Fois-26' })
      .expect(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(warnings).toEqual([]);
  });

  it('PATCH /school-years/:id and DELETE /classes/:id (counts inside their transaction)', async () => {
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    const year = await t.prisma.schoolYear.create({
      data: { label: '2061-2062', startsOn: day('2061-09-01'), endsOn: day('2062-06-30') },
    });
    try {
      const section = await t.prisma.section.findFirstOrThrow({ orderBy: { code: 'asc' } });
      const schoolClass = await t.prisma.schoolClass.create({
        data: { schoolYearId: year.id, sectionId: section.id, code: 'pg-seule', label: 'Requête seule' },
      });
      await t
        .http()
        .patch(`/api/school-years/${year.id}`)
        .set(bearer(admin))
        .send({ startsOn: '2061-09-02', endsOn: '2062-06-29' })
        .expect(200);
      await t.http().delete(`/api/classes/${schoolClass.id}`).set(bearer(admin)).expect(204);
    } finally {
      await t.prisma.auditLog.deleteMany({ where: { entityId: year.id } });
      await t.prisma.schoolClass.deleteMany({ where: { schoolYearId: year.id } });
      await t.prisma.schoolYear.delete({ where: { id: year.id } });
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(warnings).toEqual([]);
  });

  it('the other paginated lists that read a page and its count', async () => {
    for (const path of ['/api/users?page=1', '/api/contact-messages?page=1', '/api/posts?page=1'])
      await t.http().get(path).set(bearer(admin)).expect(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(warnings).toEqual([]);
  });
});
