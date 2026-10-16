import { execFileSync } from 'node:child_process';

/** E2E accounts: the super admin, every @example.test account a teacher, students elsewhere. */
export const SUPER_ADMIN_EMAIL = 'admin@example.test';

const PAGE_IDS = ['home', 'history', 'arabe', 'mathematiques', 'physique-chimie'];

export default async function globalSetup(): Promise<void> {
  execFileSync(process.execPath, ['scripts/seed-emulator.mjs', '@example.test'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/bootstrap-superadmin.ts', SUPER_ADMIN_EMAIL], { stdio: 'inherit' });

  // Teacher edits from earlier runs would hide the bundled defaults the tests assert on.
  const host = process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080';
  for (const id of PAGE_IDS) {
    await fetch(`http://${host}/v1/projects/demo-exam-platform/databases/(default)/documents/content_pages/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner' },
    });
  }
}
