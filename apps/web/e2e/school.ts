import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayInZone, parseSchoolProfile, type SchoolProfile } from '@cdls/shared';

/** The school the suites run against (`SCHOOL`, default cdls-daher): its profile gives the time zone and the names. */
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../schools');
export const SCHOOL_ID = process.env['SCHOOL'] || 'cdls-daher';
export const PROFILE: SchoolProfile = parseSchoolProfile(
  JSON.parse(readFileSync(join(root, SCHOOL_ID, 'profile.json'), 'utf8')),
  `schools/${SCHOOL_ID}/profile.json`,
);

/** The school's « today » (`YYYY-MM-DD`). */
export function schoolToday(now: Date = new Date()): string {
  return dayInZone(PROFILE.timeZone, now);
}
