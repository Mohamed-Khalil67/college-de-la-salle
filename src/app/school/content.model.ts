/**
 * Content model of the site. Pure types: no Angular.
 *
 * The site is in French. These pages are institutional and static (prerendered at build time);
 * everything that changes during the school year (announcements, homework, resources, grades) lives
 * in Firestore and is written by teachers: see src/app/space.
 */

export type PhotoId =
  | 'campus-aerien'
  | 'batiment-brique'
  | 'construction-1954'
  | 'inauguration-1955'
  | 'inauguration-1955-discours'
  | 'freres-1926'
  | 'campus-1907'
  | 'campus-1954'
  | 'chantier-batiments-1'
  | 'chantier-batiments-2'
  | 'chantier-batiments-3'
  | 'chantier-batiments-4'
  | 'chapelle-chantier-1'
  | 'chapelle-chantier-2'
  | 'chapelle-chantier-3'
  | 'chapelle-coupole'
  | 'chapelle-facade'
  | 'automobile'
  | 'salle-de-classe'
  | 'bureau'
  | 'nef-archive'
  | 'entree-1'
  | 'entree-2'
  | 'entree-3'
  | 'batiment-ancien'
  | 'terrain';

export interface Photo {
  readonly id: PhotoId;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** Alternative text, in French. */
  readonly alt: string;
  readonly caption: string;
  readonly credit: string;
  readonly sourceUrl: string;
}

export interface Milestone {
  readonly year: string;
  readonly title: string;
  readonly text: string;
  readonly photo: PhotoId | null;
  /** Where the fact comes from, shown in small print. */
  readonly source: string;
}

export interface KeyFigure {
  readonly value: string;
  readonly label: string;
}

/** A head of the college, from the school's own list. */
export interface Director {
  readonly name: string;
  readonly period: string;
  /** « Frère » or « Laïc ». */
  readonly kind: 'frere' | 'laic';
  readonly role?: string;
}

export interface ContactLine {
  readonly label: string;
  readonly phones: readonly string[];
}

export interface ExternalLink {
  readonly label: string;
  readonly url: string;
  readonly note: string;
}

/** A titled block of a section page: paragraphs, then optional bullet points. */
export interface InfoBlock {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly items: readonly string[];
}

/** One row of the Bac section's headcount table. */
export interface LevelCount {
  readonly cycle: string;
  readonly levels: readonly { readonly level: string; readonly students: number }[];
}

/** The two tracks of the college: Bac nationale (Egyptian programme) and Bac français. */
export interface SectionPage {
  readonly slug: 'nationale' | 'bac';
  readonly title: string;
  readonly kicker: string;
  readonly intro: string;
  readonly photo: PhotoId;
  readonly facts: readonly KeyFigure[];
  readonly blocks: readonly InfoBlock[];
  readonly links: readonly ExternalLink[];
  /** Headcount by level (Bac section only). */
  readonly counts: readonly LevelCount[];
  readonly countsNote: string;
}
