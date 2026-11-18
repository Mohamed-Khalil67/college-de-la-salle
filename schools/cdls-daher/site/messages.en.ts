import type { SchoolMessages } from '../../../apps/web/src/app/i18n/messages';

/**
 * What the English pages say about Collège de la Salle. MACHINE-DRAFTED from messages.fr.ts: to be reviewed by the
 * school (docs/i18n.md). The shared words are the platform's (i18n/messages-base.en.ts).
 */
export const MESSAGES_EN: SchoolMessages = {
  pageDescriptions: {
    home: 'Collège de la Salle, Daher (Cairo, founded in 1898): Egyptian and French baccalaureates. History, heritage, subjects, student and teacher spaces.',
    history:
      'History of the Collège de la Salle in Daher since 1898: the red-brick building, the new buildings of 1955 and the 1958 chapel, in archive photographs.',
    nationale:
      'The Egyptian national track (Thanaweya Amma) at the Collège de la Salle, Daher: Ministry of Education programme, subjects, student space and admissions.',
    bac: 'The French baccalaureate at the Collège de la Salle, Daher: AEFE accreditation, teaching, guidance, student numbers and admissions.',
    contact: 'Address, e-mail and phone numbers of the Collège de la Salle, Daher, by department and school stage.',
    accessibility:
      'Accessibility statement of the Collège de la Salle, Daher website: what we test, known limitations, how to report a problem.',
    login: 'Sign in to the student space, the teacher space and the administration of the Collège de la Salle, Daher.',
  },

  layout: {
    footerAbout: 'Egyptian and French baccalaureates, from kindergarten to the final year.',
    copyright: (year) => `© ${year} Collège de la Salle, Daher. Brothers of the Christian Schools.`,
    photoCredits: {
      before: 'Photographs: Lasallian archives (',
      middle: ') and the college (',
      after: '), with the college’s permission.',
    },
  },

  motto: '“Signum Fidei”, sign of faith: the motto of the Brothers of the Christian Schools.',

  home: {
    heroTitle: 'A Lasallian school in the heart of Cairo, since 1898',
    heroLead:
      'From kindergarten to the final year, 2,400 students prepare the Thanaweya Amma or the French baccalaureate, within one educational project.',
    heroCredit: 'The Daher campus from the air.',
    historyTitle: 'More than a century in Daher',
    historyLead:
      'Founded by the Brothers of the Christian Schools, the institute created by Saint John Baptist de La Salle, the college belongs to the Lasallian network of Egypt and its 900 schools worldwide.',
    tracksTitle: 'Two baccalaureates, one educational project',
    tracksLead: 'Both tracks share the same Lasallian values, the same courtyard and the same high standards.',
    features: [
      {
        meta: 'History, 1958',
        title: 'The De La Salle chapel, inaugurated in December 1958',
        text: 'Nearly four years of work, from 1954 to 1958, for the college chapel and its dome.',
      },
      {
        meta: 'French Bac',
        title: 'French Bac applications are made online',
        text: 'One form for the preparatory year and another for the Bac, on the section’s website.',
      },
      {
        meta: 'Archives, April 1926',
        title: 'The Brothers of Egypt gather in Daher',
        text: 'Nearly 190 Brothers from every school in the country meet at the college for their annual retreat.',
      },
    ],
    contactLead:
      'The college publishes admission periods and the list of documents to provide. Write to the school office or call the relevant school stage directly.',
  },

  history: {
    anchors: {
      etapes: 'Milestones',
      fondateur: 'The founder',
      freres: 'The Brothers in Egypt',
      directeurs: 'The directors',
      archives: 'The archives',
    },
    stepsLead:
      'Each date gives its source: the college administration, its website or the Lasallian archives. Where they differ, the page gives both.',
    directorsLead: 'List published on the college’s website, since the 1905 inauguration.',
    brothersTable: 'Brother directors and coordinators',
    layTable: 'Lay directors',
    archivesTitle: 'Photographic archives',
    archivesLead: {
      before: 'Photographs from the archives of the Brothers of the Christian Schools, Middle East (',
      middle: '), and from the college’s archive album (',
      after: ').',
    },
  },

  contact: {
    registrationNationale:
      'Egyptian Bac: admission periods, the list of documents and the application form are published in Arabic on the college’s website.',
    registrationNationaleLink: 'See the announcements on lasalle-eg.net',
    registrationBac: 'French Bac: applications are made online, on the section’s website (in French).',
  },

  contactTracks: {
    'nationale-kg': 'Egyptian Bac, kindergarten',
    'nationale-primary': 'Egyptian Bac, primary',
    'nationale-prep': 'Egyptian Bac, preparatory',
    'nationale-secondary': 'Egyptian Bac, secondary',
    'bac-primary': 'French Bac, nursery or primary',
    'bac-college': 'French Bac, collège (ages 11–15)',
    'bac-lycee': 'French Bac, lycée (ages 15–18)',
  },

  login: {
    mottoMeaning: 'Sign of faith: the motto of the Brothers of the Christian Schools, who founded the college.',
    emailInvalid: 'Enter a full e-mail address, for example firstname.lastname@lasalle-daher.eg.',
  },

  accessibility: {
    title: 'Accessibility statement',
    lead:
      'The Collège de la Salle wants everyone, student, family or teacher, to be able to use this website, whatever their disability or way of browsing. This statement follows the model of the French accessibility standard (RGAA 4.1) and says honestly where we stand.',
    updated: 'Statement written on 23 October 2026. It is updated with each version of the site.',
    onThisPage: 'On this page',
    summaryTitle: 'At a glance',
    summary: [
      { label: 'RGAA status', value: 'Not compliant: not yet audited' },
      { label: 'Our tests', value: 'No Axe errors, on every page, in 3 languages and 2 screen widths' },
      { label: 'Main limitation', value: 'PDF report cards are not tagged; an accessible web version exists' },
      { label: 'Contact', value: 'delasalle@lasalle-eg.net' },
    ],
    sections: [
      {
        id: 'etat',
        title: 'Compliance status',
        paragraphs: [
          {
            text: 'The Collège de la Salle, Daher website has not yet been audited for RGAA compliance by an independent body. Until that audit takes place, the RGAA requires the site to be declared “not compliant”: that is its official status, even though our own tests find no errors.',
          },
          {
            text: 'The college is a private Egyptian school: the RGAA, mandatory for French public services, is applied here voluntarily. We aim for level AA of the international WCAG 2.2 guidelines.',
          },
        ],
      },
      {
        id: 'tests',
        title: 'What we test, with each version',
        paragraphs: [{ text: 'These checks are automated and run again before each release:' }],
        items: [
          'Axe (axe-core 4.14), WCAG 2.0, 2.1 and 2.2 rules at levels A and AA plus best practices: no errors on every public page, in French, English and Arabic, and on every screen of the student, teacher and administration spaces.',
          'Two screen widths for every page: 390 pixels (phone) and 1,440 pixels (computer).',
          'Keyboard: every link, button and field can be reached with the Tab key, focus stays visible, the “Skip to content” link leads to the content, and the Escape key closes menus and dialogs.',
          'Contrast: the site’s colours are chosen for a ratio of at least 4.5:1 for text (gold is never used for text on a light background).',
          'Language: every page declares its language; the Arabic version reads from right to left.',
        ],
      },
      {
        id: 'limites',
        title: 'Known limitations',
        paragraphs: [
          {
            text: 'Automated tests only find some of the problems. We have not yet had the site tested with screen readers (NVDA, VoiceOver, TalkBack) by people who use them every day. Here is what we know is not yet accessible:',
          },
        ],
        items: [
          'PDF report cards: the file downloaded from the student space is not tagged (no structure for headings or tables, no declared language). Its text is real and can be read, but the reading order is not guaranteed. The same report card is shown as an accessible web page in the student space, and can be printed from there.',
          'English and Arabic versions: the translation is a first draft that the college still has to review. The class names of the French Bac (Seconde, Terminale…) stay in French.',
          'Student, teacher and administration spaces: they exist in French only. Some error messages from the server are shown in French.',
          'Linked websites: the college’s website (lasalle-eg.net), the Bac section’s website (bacdelasalle.com) and their application forms do not depend on this site and are not covered by this statement.',
          'Archive photographs: we wrote their descriptions from the archives’ captions, and they may be imprecise.',
        ],
      },
      {
        id: 'environnement',
        title: 'Test environment',
        paragraphs: [
          {
            text: 'Tests run with Playwright 1.64 in Chromium (desktop and phone profiles), axe-core 4.14. Technologies used by the site: HTML5, CSS, JavaScript (Angular), WAI-ARIA.',
          },
        ],
      },
      {
        id: 'contact',
        title: 'Report a problem',
        paragraphs: [
          {
            text: 'If you cannot access some content or a service, write to us describing the page and the problem: we will reply by e-mail and give you the information in another form.',
          },
          {
            text: 'By e-mail, with the subject “Accessibility”:',
            link: { label: 'delasalle@lasalle-eg.net', href: 'mailto:delasalle@lasalle-eg.net?subject=Accessibility' },
          },
          { text: 'Or with the form on the page', link: { label: 'Contact', page: 'contact' } },
        ],
      },
      {
        id: 'recours',
        title: 'Remedies',
        paragraphs: [
          {
            text: 'If the school office’s reply does not satisfy you, write to the Brother Director of the college, at the same address or on +20 2 2592 80 70. You will receive a personal reply.',
          },
          {
            text: 'Referral to the French Défenseur des droits, which the RGAA provides for French public services, does not apply to an Egyptian school. In Egypt, the National Council for Persons with Disabilities receives complaints about the rights of persons with disabilities.',
          },
        ],
      },
    ],
  },
};
