/**
 * Content model of the site. Pure types: no Angular.
 *
 * The site is French; only the Arabic-language subject page is written in Arabic (`lang: 'ar'`).
 * Every page is static content, prerendered at build time.
 */

export type Lang = 'fr' | 'ar';

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

/** The two sections of the college: national (Egyptian programme) and French Baccalauréat. */
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

/**
 * Progress of a chapter in the school year. Shown as a status chip; teachers update it in the
 * subject's content file (no chapter is marked done until they do).
 */
export type ChapterStatus = 'prevu' | 'en-cours' | 'termine';

export interface Chapter {
  readonly id: string;
  /** Part of the subject the chapter belongs to (e.g. « Physique », « Chimie »). */
  readonly part: string;
  readonly title: string;
  readonly summary: string;
  readonly objectives: readonly string[];
  readonly notions: readonly string[];
  readonly status: ChapterStatus;
}

export interface Formula {
  readonly label: string;
  /** Written with Unicode (², √, ∫, Σ …); always rendered left-to-right. */
  readonly expression: string;
  readonly note?: string;
}

export interface WorkedExample {
  readonly title: string;
  readonly statement: string;
  /** Solution steps, in order. */
  readonly steps: readonly string[];
  readonly answer: string;
}

export interface Tip {
  readonly title: string;
  readonly text: string;
}

export interface Resource {
  readonly title: string;
  readonly description: string;
  /** null until the file exists: shown as « bientôt disponible ». */
  readonly url: string | null;
}

export interface SubjectPage {
  readonly slug: 'arabe' | 'mathematiques' | 'physique-chimie';
  readonly lang: Lang;
  /** Name as shown in the (French) navigation. */
  readonly navLabel: string;
  readonly title: string;
  readonly kicker: string;
  readonly intro: string;
  readonly photo: PhotoId;
  readonly highlights: readonly KeyFigure[];
  /** Optional background reading (e.g. the history of Arabic in Egypt). */
  readonly context: { readonly title: string; readonly paragraphs: readonly string[]; readonly milestones: readonly { readonly period: string; readonly text: string }[] } | null;
  readonly chapters: readonly Chapter[];
  readonly formulas: readonly Formula[];
  readonly examples: readonly WorkedExample[];
  readonly tips: readonly Tip[];
  readonly resources: readonly Resource[];
}
