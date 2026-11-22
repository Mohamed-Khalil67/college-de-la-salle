import { request, type FullConfig } from '@playwright/test';
import { ACCOUNTS } from './accounts';

/**
 * Before the first test: the stack answers and the demo accounts sign in. A stack with the default sign-in
 * limit (5 a minute) or an old seed would otherwise fail dozens of tests one by one with « sign-in failed »;
 * this says what to fix once.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  const api = await request.newContext({ baseURL });
  try {
    const health = await api.get('/api/health').catch(() => null);
    if (!health?.ok()) throw new Error(`No API behind ${baseURL}/api: start the stack (README, « Browser tests »).`);
    for (const [role, account] of Object.entries(ACCOUNTS)) {
      const res = await api.post('/api/auth/login', { data: account });
      if (res.status() === 429)
        throw new Error('Sign-in is rate limited: set LOGIN_THROTTLE_LIMIT=1000 and THROTTLE_LIMIT=100000 in apps/api/.env and restart the API.');
      if (!res.ok()) throw new Error(`The demo ${role} cannot sign in (${res.status()}): run npm run db:seed, which rewrites apps/api/demo-credentials.local.md.`);
    }
  } finally {
    await api.dispose();
  }
}
