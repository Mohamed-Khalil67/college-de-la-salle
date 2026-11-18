import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSchoolProfile, type SchoolProfile } from '@cdls/shared';

/**
 * The school this install serves (`schools/<SCHOOL>/profile.json`, docs/new-school.md). One install per school:
 * the profile is read once, when the API starts, and never changes while it runs.
 */

/** The pack used when `SCHOOL` is not set. */
export const DEFAULT_SCHOOL = 'cdls-daher';

/**
 * The folder that holds the packs: `SCHOOLS_DIR` when set, else the first `schools/` folder found walking up from
 * this file (the repository root in development and tests, `/app/schools` in the Docker image).
 */
export function schoolsDir(configured?: string): string {
  if (configured) return resolve(configured);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'schools');
    if (existsSync(join(candidate, DEFAULT_SCHOOL, 'profile.json')) || existsSync(join(candidate, 'example'))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('No schools/ folder found: set SCHOOLS_DIR to the folder of the school packs.');
    dir = parent;
  }
}

/** Reads and validates one pack's profile; the error names the known packs when the id is unknown. */
export function loadSchoolProfile(id: string, dir: string): SchoolProfile {
  const file = join(dir, id, 'profile.json');
  if (!existsSync(file)) {
    const known = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'profile.json')))
      .map((d) => d.name);
    throw new Error(`SCHOOL=${id}: no ${file}. Known school packs: ${known.join(', ') || 'none'}.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`SCHOOL=${id}: ${file} is not valid JSON (${error instanceof Error ? error.message : 'unknown error'}).`);
  }
  const profile = parseSchoolProfile(json, file);
  if (profile.id !== id) throw new Error(`SCHOOL=${id}: ${file} says its id is « ${profile.id} »; they must match.`);
  return profile;
}

let active: SchoolProfile | undefined;

/**
 * The profile of this install. `schoolToday()` and the other plain functions of `common/` need the school's time
 * zone without injection, so the profile is kept here, read once. This and `validateEnv` are the only readers of
 * `SCHOOL` / `SCHOOLS_DIR`; `validateEnv` runs first at boot, so a wrong value stops the API before any request.
 */
export function activeSchool(): SchoolProfile {
  active ??= loadSchoolProfile(process.env['SCHOOL'] || DEFAULT_SCHOOL, schoolsDir(process.env['SCHOOLS_DIR']));
  return active;
}
