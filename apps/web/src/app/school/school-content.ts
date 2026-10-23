import type { MatiereGroup } from '@cdls/shared';
import type {
  ContactId,
  Director,
  DirectorRole,
  ExternalLink,
  InfoBlock,
  KeyFigure,
  Milestone,
  PhotoArchive,
  PhotoId,
  PhotoText,
  SectionPage,
  SectionSlug,
} from './content.model';

/**
 * Everything the public pages say about the college, in one language. French (content.fr.ts) is the source;
 * content.en.ts and content.ar.ts must give every field (a missing one does not compile), and
 * school-content.spec.ts checks that the facts that are not words (years, photos, links, headcounts) match.
 */

/** The subjects shown on the track pages (ids of MATIERES in @cdls/shared; the spec checks the two lists agree). */
export const MATIERE_IDS = [
  'arabe',
  'francais',
  'anglais',
  'espagnol',
  'mathematiques',
  'physique-chimie',
  'svt',
  'informatique',
  'ses',
  'histoire-geographie',
  'philosophie',
  'psychologie',
  'humanites',
  'education-civique',
  'education-religieuse',
  'eps',
  'arts',
] as const;
export type MatiereId = (typeof MATIERE_IDS)[number];

export function isMatiereId(id: string): id is MatiereId {
  return (MATIERE_IDS as readonly string[]).includes(id);
}

export interface MatiereText {
  readonly name: string;
  readonly blurb: string;
  readonly alt: string;
}

export interface Founder {
  readonly name: string;
  readonly dates: string;
  readonly role: string;
  readonly facts: readonly { readonly date: string; readonly text: string }[];
  readonly summary: readonly string[];
}

export interface TrackWords {
  readonly kicker: string;
  readonly points: readonly string[];
}

export interface SchoolContent {
  readonly school: {
    /** The wordmark's second line. */
    readonly place: string;
    readonly tagline: string;
    readonly address: string;
  };
  readonly keyFigures: readonly KeyFigure[];
  readonly milestones: readonly Milestone[];
  readonly historyIntro: readonly string[];
  readonly founder: Founder;
  readonly freres: readonly InfoBlock[];
  readonly directors: {
    readonly roles: Readonly<Record<DirectorRole, string>>;
    /** Joins two terms in office (« 1956 – 1961 et 1968 – 1969 »). */
    readonly and: string;
    /** End of a term still running. */
    readonly today: string;
  };
  readonly contactLabels: Readonly<Record<ContactId, string>>;
  readonly links: readonly ExternalLink[];
  readonly sections: Readonly<Record<SectionSlug, SectionPage>>;
  readonly tracks: Readonly<Record<SectionSlug, TrackWords>>;
  readonly photos: Readonly<Record<PhotoId, PhotoText>>;
  readonly photoCredits: Readonly<Record<PhotoArchive, string>>;
  readonly matieres: Readonly<Record<MatiereId, MatiereText>>;
  readonly matiereGroups: Readonly<Record<MatiereGroup, string>>;
}

/** « 1956 – 1961 et 1968 – 1969 », « 2011 – aujourd’hui ». */
export function directorPeriod(director: Director, words: SchoolContent['directors']): string {
  return director.terms.map(([from, to]) => `${from} – ${to ?? words.today}`).join(` ${words.and} `);
}
