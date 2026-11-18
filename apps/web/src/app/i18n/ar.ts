import { PROFILE } from '../core/school/school-profile';
import { sectionLabels } from '@cdls/shared';
import { PACK } from '../school/active/ar';
import { composeMessages } from './compose-messages';
import type { SiteLocale } from './locale';
import { BASE_AR } from './messages-base.ar';

/** Arabic, loaded with the Arabic routes only (app.routes.ts): the platform's words and the school pack's (schools/<SCHOOL>/site/). */
export const AR: SiteLocale = {
  lang: 'ar',
  content: PACK.content,
  messages: composeMessages(BASE_AR, PACK.messages, sectionLabels(PROFILE, 'ar')),
};
