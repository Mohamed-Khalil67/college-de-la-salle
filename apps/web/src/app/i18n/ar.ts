import { CONTENT_AR } from '../school/content.ar';
import type { SiteLocale } from './locale';
import { MESSAGES_AR } from './messages.ar';

/** Arabic, loaded with the /ar routes only (app.routes.ts). */
export const AR: SiteLocale = { lang: 'ar', messages: MESSAGES_AR, content: CONTENT_AR };
