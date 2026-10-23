import type { ContactSubjectId, ContactTrackId } from '../public/shared/contact-mail';
import type { PublicPageId } from './pages';

/**
 * Every word of the public site's interface, in one language. French (messages.fr.ts) is the source;
 * messages.en.ts and messages.ar.ts are typed `SiteMessages`, so a missing or misspelt key does not compile.
 * Sentences that embed a value are functions, so their parameters are typed too. The school's own content
 * (history, tracks, photos) lives in school/content.*.ts.
 */

/** A paragraph of the accessibility statement, with an optional link at its end. */
export interface StatementParagraph {
  readonly text: string;
  /** An address (mailto:, https:) or a page of this site, which then links in the page's own language. */
  readonly link?:
    | { readonly label: string; readonly href: string; readonly page?: never }
    | { readonly label: string; readonly page: PublicPageId; readonly href?: never };
}

export interface StatementSection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly StatementParagraph[];
  readonly items?: readonly string[];
}

export interface FeatureWords {
  readonly meta: string;
  readonly title: string;
  readonly text: string;
}

export interface SiteMessages {
  /** Page titles (the browser tab, before the site's name) and meta descriptions. */
  readonly pages: Readonly<Record<PublicPageId, { readonly title: string; readonly description: string }>>;

  readonly layout: {
    readonly skipToContent: string;
    readonly switchboard: string;
    readonly menu: string;
    readonly mainNav: string;
    readonly nav: Readonly<Record<'home' | 'history' | 'nationale' | 'bac' | 'contact', string>>;
    readonly signIn: string;
    readonly mySpace: string;
    readonly languages: string;
    readonly footerAbout: string;
    readonly footerCollege: string;
    readonly footerSpaces: string;
    readonly studentSpace: string;
    readonly teacherSpace: string;
    readonly administration: string;
    readonly findUs: string;
    readonly copyright: (year: number) => string;
    readonly photoCredits: { readonly before: string; readonly middle: string; readonly after: string };
    readonly accessibility: string;
  };

  readonly common: {
    readonly breadcrumb: string;
    readonly home: string;
    readonly source: string;
    readonly motto: string;
    readonly prepareRegistration: string;
    /** Between a label and its value: « Standard : », "Switchboard: ". */
    readonly colon: string;
    /** The API answers in French: show its messages as they are (French), or our own generic ones. */
    readonly showServerMessages: boolean;
  };

  readonly home: {
    readonly heroTitle: string;
    readonly heroLead: string;
    readonly heroHistory: string;
    readonly heroCredit: string;
    readonly audienceTitle: string;
    readonly audiences: readonly {
      readonly id: 'family' | 'student' | 'teacher';
      readonly title: string;
      readonly text: string;
      readonly page: PublicPageId;
    }[];
    readonly historyTitle: string;
    readonly historyLead: string;
    readonly historyLink: string;
    readonly tracksTitle: string;
    readonly tracksLead: string;
    readonly discoverTrack: (track: string) => string;
    readonly featuresTitle: string;
    /** The three « À découvrir » cards, in the order of home-page.ts (which gives each its photo and link). */
    readonly features: readonly [FeatureWords, FeatureWords, FeatureWords];
    readonly contactTitle: string;
    readonly contactLead: string;
    readonly allNumbers: string;
  };

  readonly history: {
    readonly title: string;
    readonly onThisPage: string;
    readonly anchors: Readonly<Record<'etapes' | 'fondateur' | 'freres' | 'directeurs' | 'archives', string>>;
    readonly atAGlance: string;
    readonly stepsTitle: string;
    readonly stepsLead: string;
    readonly keyDates: string;
    readonly directorsTitle: string;
    readonly directorsLead: string;
    readonly brothersTable: string;
    readonly layTable: string;
    readonly name: string;
    readonly period: string;
    readonly archivesTitle: string;
    readonly archivesLead: { readonly before: string; readonly middle: string; readonly after: string };
  };

  readonly section: {
    readonly atAGlance: (track: string) => string;
    readonly headcount: string;
    readonly cycle: string;
    readonly level: string;
    readonly students: string;
    readonly total: string;
    readonly practical: string;
    readonly office: string;
    readonly writeToOffice: string;
    readonly landmarks: string;
    readonly collegeHistory: string;
    readonly usefulLinks: string;
    readonly subjectsTitle: string;
    readonly subjectsLead: { readonly before: string; readonly link: string; readonly after: string };
  };

  readonly contact: {
    readonly title: string;
    readonly lead: string;
    readonly details: string;
    readonly office: string;
    readonly seeOnMap: string;
    readonly phonesTitle: string;
    readonly registrationTitle: string;
    readonly registrationNationale: string;
    readonly registrationNationaleLink: string;
    readonly registrationBac: string;
    readonly sitesTitle: string;
  };

  readonly contactForm: {
    readonly title: string;
    readonly sent: { readonly before: string; readonly after: string };
    readonly notSent: string;
    readonly sendFromMail: string;
    readonly orWriteTo: string;
    readonly name: string;
    readonly phone: string;
    readonly email: string;
    readonly emailHelp: string;
    readonly subject: string;
    readonly subjects: Readonly<Record<ContactSubjectId, string>>;
    readonly track: string;
    readonly trackNone: string;
    readonly tracks: Readonly<Record<ContactTrackId, string>>;
    readonly trap: string;
    readonly message: string;
    readonly messageHelp: string;
    readonly note: string;
    readonly send: string;
    readonly sending: string;
    readonly errors: {
      readonly nameRequired: string;
      readonly emailRequired: string;
      readonly emailInvalid: string;
      readonly messageRequired: string;
      readonly messageTooLong: string;
      readonly nameTooLong: string;
      readonly phoneTooLong: string;
    };
  };

  readonly login: {
    readonly skip: string;
    readonly college: string;
    readonly mottoMeaning: string;
    readonly title: string;
    readonly lead: string;
    /** Shown on the English and Arabic pages: the spaces themselves are in French. */
    readonly spacesLanguage: string | null;
    readonly identifier: string;
    readonly identifierHelp: string;
    readonly password: string;
    readonly show: string;
    readonly hide: string;
    readonly thePassword: string;
    readonly forgot: string;
    readonly submit: string;
    readonly submitting: string;
    readonly noEmail: string;
    readonly noSignUp: string;
    readonly backToSite: string;
    readonly errors: {
      readonly emailRequired: string;
      readonly emailInvalid: string;
      readonly passwordRequired: string;
      readonly wrongCredentials: string;
      readonly tooManyAttempts: string;
      /** Any other failure, when the server's own (French) message is not shown. */
      readonly other: string;
    };
  };

  readonly accessibility: {
    readonly title: string;
    readonly lead: string;
    readonly updated: string;
    readonly onThisPage: string;
    /** The panel beside the statement: its key facts, one line each. */
    readonly summaryTitle: string;
    readonly summary: readonly { readonly label: string; readonly value: string }[];
    readonly sections: readonly StatementSection[];
  };
}
