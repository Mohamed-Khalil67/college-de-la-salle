import type { PhotoId, SectionPage } from '../../school';

/**
 * Short presentation of each track for cards and page intros. The facts are those of
 * school/tracks.ts, rewritten as one plain line each (no « A · B » meta strings, docs/brand.md).
 */
export interface TrackSummary {
  readonly link: string;
  readonly kicker: string;
  readonly points: readonly string[];
  /** Photo of the home card (the section page uses its own `photo`). */
  readonly cardPhoto: PhotoId;
  /** Contact lines (labels of CONTACTS) of the track's secretariat. */
  readonly contacts: readonly string[];
  /** Years of MILESTONES shown as « Repères » on the section page. */
  readonly years: readonly string[];
}

export const TRACK_SUMMARY: Readonly<Record<SectionPage['slug'], TrackSummary>> = {
  nationale: {
    link: '/bac-nationale',
    kicker: 'Programme du ministère égyptien, Thanaweya Amma',
    points: [
      'Établissement bilingue, du jardin d’enfants au secondaire',
      'Français première langue étrangère, sciences enseignées en français',
      'Anglais deuxième langue étrangère',
    ],
    cardPhoto: 'salle-de-classe',
    contacts: ['Standard', 'Cycle secondaire'],
    years: ['1898', '1905', '1955', '1957'],
  },
  bac: {
    link: '/bac-francais',
    kicker: 'Programmes français, section homologuée par l’AEFE',
    points: [
      'Ouverte en septembre 2009, de la Moyenne Section à la Terminale',
      'Homologuée le 10 janvier 2013 pour le lycée',
      'Enseignants certifiés de l’Éducation nationale',
    ],
    cardPhoto: 'batiment-brique',
    contacts: ['Bac français'],
    years: ['1898', '2009', '2013'],
  },
};
