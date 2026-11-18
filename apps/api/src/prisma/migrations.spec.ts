import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));

/**
 * Timestamps already shared by two applied migrations. They cannot be renamed (every database that
 * applied them knows them by name), so they are allowed; nothing else is.
 */
const KNOWN_SHARED = new Map<string, readonly string[]>([
  ['20261112100000', ['20261112100000_grades_reminder', '20261112100000_slot_exception_study']],
]);

const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('prisma migrations', () => {
  it('are named <14-digit timestamp>_<snake_case name>', () => {
    expect(folders.length).toBeGreaterThan(0);
    expect(folders.filter((name) => !/^\d{14}_[a-z0-9_]+$/.test(name))).toEqual([]);
  });

  it('never share a timestamp (apart from the one pair already applied)', () => {
    const byStamp = new Map<string, string[]>();
    for (const name of folders) {
      const stamp = name.slice(0, 14);
      byStamp.set(stamp, [...(byStamp.get(stamp) ?? []), name]);
    }
    const clashes = [...byStamp].filter(([stamp, names]) => {
      if (names.length < 2) return false;
      const allowed = KNOWN_SHARED.get(stamp);
      return !allowed || names.some((name) => !allowed.includes(name));
    });
    expect(clashes).toEqual([]);
  });
});
