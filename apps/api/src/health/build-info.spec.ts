import { lastMigration, migrationFromDisk, readVersion } from './build-info.js';

describe('build info', () => {
  it('picks the newest migration by its timestamp and ignores other entries', () => {
    expect(
      lastMigration(['20261021000300_a', '20261113000000_b', 'migration_lock.toml', '20260901000000_c']),
    ).toBe('20261113000000_b');
    expect(lastMigration(['migration_lock.toml'])).toBeNull();
    expect(lastMigration([])).toBeNull();
  });

  it('reads this package version, and says unknown rather than failing', () => {
    expect(readVersion(new URL('../../package.json', import.meta.url))).toMatch(/^\d+\.\d+\.\d+/);
    expect(readVersion(new URL('./nothing-here.json', import.meta.url))).toBe('unknown');
  });

  it('finds the newest migration folder of the repository, and null for a missing folder', () => {
    expect(migrationFromDisk(new URL('../../prisma/migrations/', import.meta.url))).toMatch(/^\d{14}_/);
    expect(migrationFromDisk(new URL('./no-such-folder/', import.meta.url))).toBeNull();
  });
});
