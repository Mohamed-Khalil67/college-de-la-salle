/**
 * Portal content model: what teachers edit in Teacher Mode and what the public pages render.
 *
 * Stored at `content_pages/{pageId}` (public read; teacher-only write, see firestore.rules).
 * Every page has the same shape; a subject page uses `summary`, `chapters` and `resources`, the
 * home page uses `hero` and `announcements`, the history page uses `timeline`.
 *
 * Pure types and pure functions: no Angular, no Firebase.
 */
import type { EpochMillis, SubjectId, Uid } from './exam.contracts';

export type PageLang = 'ar' | 'fr';

export const PAGE_IDS = ['home', 'history', 'arabe', 'mathematiques', 'physique-chimie'] as const;
export type PageId = (typeof PAGE_IDS)[number];

export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && (PAGE_IDS as readonly string[]).includes(value);
}

export interface SubjectMeta {
  readonly id: SubjectId;
  /** URL slug and content page id: /ar/matiere/arabe, /fr/matiere/mathematiques … */
  readonly slug: Extract<PageId, 'arabe' | 'mathematiques' | 'physique-chimie'>;
  readonly lang: PageLang;
  /** Name in the subject's own language (the navigation shows it as written). */
  readonly name: string;
}

export const SUBJECTS: readonly SubjectMeta[] = [
  { id: 'arabic', slug: 'arabe', lang: 'ar', name: 'اللغة العربية' },
  { id: 'mathematics', slug: 'mathematiques', lang: 'fr', name: 'Mathématiques' },
  { id: 'physics-chemistry', slug: 'physique-chimie', lang: 'fr', name: 'Physique-Chimie' },
];

export function subjectBySlug(slug: string): SubjectMeta | null {
  return SUBJECTS.find((s) => s.slug === slug) ?? null;
}

export function subjectById(id: SubjectId): SubjectMeta {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0]!;
}

/* ------------------------------------------------------------------------------------------------
 * Schemas
 * ---------------------------------------------------------------------------------------------- */

export interface Hero {
  readonly title: string;
  readonly subtitle: string;
  readonly intro: string;
}

/** One milestone of the school's history. `sortYear` orders ranges such as «1954–1958». */
export interface TimelineEvent {
  readonly id: string;
  readonly period: string;
  readonly sortYear: number;
  readonly title: string;
  readonly text: string;
}

export type HistoryTimeline = readonly TimelineEvent[];

export interface SyllabusChapter {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly topics: readonly string[];
}

/** A downloadable sheet or external resource: `url` is https or a site-relative path. */
export interface ResourceItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly url: string;
}

export interface Announcement {
  readonly id: string;
  /** Calendar day, YYYY-MM-DD. */
  readonly date: string;
  readonly title: string;
  readonly body: string;
}

export interface ContentPage {
  readonly id: PageId;
  readonly lang: PageLang;
  readonly hero: Hero;
  readonly summary: string;
  readonly timeline: HistoryTimeline;
  readonly chapters: readonly SyllabusChapter[];
  readonly resources: readonly ResourceItem[];
  readonly announcements: readonly Announcement[];
  /** null while the page is the bundled default (never edited). */
  readonly updatedAt: EpochMillis | null;
  readonly updatedBy: Uid | null;
}

/** Bounds enforced by the editor, the sanitizer and (where Firestore rules can express them) the rules. */
export const CONTENT_LIMITS = {
  title: 200,
  text: 2_000,
  summary: 5_000,
  url: 500,
  topicsPerChapter: 30,
  topic: 200,
  timeline: 30,
  chapters: 40,
  resources: 40,
  announcements: 40,
} as const;

/* ------------------------------------------------------------------------------------------------
 * Validation helpers
 * ---------------------------------------------------------------------------------------------- */

/** https URLs and site-relative paths only: never `javascript:`, `data:` or protocol-relative. */
export function isSafeUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.length > CONTENT_LIMITS.url) return false;
  if (value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function isCalendarDay(value: string): boolean {
  return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

/** Noon UTC of a YYYY-MM-DD day: safely inside the same calendar day in Cairo. */
export function dayToMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

const str = (value: unknown, max: number, fallback = ''): string =>
  typeof value === 'string' ? value.slice(0, max) : fallback;

function list<T>(value: unknown, max: number, item: (raw: unknown, index: number) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const [i, raw] of value.slice(0, max).entries()) {
    const parsed = item(raw, i);
    if (parsed) out.push(parsed);
  }
  return out;
}

const rec = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/**
 * Turns untrusted data (a Firestore document, an editor form) into a valid `ContentPage`. Any field
 * that is missing or malformed falls back to `fallback`, so a corrupt document can never break a
 * public page, and unsafe URLs are dropped.
 */
export function sanitizePage(raw: unknown, fallback: ContentPage): ContentPage {
  const d = rec(raw);
  const hero = rec(d['hero']);
  const has = (key: string) => key in d;
  return {
    id: fallback.id,
    lang: fallback.lang,
    hero: has('hero')
      ? {
          title: str(hero['title'], CONTENT_LIMITS.title),
          subtitle: str(hero['subtitle'], CONTENT_LIMITS.title),
          intro: str(hero['intro'], CONTENT_LIMITS.text),
        }
      : fallback.hero,
    summary: has('summary') ? str(d['summary'], CONTENT_LIMITS.summary) : fallback.summary,
    timeline: has('timeline')
      ? list(d['timeline'], CONTENT_LIMITS.timeline, (r, i): TimelineEvent | null => {
          const e = rec(r);
          const title = str(e['title'], CONTENT_LIMITS.title);
          if (!title) return null;
          const year = typeof e['sortYear'] === 'number' && Number.isFinite(e['sortYear']) ? e['sortYear'] : 0;
          return {
            id: str(e['id'], 40, `t${i + 1}`) || `t${i + 1}`,
            period: str(e['period'], 60),
            sortYear: Math.trunc(year),
            title,
            text: str(e['text'], CONTENT_LIMITS.text),
          };
        })
      : fallback.timeline,
    chapters: has('chapters')
      ? list(d['chapters'], CONTENT_LIMITS.chapters, (r, i): SyllabusChapter | null => {
          const c = rec(r);
          const title = str(c['title'], CONTENT_LIMITS.title);
          if (!title) return null;
          return {
            id: str(c['id'], 40, `c${i + 1}`) || `c${i + 1}`,
            title,
            summary: str(c['summary'], CONTENT_LIMITS.text),
            topics: list(c['topics'], CONTENT_LIMITS.topicsPerChapter, (t) => {
              const topic = str(t, CONTENT_LIMITS.topic).trim();
              return topic || null;
            }),
          };
        })
      : fallback.chapters,
    resources: has('resources')
      ? list(d['resources'], CONTENT_LIMITS.resources, (r, i): ResourceItem | null => {
          const x = rec(r);
          const title = str(x['title'], CONTENT_LIMITS.title);
          const url = str(x['url'], CONTENT_LIMITS.url).trim();
          if (!title || !isSafeUrl(url)) return null;
          return {
            id: str(x['id'], 40, `r${i + 1}`) || `r${i + 1}`,
            title,
            description: str(x['description'], CONTENT_LIMITS.text),
            url,
          };
        })
      : fallback.resources,
    announcements: has('announcements')
      ? list(d['announcements'], CONTENT_LIMITS.announcements, (r, i): Announcement | null => {
          const a = rec(r);
          const title = str(a['title'], CONTENT_LIMITS.title);
          const date = str(a['date'], 10);
          if (!title || !isCalendarDay(date)) return null;
          return {
            id: str(a['id'], 40, `a${i + 1}`) || `a${i + 1}`,
            date,
            title,
            body: str(a['body'], CONTENT_LIMITS.text),
          };
        })
      : fallback.announcements,
    updatedAt: typeof d['updatedAt'] === 'number' ? d['updatedAt'] : fallback.updatedAt,
    updatedBy: typeof d['updatedBy'] === 'string' ? d['updatedBy'] : fallback.updatedBy,
  };
}
