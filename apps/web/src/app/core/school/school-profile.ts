import { dayInZone, sectionLabels, type SchoolProfile, timeInZone } from '@cdls/shared';
import { GENERATED_PROFILE } from './profile.generated';

/**
 * The school this build is made for (`SCHOOL`, schools/<id>/profile.json): `scripts/select-school.mjs` writes
 * `profile.generated.ts` before every build, serve, test and lint. Never import the generated file elsewhere.
 */
export const PROFILE: SchoolProfile = GENERATED_PROFILE;

/** The sections' names in French (the spaces are French only). */
export const SECTION_LABELS = sectionLabels(PROFILE);

/** The school's IANA time zone, for `Intl.DateTimeFormat`. */
export const SCHOOL_TIME_ZONE = PROFILE.timeZone;

/** The school's « today » (`YYYY-MM-DD`): the same on the server, in any browser zone. */
export function schoolToday(now: Date = new Date()): string {
  return dayInZone(SCHOOL_TIME_ZONE, now);
}

/** The time now at the school (`HH:MM`). */
export function schoolTimeNow(now: Date = new Date()): string {
  return timeInZone(SCHOOL_TIME_ZONE, now);
}

/** The wordmark's second line, in French: « Daher, Le Caire, depuis 1898 ». */
export function wordmarkPlace(profile: SchoolProfile): string {
  const { place, city } = profile.names.fr;
  return profile.foundingYear === null ? `${place}, ${city}` : `${place}, ${city}, depuis ${profile.foundingYear}`;
}
