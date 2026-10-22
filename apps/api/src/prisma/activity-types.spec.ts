import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SYSTEM_ACTIVITY_TYPES } from '@cdls/shared';

/** The values of the `event_kind` enum the activity types replaced (migration 20261021000300). */
const OLD_KINDS = [
  'cours',
  'td',
  'tp',
  'examen',
  'controle',
  'devoir',
  'revision',
  'activite',
  'reunion',
];

const migration = readFileSync(
  fileURLToPath(
    new URL('../../prisma/migrations/20261021000300_activity_types/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('system activity types', () => {
  it('cover every value of the old event_kind enum (the seed creates them from SYSTEM_ACTIVITY_TYPES)', () => {
    expect(SYSTEM_ACTIVITY_TYPES.map((t) => t.code)).toEqual(OLD_KINDS);
  });

  it('are created by the migration with the same label and flags', () => {
    for (const t of SYSTEM_ACTIVITY_TYPES) {
      const flags = [t.repeatable, t.gradable, t.homework, true].join(String.raw`,\s*`);
      const row = new RegExp(
        String.raw`\(uuidv7\(\), '${t.code}',\s+'${t.label}',\s+'${t.colour}',\s+'${t.icon}',\s+${flags}`,
      );
      expect(migration, t.code).toMatch(row);
    }
  });
});
