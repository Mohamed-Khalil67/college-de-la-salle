import { PROFILE } from '../core/school/school-profile';
import { sectionLabels } from '@cdls/shared';
import { PACK } from '../school/active/fr';
import { composeMessages } from './compose-messages';
import type { SiteLocale } from './locale';
import { BASE_FR } from './messages-base.fr';

/** French, loaded with the French routes only (app.routes.ts): the platform's words and the school pack's (schools/<SCHOOL>/site/). */
export const FR: SiteLocale = {
  lang: 'fr',
  content: PACK.content,
  messages: composeMessages(BASE_FR, PACK.messages, sectionLabels(PROFILE, 'fr')),
};
