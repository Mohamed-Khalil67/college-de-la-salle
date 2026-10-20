/**
 * A throwaway PostgreSQL 18 for development, from npm (embedded-postgres): no install, no admin rights,
 * nothing touched on the system PostgreSQL service. Data lives in apps/api/.dev-db (gitignored).
 *
 *   npm run db:dev        (keep it running in its own terminal; Ctrl+C stops it)
 *
 * On first start it creates the cluster with a random password for the `cdls` user and points
 * DATABASE_URL in apps/api/.env at it, unless .env already points at another database (for example
 * the system PostgreSQL 18 on port 5432, see README).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const PORT = 5433;
const USER = 'cdls';
const DATABASE = 'cdls_dev';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = `${root}.dev-db`;
const secretFile = `${dir}/password.txt`;
const envFile = `${root}.env`;

mkdirSync(dir, { recursive: true });
const fresh = !existsSync(`${dir}/data/PG_VERSION`);
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(18).toString('base64url'), { mode: 0o600 });
const password = readFileSync(secretFile, 'utf8').trim();

const pg = new EmbeddedPostgres({
  databaseDir: `${dir}/data`,
  user: USER,
  password,
  port: PORT,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

if (fresh) await pg.initialise();
await pg.start();

const client = pg.getPgClient('postgres', 'localhost');
await client.connect();
const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DATABASE]);
await client.end();
if (!exists.rowCount) await pg.createDatabase(DATABASE);

const url = `postgresql://${USER}:${encodeURIComponent(password)}@localhost:${PORT}/${DATABASE}?schema=public`;
const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : readFileSync(`${root}.env.example`, 'utf8');
const current = /^DATABASE_URL=.*$/m.exec(env)?.[0] ?? '';
if (!current || current.includes('CHANGE_ME') || current.includes(`:${PORT}/`)) {
  const line = `DATABASE_URL="${url}"`;
  writeFileSync(envFile, current ? env.replace(current, line) : `${env.trimEnd()}\n${line}\n`);
  console.log(`apps/api/.env now points at the dev database (port ${PORT}).`);
} else {
  console.log(`apps/api/.env points at another database; left unchanged.`);
}
console.log(`Dev PostgreSQL 18 running on localhost:${PORT}, database ${DATABASE}. Ctrl+C to stop.`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
