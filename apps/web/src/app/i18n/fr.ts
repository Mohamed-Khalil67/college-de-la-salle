import { PACK } from '../school/active/fr';
import type { SiteLocale } from './locale';

/** French, loaded with the French routes only (app.routes.ts). The words are the school pack's (schools/<SCHOOL>/site/). */
export const FR: SiteLocale = { lang: 'fr', ...PACK };
