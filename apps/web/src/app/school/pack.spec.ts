import { describe, expect, it } from 'vitest';
import { PROFILE } from '../core/school/school-profile';
import { ENABLED_LANGS } from '../i18n/lang';
import { PACK as AR } from './active/ar';
import { DIRECTORS, PHOTOS } from './active/archive';
import { PACK as EN } from './active/en';
import { PACK as FR } from './active/fr';
import { SITE } from './active/index';
import { CONTACTS, localizedPhoto } from './school-info';

/*
 * What the types cannot say about the school pack named by SCHOOL (schools/<id>/site): every id it points at exists,
 * in every language. A new school's pack fails here before it fails in the prerender.
 */

const PACKS = { fr: FR, en: EN, ar: AR } as const;
const photoIds = Object.keys(PHOTOS);
const departmentIds = PROFILE.contacts.departments.map((d) => d.id);

describe('the school pack of this build', () => {
  it('matches the profile it ships with', () => {
    expect(CONTACTS.map((c) => c.id)).toEqual(departmentIds);
    expect(ENABLED_LANGS).toEqual(PROFILE.languages);
  });

  it('points the site configuration at photos, departments and years that exist', () => {
    const photos = [SITE.heroPhoto, SITE.historyPhoto, ...SITE.featureTargets.map((f) => f.photo), ...Object.values(SITE.trackSummary).map((t) => t.cardPhoto)];
    expect(photos.filter((id) => !photoIds.includes(id))).toEqual([]);
    const departments = [...SITE.homePhones, ...Object.values(SITE.trackSummary).flatMap((t) => t.contacts)];
    expect(departments.filter((id) => !departmentIds.includes(id))).toEqual([]);
    const years = new Set(FR.content.milestones.map((m) => m.year));
    const wanted = [...SITE.teaserYears, ...Object.values(SITE.trackSummary).flatMap((t) => t.years)];
    expect(wanted.filter((year) => !years.has(year))).toEqual([]);
    expect(SITE.authImage.width).toBeGreaterThan(0);
  });

  it('keeps every photo of the pack in the milestones and sections, with credits', () => {
    for (const content of [FR.content, EN.content, AR.content]) {
      const used = [...content.milestones.flatMap((m) => (m.photo ? [m.photo] : [])), ...Object.values(content.sections).map((s) => s.photo)];
      expect(used.filter((id) => !photoIds.includes(id))).toEqual([]);
    }
  });

  for (const [lang, pack] of Object.entries(PACKS)) {
    it(`${lang}: words every photo, department and contact track the pack names`, () => {
      expect(Object.keys(pack.content.photos).sort()).toEqual([...photoIds].sort());
      expect(Object.keys(pack.content.contactLabels).sort()).toEqual([...departmentIds].sort());
      expect(Object.keys(pack.messages.contactTracks).sort()).toEqual(SITE.contactTracks.map((t) => t.id).sort());
      for (const id of photoIds) expect(() => localizedPhoto(id, pack.content.photos, pack.content.photoCredits)).not.toThrow();
    });
  }

  it('gives the home page a title in every language, and photo credits when it links any', () => {
    expect(Object.values(SITE.homeTitle).every((title) => title.trim() !== '')).toBe(true);
    if (SITE.creditLinks) expect(FR.messages.layout.photoCredits.before.trim()).not.toBe('');
  });

  it('lists directors only of the two known kinds', () => {
    expect(DIRECTORS.every((d) => d.kind === 'frere' || d.kind === 'laic')).toBe(true);
  });
});
