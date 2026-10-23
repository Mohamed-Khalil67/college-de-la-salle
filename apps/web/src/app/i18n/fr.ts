import { CONTENT_FR } from '../school/content.fr';
import type { SiteLocale } from './locale';
import { MESSAGES_FR } from './messages.fr';

/** French, loaded with the French routes only (app.routes.ts). */
export const FR: SiteLocale = { lang: 'fr', messages: MESSAGES_FR, content: CONTENT_FR };
