import {
  CONTENT_LIMITS,
  type ContentPage,
  isCalendarDay,
  isSafeUrl,
  type PageLang,
  type TimelineEvent,
} from '@exam/contracts';
import type { ContentPatch } from '@exam/data-access-curriculum';

/** Sections of a page that a teacher can edit inline. */
export type SectionKind = 'hero' | 'summary' | 'timeline' | 'chapters' | 'resources' | 'announcements';

/**
 * Every section is edited as rows of three text fields (a, b, c): a hero is one row, a chapter list
 * is many. This keeps one typed form for all sections; the spec says what each field means.
 */
export interface Row {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly c: string;
}

type Bilingual = Readonly<Record<PageLang, string>>;
type FieldType = 'text' | 'date' | 'url';

export interface FieldSpec {
  readonly label: Bilingual;
  readonly multiline: boolean;
  readonly type: FieldType;
  readonly max: number;
  readonly required: boolean;
  readonly hint?: Bilingual;
}

export interface SectionSpec {
  readonly title: Bilingual;
  readonly list: boolean;
  readonly maxRows: number;
  readonly a: FieldSpec;
  readonly b: FieldSpec | null;
  readonly c: FieldSpec | null;
}

const T: number = CONTENT_LIMITS.title;
const X: number = CONTENT_LIMITS.text;

const text = (ar: string, fr: string, max: number = T, required = true, multiline = false): FieldSpec => ({
  label: { ar, fr },
  multiline,
  type: 'text',
  max,
  required,
});

export const SECTION_SPECS: Readonly<Record<SectionKind, SectionSpec>> = {
  hero: {
    title: { ar: 'الواجهة الرئيسة', fr: "Bandeau d'en-tête" },
    list: false,
    maxRows: 1,
    a: text('العنوان', 'Titre'),
    b: text('العنوان الفرعي', 'Sous-titre', T, false),
    c: text('تمهيد', 'Introduction', X, false, true),
  },
  summary: {
    title: { ar: 'الملخّص', fr: 'Présentation' },
    list: false,
    maxRows: 1,
    a: {
      ...text('النص', 'Texte', CONTENT_LIMITS.summary, false, true),
      hint: { ar: 'اترك سطرًا فارغًا بين الفقرات.', fr: 'Laissez une ligne vide entre les paragraphes.' },
    },
    b: null,
    c: null,
  },
  timeline: {
    title: { ar: 'المحطات التاريخية', fr: 'Repères chronologiques' },
    list: true,
    maxRows: CONTENT_LIMITS.timeline,
    a: text('الفترة (مثل ١٩٠٥)', 'Période (ex. 1905)', 60),
    b: text('العنوان', 'Titre'),
    c: text('الوصف', 'Description', X, false, true),
  },
  chapters: {
    title: { ar: 'وحدات المنهج', fr: 'Chapitres du programme' },
    list: true,
    maxRows: CONTENT_LIMITS.chapters,
    a: text('عنوان الوحدة', 'Titre du chapitre'),
    b: text('ملخّص الوحدة', 'Résumé', X, false, true),
    c: {
      ...text('الموضوعات (موضوع في كل سطر)', 'Notions (une par ligne)', CONTENT_LIMITS.topicsPerChapter * CONTENT_LIMITS.topic, false, true),
    },
  },
  resources: {
    title: { ar: 'الموارد والتحميلات', fr: 'Ressources à télécharger' },
    list: true,
    maxRows: CONTENT_LIMITS.resources,
    a: text('العنوان', 'Titre'),
    b: text('الوصف', 'Description', X, false, true),
    c: {
      label: { ar: 'الرابط (https)', fr: 'Lien (https)' },
      multiline: false,
      type: 'url',
      max: CONTENT_LIMITS.url,
      required: true,
    },
  },
  announcements: {
    title: { ar: 'الإعلانات والأخبار', fr: 'Annonces' },
    list: true,
    maxRows: CONTENT_LIMITS.announcements,
    a: { label: { ar: 'التاريخ', fr: 'Date' }, multiline: false, type: 'date', max: 10, required: true },
    b: text('العنوان', 'Titre'),
    c: text('النص', 'Texte', X, false, true),
  },
};

/* ------------------------------------------------------------------------------------------------
 * Validation (messages in the editor's language)
 * ---------------------------------------------------------------------------------------------- */

const MESSAGES = {
  required: { ar: 'هذا الحقل مطلوب.', fr: 'Ce champ est obligatoire.' },
  tooLong: { ar: 'النص أطول من المسموح.', fr: 'Le texte est trop long.' },
  url: {
    ar: 'أدخِل رابطًا آمنًا يبدأ بـ https:// أو مسارًا داخليًّا يبدأ بـ /.',
    fr: 'Saisissez un lien sécurisé en https:// ou un chemin interne commençant par /.',
  },
  date: { ar: 'اختر تاريخًا صحيحًا.', fr: 'Choisissez une date valide.' },
} as const satisfies Record<string, Bilingual>;

export function validateField(
  kind: SectionKind,
  key: 'a' | 'b' | 'c',
  value: string,
  lang: PageLang,
): { readonly kind: string; readonly message: string } | null {
  const field = SECTION_SPECS[kind][key];
  if (!field) return null;
  const v = value.trim();
  if (field.required && !v) return { kind: 'required', message: MESSAGES.required[lang] };
  if (value.length > field.max) return { kind: 'maxLength', message: MESSAGES.tooLong[lang] };
  if (v && field.type === 'url' && !isSafeUrl(v)) return { kind: 'url', message: MESSAGES.url[lang] };
  if (v && field.type === 'date' && !isCalendarDay(v)) return { kind: 'date', message: MESSAGES.date[lang] };
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Page ⇄ rows
 * ---------------------------------------------------------------------------------------------- */

export function newRowId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function blankRow(kind: SectionKind, today: string): Row {
  return { id: newRowId(), a: kind === 'announcements' ? today : '', b: '', c: '' };
}

export function toRows(page: ContentPage, kind: SectionKind): Row[] {
  switch (kind) {
    case 'hero':
      return [{ id: 'hero', a: page.hero.title, b: page.hero.subtitle, c: page.hero.intro }];
    case 'summary':
      return [{ id: 'summary', a: page.summary, b: '', c: '' }];
    case 'timeline':
      return page.timeline.map((e) => ({ id: e.id, a: e.period, b: e.title, c: e.text }));
    case 'chapters':
      return page.chapters.map((c) => ({ id: c.id, a: c.title, b: c.summary, c: c.topics.join('\n') }));
    case 'resources':
      return page.resources.map((r) => ({ id: r.id, a: r.title, b: r.description, c: r.url }));
    case 'announcements':
      return page.announcements.map((n) => ({ id: n.id, a: n.date, b: n.title, c: n.body }));
  }
}

/** First 3–4 digit number in the text (Arabic-Indic or Latin digits): «١٩٥٤–١٩٥٨» → 1954. */
export function yearOf(period: string): number {
  const latin = period.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const match = /\d{3,4}/.exec(latin);
  return match ? Number(match[0]) : 0;
}

export function toPatch(kind: SectionKind, rows: readonly Row[]): ContentPatch {
  switch (kind) {
    case 'hero': {
      const r = rows[0];
      return { hero: { title: r?.a.trim() ?? '', subtitle: r?.b.trim() ?? '', intro: r?.c.trim() ?? '' } };
    }
    case 'summary':
      return { summary: rows[0]?.a.trim() ?? '' };
    case 'timeline': {
      const events: TimelineEvent[] = rows.map((r) => ({
        id: r.id,
        period: r.a.trim(),
        sortYear: yearOf(r.a),
        title: r.b.trim(),
        text: r.c.trim(),
      }));
      return { timeline: events.sort((x, y) => x.sortYear - y.sortYear) };
    }
    case 'chapters':
      return {
        chapters: rows.map((r) => ({
          id: r.id,
          title: r.a.trim(),
          summary: r.b.trim(),
          topics: r.c.split('\n').map((t) => t.trim()).filter(Boolean),
        })),
      };
    case 'resources':
      return {
        resources: rows.map((r) => ({ id: r.id, title: r.a.trim(), description: r.b.trim(), url: r.c.trim() })),
      };
    case 'announcements':
      return {
        announcements: rows
          .map((r) => ({ id: r.id, date: r.a.trim(), title: r.b.trim(), body: r.c.trim() }))
          .sort((x, y) => y.date.localeCompare(x.date)),
      };
  }
}

/** Editor chrome strings. */
export const EDITOR_UI = {
  edit: { ar: 'تعديل', fr: 'Modifier' },
  save: { ar: 'حفظ', fr: 'Enregistrer' },
  saving: { ar: 'جارٍ الحفظ…', fr: 'Enregistrement…' },
  cancel: { ar: 'إلغاء', fr: 'Annuler' },
  add: { ar: 'إضافة عنصر', fr: 'Ajouter un élément' },
  remove: { ar: 'حذف', fr: 'Supprimer' },
  moveUp: { ar: 'نقل لأعلى', fr: 'Monter' },
  item: { ar: 'عنصر', fr: 'Élément' },
  fixErrors: { ar: 'صحِّح الحقول المُشار إليها.', fr: 'Corrigez les champs signalés.' },
  failed: { ar: 'تعذَّر الحفظ؛ أُعيدت الصفحة إلى حالتها السابقة.', fr: "L'enregistrement a échoué; la page a été restaurée." },
  noItems: { ar: 'لا توجد عناصر بعد.', fr: "Aucun élément pour l'instant." },
} as const satisfies Record<string, Bilingual>;
