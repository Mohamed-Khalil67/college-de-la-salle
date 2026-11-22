import type { Lang } from '../i18n/lang';
import type { SchoolMessages } from '../i18n/messages';
import type { PublicPageId } from '../i18n/pages';
import type { ContactId, PhotoId, SectionSlug } from './content.model';
import type { SchoolContent } from './school-content';

/**
 * What a school pack (`schools/<id>/site/`, docs/new-school.md) gives the public site besides its words:
 * `index.ts` exports a `SITE`, `archive.ts` its photos and directors, and `fr.ts` a
 * `SchoolPack`. `scripts/select-school.mjs` points `school/active/` at the pack named by `SCHOOL`.
 * Pure types: no Angular.
 */

/** What the home card and the page intro of each track need besides words (those are each language's `content.tracks`). */
export interface TrackSummary {
  readonly page: PublicPageId;
  /** Photo of the home card (the section page uses its own `photo`). */
  readonly cardPhoto: PhotoId;
  /** The track's secretariat lines (`profile.contacts.departments`). */
  readonly contacts: readonly ContactId[];
  /** Years of the milestones shown as « Repères » on the section page. */
  readonly years: readonly string[];
}

/** Photo and link of an « À découvrir » card, in the order of the messages' `home.features`. */
export interface FeatureTarget {
  readonly photo: PhotoId;
  readonly page: PublicPageId;
  readonly fragment: string;
}

/** A class or level a visitor can name on the contact form; `value` is the French wording sent to the secretariat. */
export interface ContactTrack {
  /** Key of the label in each language's `contactForm.tracks`. */
  readonly id: string;
  readonly value: string;
}

export interface CreditLink {
  readonly label: string;
  readonly url: string;
}

export interface SiteConfig {
  /** The home page's whole browser title (other pages are « Page — site title »). */
  readonly homeTitle: Readonly<Record<Lang, string>>;
  /** Departments whose first number is shown on the home page (`profile.contacts.departments` ids). */
  readonly homePhones: readonly ContactId[];
  /** Years of the milestones teased on the home page. */
  readonly teaserYears: readonly string[];
  readonly featureTargets: readonly [FeatureTarget, FeatureTarget, FeatureTarget];
  readonly trackSummary: Readonly<Record<SectionSlug, TrackSummary>>;
  readonly heroPhoto: PhotoId;
  /** Photo opening the history page. */
  readonly historyPhoto: PhotoId;
  /** The picture beside the sign-in forms (decorative). */
  readonly authImage: { readonly src: string; readonly width: number; readonly height: number };
  /** The school's motto, shown beside the sign-in forms; `meaningFr` explains it on the French-only pages. */
  readonly motto: { readonly text: string; readonly lang: string; readonly meaningFr: string } | null;
  /**
   * The two sites credited for the photographs in the footer and on the history page (`archive`, then
   * `college`); null when the pack has no credits to give (the messages' `photoCredits` are then not shown).
   */
  readonly creditLinks: { readonly archive: CreditLink; readonly college: CreditLink } | null;
  readonly contactTracks: readonly ContactTrack[];
}

/** The two files of a language of a pack: the school's content and the words that name the school. */
export interface SchoolPack {
  readonly content: SchoolContent;
  readonly messages: SchoolMessages;
}
