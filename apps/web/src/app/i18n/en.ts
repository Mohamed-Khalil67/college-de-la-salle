import { CONTENT_EN } from '../school/content.en';
import type { SiteLocale } from './locale';
import { MESSAGES_EN } from './messages.en';

/** English, loaded with the /en routes only (app.routes.ts). */
export const EN: SiteLocale = { lang: 'en', messages: MESSAGES_EN, content: CONTENT_EN };
