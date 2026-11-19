import { readdirSync, readFileSync } from 'node:fs';

/** The newest name in a list of migration folder names (they start with a sortable timestamp); null for none. */
export function lastMigration(names: readonly string[]): string | null {
  const real = names.filter((n) => /^\d{14}_/.test(n)).sort();
  return real.at(-1) ?? null;
}

/** `version` of the package.json at `url`; `unknown` when unreadable. Read once, at start. */
export function readVersion(url: URL): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(url, 'utf8'));
    const version = (parsed as { version?: unknown } | null)?.version;
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The migrations folder of the install, newest name; the image runs `migrate deploy` before it starts. */
export function migrationFromDisk(folder: URL): string | null {
  try {
    return lastMigration(readdirSync(folder));
  } catch {
    return null;
  }
}
