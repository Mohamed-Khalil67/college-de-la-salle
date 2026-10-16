import { execFileSync } from 'node:child_process';

/** E2E accounts: the super admin, every @example.test account an examiner, students elsewhere. */
export const SUPER_ADMIN_EMAIL = 'admin@example.test';

export default function globalSetup(): void {
  execFileSync(process.execPath, ['scripts/seed-emulator.mjs', '@example.test'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/bootstrap-superadmin.ts', SUPER_ADMIN_EMAIL], { stdio: 'inherit' });
}