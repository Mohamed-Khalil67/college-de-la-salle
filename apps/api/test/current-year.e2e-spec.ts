import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANOTHER_YEAR_BECAME_CURRENT } from '../src/school-years/year-guard.js';
import { ADMIN, bearer, createTestApp, type TestApp } from './helpers.js';

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Finding 10: at most one current school year, even when two admins switch at the same moment. */
describe('one current school year (school_years_one_current_key)', () => {
  let t: TestApp;
  let admin: string;
  let seeded: string;
  const ids: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    seeded = (await t.prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id;
    for (const [label, from, to] of [
      ['2051-2052', '2051-09-01', '2052-06-30'],
      ['2052-2053', '2052-09-01', '2053-06-30'],
    ] as const) {
      ids.push((await t.prisma.schoolYear.create({ data: { label, startsOn: day(from), endsOn: day(to) } })).id);
    }
  });

  afterAll(async () => {
    // Put the seeded year back as the current one, then remove the fixtures (and their audit rows).
    await t.prisma.$transaction(async (tx) => {
      await tx.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      await tx.schoolYear.update({ where: { id: seeded }, data: { isCurrent: true } });
    });
    await t.prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await t.prisma.schoolYear.deleteMany({ where: { id: { in: ids } } });
    await t.close();
  });

  it('the database refuses a second current year', async () => {
    await expect(
      t.prisma.schoolYear.update({ where: { id: ids[0]! }, data: { isCurrent: true } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await t.prisma.schoolYear.count({ where: { isCurrent: true } })).toBe(1);
  });

  it('answers a French 409 to the admin who lost the race, and keeps exactly one current year', async () => {
    const [a, b] = [ids[0]!, ids[1]!];
    let lost: { status: number; body: unknown } | undefined;
    // Admin 1 makes A current and has not committed yet; admin 2 asks for B meanwhile. B's clean-up does not see
    // A as current (uncommitted), so before the index both ended up current.
    await t.prisma.$transaction(
      async (tx) => {
        await tx.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
        await tx.schoolYear.update({ where: { id: a }, data: { isCurrent: true } });
        const second = t
          .http()
          .post(`/api/school-years/${b}/current`)
          .set(bearer(admin))
          .then((res) => res);
        await sleep(600);
        void second.then((res) => (lost = { status: res.status, body: res.body }));
      },
      { timeout: 10_000 },
    );
    for (let i = 0; i < 50 && !lost; i++) await sleep(100);
    expect(lost?.status).toBe(409);
    expect(lost?.body).toMatchObject({ message: ANOTHER_YEAR_BECAME_CURRENT });
    const current = await t.prisma.schoolYear.findMany({ where: { isCurrent: true }, select: { id: true } });
    expect(current).toEqual([{ id: a }]);
  });
});
