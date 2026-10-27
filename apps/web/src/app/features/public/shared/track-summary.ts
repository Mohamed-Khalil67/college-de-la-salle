import type { PublicPageId } from '../../../i18n/pages';
import type { ContactId, PhotoId, SectionSlug } from '../../../school';

/**
 * What the home card and the page intro of each track need besides words (the words, a kicker and three
 * points, are each language's `content.tracks`; no « A · B » meta strings, docs/brand.md).
 */
export interface TrackSummary {
  readonly page: PublicPageId;
  /** Photo of the home card (the section page uses its own `photo`). */
  readonly cardPhoto: PhotoId;
  /** The track's secretariat lines (CONTACTS). */
  readonly contacts: readonly ContactId[];
  /** Years of the milestones shown as « Repères » on the section page. */
  readonly years: readonly string[];
}

export const TRACK_SUMMARY: Readonly<Record<SectionSlug, TrackSummary>> = {
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
};
