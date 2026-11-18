import { PROFILE } from '../core/school/school-profile';
import { sectionLabels } from '@cdls/shared';
import { PACK } from '../school/active/en';
import { composeMessages } from './compose-messages';
import type { SiteLocale } from './locale';
import { BASE_EN } from './messages-base.en';

/** English, loaded with the English routes only (app.routes.ts): the platform's words and the school pack's (schools/<SCHOOL>/site/). */
export const EN: SiteLocale = {
  lang: 'en',
  content: PACK.content,
  messages: composeMessages(BASE_EN, PACK.messages, sectionLabels(PROFILE, 'en')),
};
