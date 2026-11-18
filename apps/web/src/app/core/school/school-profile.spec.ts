import { describe, expect, it } from 'vitest';
import { parseSchoolProfile } from '@cdls/shared';
import { PROFILE, schoolTimeNow, schoolToday, SECTION_LABELS, wordmarkPlace } from './school-profile';

describe('the school of this build', () => {
  it('is a valid profile', () => {
    expect(parseSchoolProfile(PROFILE).id).toBe(PROFILE.id);
  });

  it('reads « today » and the clock in the profile’s zone, not the machine’s', () => {
    const instant = new Date('2026-12-31T22:30:00Z');
    const offset = (zone: string) => Number(new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).format(instant).match(/GMT([+-]\d+)/)?.[1] ?? 0);
    const hours = (24 + 22 + offset(PROFILE.timeZone)) % 24;
    expect(schoolTimeNow(instant).slice(0, 2)).toBe(String(hours).padStart(2, '0'));
    expect(schoolToday(instant)).toBe(22 + offset(PROFILE.timeZone) >= 24 ? '2027-01-01' : '2026-12-31');
  });

  it('names both sections', () => {
    expect(Object.keys(SECTION_LABELS).sort()).toEqual(['bac', 'nationale']);
  });

  it('writes the wordmark’s place line, with the founding year when there is one', () => {
    const base = { ...PROFILE, names: { ...PROFILE.names, fr: { ...PROFILE.names.fr, place: 'Daher', city: 'Le Caire' } } };
    expect(wordmarkPlace({ ...base, foundingYear: 1898 })).toBe('Daher, Le Caire, depuis 1898');
    expect(wordmarkPlace({ ...base, foundingYear: null })).toBe('Daher, Le Caire');
  });
});
