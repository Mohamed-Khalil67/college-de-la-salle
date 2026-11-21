import type { CreatedUserResponse, ImportUsersResponse } from '@cdls/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pinClock } from '../src/common/clock.js';
import { schoolToday, toDay } from '../src/common/dates.js';
import { ADMIN, bearer, createTestApp, deleteUsers, type TestApp } from './helpers.js';

/** The instant `test/setup-env.ts` pins for every spec; put back after each test here. */
const SUITE_CLOCK = '2026-10-04T09:00:00Z';
/**
 * 22:30 UTC on 4 October is 01:30 on 5 October in Cairo (UTC+3 until the end of October): the school's day and the
 * UTC date differ, which is when Prisma's `@default(now())` gave the enrolment the day before (finding 9).
 */
const AFTER_MIDNIGHT = '2026-10-04T22:30:00Z';

describe('enrolment date of created and imported students (school day, not UTC date)', () => {
  let t: TestApp;
  let admin: string;
  let schoolClass: { id: string; code: string; section: { code: string } };
  const userIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
    schoolClass = await t.prisma.schoolClass.findFirstOrThrow({
      where: { schoolYear: { isCurrent: true } },
      orderBy: [{ code: 'asc' }],
      select: { id: true, code: true, section: { select: { code: true } } },
    });
  });

  afterAll(async () => {
    pinClock(SUITE_CLOCK);
    await deleteUsers(t.prisma, userIds);
    await t.close();
  });

  const enrolledOn = async (userId: string) => {
    const student = await t.prisma.student.findUniqueOrThrow({
      where: { userId },
      include: { enrollments: true },
    });
    expect(student.enrollments).toHaveLength(1);
    return toDay(student.enrollments[0]!.enrolledOn);
  };

  it('is the school day for an account created between midnight and 02:00', async () => {
    pinClock(AFTER_MIDNIGHT);
    try {
      expect(schoolToday()).toBe('2026-10-05');
      const res = await t
        .http()
        .post('/api/users')
        .set(bearer(admin))
        .send({ role: 'student', firstName: 'Minuit', lastName: `Inscrit${Date.now().toString(36)}`, classId: schoolClass.id })
        .expect(201);
      const created = res.body as CreatedUserResponse;
      userIds.push(created.user.id);
      expect(await enrolledOn(created.user.id)).toBe('2026-10-05');
    } finally {
      pinClock(SUITE_CLOCK);
    }
  });

  it('is the school day for a roster imported between midnight and 02:00', async () => {
    pinClock(AFTER_MIDNIGHT);
    try {
      const last = `Importe${Date.now().toString(36)}`;
      const file = Buffer.from(
        ['Nom;Prénom;Section;Classe;Matricule;Date de naissance', `${last};Minuit;${schoolClass.section.code};${schoolClass.code};;`].join('\n'),
      );
      const res = await t
        .http()
        .post('/api/users/import?role=student')
        .set(bearer(admin))
        .attach('file', file, { filename: 'eleves.csv', contentType: 'text/csv' })
        .expect(201);
      const [account] = (res.body as ImportUsersResponse).created;
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: account!.email } });
      userIds.push(user.id);
      expect(await enrolledOn(user.id)).toBe('2026-10-05');
    } finally {
      pinClock(SUITE_CLOCK);
    }
  });
});
