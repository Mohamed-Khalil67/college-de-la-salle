import type { SectionId } from '@cdls/shared';
import type { BaseMessages, SchoolMessages, SiteMessages } from './messages';
import type { PublicPageId } from './pages';

/**
 * The whole interface of one language: the platform's shared words (`base`) joined with what the school's pack says
 * about itself (`school`), and the section names from the school profile (`sections`, in this language). Pure.
 */
export function composeMessages(
  base: BaseMessages,
  school: SchoolMessages,
  sections: Readonly<Record<SectionId, string>>,
): SiteMessages {
  const page = (id: PublicPageId, title = base.pageTitles[id]) => ({ title, description: school.pageDescriptions[id] });
  return {
    pages: {
      home: page('home'),
      history: page('history'),
      nationale: page('nationale', sections.nationale),
      bac: page('bac', sections.bac),
      contact: page('contact'),
      accessibility: page('accessibility'),
      login: page('login'),
    },
    layout: { ...base.layout, ...school.layout, nav: { ...base.layout.nav, nationale: sections.nationale, bac: sections.bac } },
    common: { ...base.common, motto: school.motto },
    home: { ...base.home, ...school.home },
    history: { ...base.history, ...school.history },
    section: base.section,
    contact: { ...base.contact, ...school.contact },
    contactForm: { ...base.contactForm, tracks: school.contactTracks },
    login: {
      ...base.login,
      mottoMeaning: school.login.mottoMeaning,
      errors: { ...base.login.errors, emailInvalid: school.login.emailInvalid },
    },
    accessibility: school.accessibility,
  };
}
