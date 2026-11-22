import type { SiteConfig } from '../../../apps/web/src/app/school/site-config';

/** What the public site of Collège de la Salle, Daher needs besides its words (see site-config.ts). */
export const SITE: SiteConfig = {
  homeTitle: {
    fr: 'Collège de la Salle — Daher · Bac nationale et Bac français',
  },
  homePhones: ['standard', 'bac', 'secondaire'],
  teaserYears: ['1898', '1905', '1955', '2013'],
  featureTargets: [
    { photo: 'chapelle-coupole', page: 'history', fragment: 'annee-1958' },
    { photo: 'entree-1', page: 'bac', fragment: 'inscription' },
    { photo: 'freres-1926', page: 'history', fragment: 'annee-1926' },
  ],
  trackSummary: {
    nationale: {
      page: 'nationale',
      cardPhoto: 'salle-de-classe',
      contacts: ['standard', 'secondaire'],
      years: ['1898', '1905', '1955', '1957'],
    },
    bac: {
      page: 'bac',
      cardPhoto: 'batiment-brique',
      contacts: ['bac'],
      years: ['1898', '2009', '2013'],
    },
  },
  heroPhoto: 'campus-aerien',
  historyPhoto: 'campus-1907',
  authImage: { src: '/images/school/batiment-brique.jpg', width: 625, height: 425 },
  motto: {
    text: '« Signum Fidei »',
    lang: 'la',
    meaningFr: 'Signe de la foi : la devise des Frères des Écoles chrétiennes, fondateurs du collège.',
  },
  creditLinks: {
    archive: { label: 'lasalle-po.org', url: 'https://lasalle-po.org/' },
    college: { label: 'lasalle-eg.net', url: 'http://www.lasalle-eg.net/' },
  },
  contactTracks: [
    { id: 'nationale-kg', value: 'Bac nationale, jardin d’enfants' },
    { id: 'nationale-primary', value: 'Bac nationale, primaire' },
    { id: 'nationale-prep', value: 'Bac nationale, préparatoire' },
    { id: 'nationale-secondary', value: 'Bac nationale, secondaire' },
    { id: 'bac-primary', value: 'Bac français, maternelle ou élémentaire' },
    { id: 'bac-college', value: 'Bac français, collège' },
    { id: 'bac-lycee', value: 'Bac français, lycée' },
  ],
};
