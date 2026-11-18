import { PACK } from '../school/active/en';
import type { SiteLocale } from './locale';

/** English, loaded with the English routes only (app.routes.ts). The words are the school pack's (schools/<SCHOOL>/site/). */
export const EN: SiteLocale = { lang: 'en', ...PACK };
