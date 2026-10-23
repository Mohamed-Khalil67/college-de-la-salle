/**
 * Creates the first administrator of a fresh (production) database, without the demo seed.
 *
 *   node dist/cli/create-admin.js --email direction@lasalle-daher.eg --first Prénom --last Nom [--reset]
 *
 * - Also makes sure the reference data exists (the two sections and the subject catalogue); safe to re-run.
 * - The password comes from CREATE_ADMIN_PASSWORD, or is generated and printed once. Either way the account
 *   must choose its own password at the first sign-in (`mustChangePassword`).
 * - `--reset` sets a new password on an existing administrator (use it if the password was lost).
 * Reads DATABASE_URL from the environment. Never logs the password anywhere but the terminal that ran it.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { MATIERES, passwordProblems, SECTION_LABELS, type SectionId } from '@cdls/shared';
import { hash } from 'argon2';
import { PrismaClient, Role } from '../generated/prisma/client.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    first: { type: 'string' },
    last: { type: 'string' },
    reset: { type: 'boolean', default: false },
  },
});

const email = values.email?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  fail('Usage: create-admin --email <address> --first <prénom> --last <nom> [--reset]');
}
const generated = !process.env['CREATE_ADMIN_PASSWORD'];
const password = process.env['CREATE_ADMIN_PASSWORD'] ?? randomBytes(15).toString('base64url');
const problems = passwordProblems(password, email);
if (problems.length) fail(problems.join(' '));

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) fail('DATABASE_URL is not set.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  await ensureReferenceData();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !values.reset) {
    fail(`${email} exists already. Add --reset to give this administrator a new password.`);
  }
  if (existing && existing.role !== Role.admin) fail(`${email} exists and is not an administrator.`);

  const passwordHash = await hash(password);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            status: 'active',
            mustChangePassword: true,
            temporaryPasswordExpiresAt: null,
            passwordChangedAt: now,
          },
        })
      : await tx.user.create({
          data: {
            email,
            passwordHash,
            role: Role.admin,
            firstName: values.first?.trim() || 'Administration',
            lastName: values.last?.trim() || 'CDLS',
            mustChangePassword: true,
          },
        });
    await tx.refreshToken.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: existing ? 'user.password_reset' : 'user.create',
        entity: 'user',
        entityId: user.id,
        after: { role: 'admin', via: 'create-admin' },
      },
    });
  });

  console.log(`${existing ? 'Password reset for' : 'Administrator created:'} ${email}`);
  if (generated) console.log(`Temporary password (shown once, change it at first sign-in): ${password}`);
  else console.log('The password you supplied is temporary: change it at first sign-in.');
} finally {
  await prisma.$disconnect();
}

/** Sections and subjects are not created by migrations; a new school needs them before the first class. */
async function ensureReferenceData(): Promise<void> {
  for (const code of Object.keys(SECTION_LABELS) as SectionId[]) {
    await prisma.section.upsert({
      where: { code },
      update: {},
      create: { code, label: SECTION_LABELS[code] },
    });
  }
  for (const m of MATIERES) {
    await prisma.subject.upsert({
      where: { id: m.id },
      update: {},
      create: { id: m.id, name: m.name, group: m.group, sections: [...m.tracks] },
    });
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
