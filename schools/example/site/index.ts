import type { SiteConfig } from '../../../apps/web/src/app/school/site-config';

/**
 * What the public site of the fictional École Exemple needs besides its words (see apps/web/src/app/school/site-config.ts).
 * PLACEHOLDER: every id here points at something in archive.ts, content.ts or profile.json.
 */
export const SITE: SiteConfig = {
  homeTitle: {
    fr: 'École Exemple — Quartier des Tilleuls · École de démonstration',
  },
  homePhones: ['standard', 'generale'],
  teaserYears: ['1950', '2000'],
  featureTargets: [
    { photo: 'campus', page: 'history', fragment: 'annee-1950' },
    { photo: 'entree', page: 'bac', fragment: 'inscription' },
    { photo: 'classe', page: 'history', fragment: 'annee-2000' },
  ],
  trackSummary: {
    nationale: { page: 'nationale', cardPhoto: 'classe', contacts: ['standard', 'generale'], years: ['1950', '1975'] },
    bac: { page: 'bac', cardPhoto: 'entree', contacts: ['internationale'], years: ['1950', '2000'] },
  },
  heroPhoto: 'campus',
  historyPhoto: 'campus',
  authImage: { src: '/images/example/entree.svg', width: 1200, height: 800 },
  motto: null,
  creditLinks: null,
  contactTracks: [
    { id: 'generale', value: 'Filière générale' },
    { id: 'internationale', value: 'Filière internationale' },
  ],
};
