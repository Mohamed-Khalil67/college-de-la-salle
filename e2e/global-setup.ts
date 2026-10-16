import { execFileSync } from 'node:child_process';

/** Every @example.test account is an examiner in the E2E world; students use @students.test. */
export default function globalSetup(): void {
  execFileSync(process.execPath, ['scripts/seed-emulator.mjs', '@example.test'], { stdio: 'inherit' });
}
