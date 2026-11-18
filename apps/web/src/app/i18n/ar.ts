import { PACK } from '../school/active/ar';
import type { SiteLocale } from './locale';

/** Arabic, loaded with the Arabic routes only (app.routes.ts). The words are the school pack's (schools/<SCHOOL>/site/). */
export const AR: SiteLocale = { lang: 'ar', ...PACK };
