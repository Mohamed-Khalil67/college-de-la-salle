import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * `prisma generate` only needs the schema, so it must work on a fresh clone and in CI with no .env.
 * Commands that connect (migrate, seed) need the real DATABASE_URL from apps/api/.env; without it they fail to connect to the placeholder.
 */
const url = process.env['DATABASE_URL'] ?? 'postgresql://cdls:unset@localhost:5433/cdls_dev';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url,
  },
});
