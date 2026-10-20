import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    password: string;
  }
}

/**
 * Every e2e run gets its own throwaway database on the server of DATABASE_URL (`cdls_e2e_<random>`):
 * created empty, migrated with `prisma migrate deploy`, seeded with one known random password, and
 * dropped at the end. The dev database and the demo passwords are never touched.
 */
export default async function setup(project: TestProject) {
  config({ path: '.env', quiet: true });
  const devUrl = process.env['DATABASE_URL'];
  if (!devUrl)
    throw new Error(
      'DATABASE_URL is not set: start `npm run db:dev` (or configure apps/api/.env).',
    );
  const database = `cdls_e2e_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const url = new URL(devUrl);
  url.pathname = `/${database}`;
  const databaseUrl = url.toString();

  const server = new pg.Client({ connectionString: devUrl });
  await server.connect();
  await server.query(`CREATE DATABASE ${database}`);

  const password = randomBytes(12).toString('base64url');
  const dir = mkdtempSync(join(tmpdir(), 'cdls-e2e-'));
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    SEED_PASSWORD: password,
    SEED_CREDENTIALS_FILE: join(dir, 'credentials.md'),
  };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' });

  project.provide('databaseUrl', databaseUrl);
  project.provide('password', password);

  return async () => {
    // Only the database this run created.
    await server.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await server.end();
    rmSync(dir, { recursive: true, force: true });
  };
}
