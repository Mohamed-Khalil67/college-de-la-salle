import { inject } from 'vitest';

// Point the app at the e2e database before AppModule (and ConfigModule) load; process.env wins over .env.
process.env['DATABASE_URL'] = inject('databaseUrl');
process.env['NODE_ENV'] = 'test';
