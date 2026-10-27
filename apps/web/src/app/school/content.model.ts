/**
 * Content model of the site. Pure types: no Angular.
 *
 * French is the source language (photos.ts, school-info.ts, tracks.ts); content.en.ts and content.ar.ts
 * translate the same shapes (school-content.ts). These pages are institutional and static (prerendered at
 * build time); everything that changes during the school year lives in the API and is written by teachers.
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
  /** Alternative text, in the page's language. */
  readonly alt: string;
  readonly caption: string;
  readonly credit: string;
  /** Whose archive: the Brothers' Middle East district (lasalle-po.org) or the college (lasalle-eg.net). */
  readonly archive: PhotoArchive;
  readonly sourceUrl: string;
}

export type PhotoArchive = 'po' | 'eg';

/** The words of a photo, per language (src, size and credit owner do not change). */
export interface PhotoText {
  readonly alt: string;
  readonly caption: string;
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

export type DirectorRole = 'coordinator' | 'coordinator-then-director';

/** A head of the college, from the school's own list. Names are not translated. */
export interface Director {
  readonly name: string;
  /** Terms in office: [from, to], `to` null for « to this day ». */
  readonly terms: readonly (readonly [number, number | null])[];
  /** « Frère » or « Laïc ». */
  readonly kind: 'frere' | 'laic';
  readonly role?: DirectorRole;
}

export type ContactId =
  | 'standard'
  | 'superieur'
  | 'directeur'
  | 'secondaire'
  | 'bac'
  | 'preparatoire'
  | 'grand-primaire'
  | 'petit-primaire'
  | 'jardin';

/** A list that always has a first item, so `list[0]` is typed without `undefined`. */
export type NonEmptyList<T> = readonly [T, ...T[]];

/** A department's phone numbers; its name comes from the page's language (`contactLabels`). */
export interface ContactLine {
  readonly id: ContactId;
  readonly phones: NonEmptyList<string>;
}

export interface ExternalLink {
  readonly label: string;
  /** Opens a registration form (shown again on the contact page). */
  readonly registration?: boolean;
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

export type SectionSlug = 'nationale' | 'bac';

/** The two tracks of the college: Bac nationale (Egyptian programme) and Bac français. */
export interface SectionPage {
  readonly slug: SectionSlug;
  readonly title: string;
  readonly kicker: string;
  readonly intro: string;
  readonly photo: PhotoId;
  readonly facts: readonly KeyFigure[];
  readonly blocks: NonEmptyList<InfoBlock>;
  readonly links: NonEmptyList<ExternalLink>;
  /** Headcount by level (Bac section only). */
  readonly counts: readonly LevelCount[];
  readonly countsNote: string;
}
