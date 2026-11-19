import { inject } from 'vitest';
import { pinClock } from '../src/common/clock.js';

// Point the app at the e2e database before AppModule (and ConfigModule) load; process.env wins over .env.
process.env['DATABASE_URL'] = inject('databaseUrl');
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] ??= 'warn';

// The seed holds one school year (2026-09-06 to 2027-06-17) with a winter holiday (2026-12-20 to 2027-01-02):
// pin the school's « today » inside it, away from the holiday, so no spec depends on the day it runs. This file
// runs before each spec file imports anything, so a module-level `schoolToday()` is already pinned.
pinClock('2026-10-04T09:00:00Z');
