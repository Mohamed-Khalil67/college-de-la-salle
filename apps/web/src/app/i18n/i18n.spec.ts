import type { ActivatedRouteSnapshot } from '@angular/router';
import { MATIERES } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { CONTENT_AR } from '../school/content.ar';
import { CONTENT_EN } from '../school/content.en';
import { CONTENT_FR } from '../school/content.fr';
import { DIRECTORS } from '../school/school-info';
import { directorPeriod, MATIERE_IDS, type SchoolContent } from '../school/school-content';
import { isLang, LANG_META, LANGS } from './lang';
import { publicRouteData, readPublicRoute } from './locale';
import type { SiteMessages } from './messages';
import { MESSAGES_AR } from './messages.ar';
import { MESSAGES_EN } from './messages.en';
import { MESSAGES_FR } from './messages.fr';
import { alternates, childPath, pageUrl, PRERENDERED_PAGES, PUBLIC_PAGES, routePath } from './pages';

/*
 * The types already make every language give every key. These tests check what types cannot: that a translation
 * keeps the French facts (years, photos, links, headcounts) and that no text was left empty.
 */

const TRANSLATIONS = [
  { lang: 'en', content: CONTENT_EN, messages: MESSAGES_EN },
  { lang: 'ar', content: CONTENT_AR, messages: MESSAGES_AR },
] as const;

/** Every string reachable in a value (functions are called with a sample argument). */
function strings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (typeof value === 'function') return strings((value as (arg: unknown) => unknown)('X'), path);
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

/** The facts of the content that are not words. */
function facts(c: SchoolContent) {
  return {
    keyFigures: c.keyFigures.length,
    milestones: c.milestones.map((m) => [m.year, m.photo]),
    founderFacts: c.founder.facts.length,
    freres: c.freres.map((b) => [b.id, b.paragraphs.length, b.items.length]),
    links: c.links.map((l) => [l.url, l.registration ?? false]),
    sections: Object.values(c.sections).map((s) => ({
      slug: s.slug,
      photo: s.photo,
      facts: s.facts.length,
      blocks: s.blocks.map((b) => [b.id, b.paragraphs.length, b.items.length]),
      links: s.links.map((l) => [l.url, l.registration ?? false]),
      counts: s.counts.map((c) => c.levels.map((l) => [l.level, l.students])),
    })),
    tracks: Object.values(c.tracks).map((t) => t.points.length),
  };
}

function shape(m: SiteMessages) {
  return {
    audiences: m.home.audiences.map((a) => [a.id, a.page]),
    features: m.home.features.length,
    statement: m.accessibility.sections.map((s) => [s.id, s.paragraphs.length, s.items?.length ?? 0, s.paragraphs.map((p) => p.link?.page ?? p.link?.href?.split('?')[0] ?? null)]),
    summary: m.accessibility.summary.length,
  };
}

describe('languages and pages', () => {
  it('knows its three languages, Arabic right to left', () => {
    expect(LANGS).toEqual(['fr', 'en', 'ar']);
    expect(LANGS.map((l) => LANG_META[l].dir)).toEqual(['ltr', 'ltr', 'rtl']);
    expect(isLang('ar')).toBe(true);
    expect(isLang('de')).toBe(false);
  });

  it('keeps the historic French addresses and prefixes the other languages', () => {
    expect(PUBLIC_PAGES.map((p) => pageUrl('fr', p))).toEqual([
      '/',
      '/histoire',
      '/bac-nationale',
      '/bac-francais',
      '/contact',
      '/accessibilite',
      '/connexion',
    ]);
    for (const lang of ['en', 'ar'] as const) {
      for (const page of PUBLIC_PAGES) {
        expect(routePath(lang, page).startsWith(lang)).toBe(true);
        expect(`${lang}/${childPath(lang, page)}`.replace(/\/$/, '')).toBe(routePath(lang, page));
      }
    }
  });

  it('gives each page a distinct address in each language', () => {
    const all = LANGS.flatMap((l) => PUBLIC_PAGES.map((p) => pageUrl(l, p)));
    expect(new Set(all).size).toBe(all.length);
  });

  it('prerenders every page but the login page, and lists every language as an alternate', () => {
    expect(PRERENDERED_PAGES).not.toContain('login');
    expect(PRERENDERED_PAGES).toHaveLength(PUBLIC_PAGES.length - 1);
    expect(alternates('history')).toEqual([
      { lang: 'fr', url: '/histoire' },
      { lang: 'en', url: '/en/history' },
      { lang: 'ar', url: '/ar/history' },
    ]);
  });
});

describe('route data', () => {
  const snapshot = (data: object, firstChild: ActivatedRouteSnapshot | null = null) =>
    ({ data, firstChild }) as unknown as ActivatedRouteSnapshot;

  it('reads the deepest public route', () => {
    const leaf = snapshot(publicRouteData({ lang: 'ar', page: 'contact', description: 'd' }));
    expect(readPublicRoute(snapshot({}, snapshot({ lang: 'ar' }, leaf)))).toEqual({ lang: 'ar', page: 'contact', description: 'd' });
  });

  it('ignores the spaces and malformed data', () => {
    expect(readPublicRoute(snapshot({ areaLabel: 'Espace élève' }))).toBeNull();
    expect(readPublicRoute(snapshot({ lang: 'de', page: 'home', description: 'd' }))).toBeNull();
    expect(readPublicRoute(snapshot({ lang: 'fr', page: 'nowhere', description: 'd' }))).toBeNull();
  });
});

describe('translations', () => {
  for (const t of TRANSLATIONS) {
    it(`${t.lang}: keeps the French facts`, () => {
      expect(facts(t.content)).toEqual(facts(CONTENT_FR));
    });

    it(`${t.lang}: keeps the shape of the interface (audiences, cards, statement)`, () => {
      expect(shape(t.messages)).toEqual(shape(MESSAGES_FR));
    });

    it(`${t.lang}: leaves no text empty`, () => {
      const empty = strings({ ...t.messages, pages: { ...t.messages.pages, home: { description: t.messages.pages.home.description } } })
        .concat(strings(t.content))
        .filter((s) => !s.text.trim() && !s.path.endsWith('countsNote'));
      expect(empty).toEqual([]);
    });
  }

  it('ar: writes the interface in Arabic script', () => {
    const latinOnly = strings(MESSAGES_AR.layout).filter((s) => !/[؀-ۿ]/.test(s.text) && /[a-z]{4}/i.test(s.text));
    expect(latinOnly).toEqual([]);
  });

  it('the home page has no title of its own in any language (the site name is used)', () => {
    expect([MESSAGES_FR, MESSAGES_EN, MESSAGES_AR].map((m) => m.pages.home.title)).toEqual(['', '', '']);
  });
});

describe('school content', () => {
  it('translates every subject of the catalogue', () => {
    expect([...MATIERE_IDS].sort()).toEqual(MATIERES.map((m) => m.id).sort());
    for (const content of [CONTENT_FR, CONTENT_EN, CONTENT_AR]) {
      expect(Object.keys(content.matieres).sort()).toEqual([...MATIERE_IDS].sort());
    }
  });

  it('writes the directors’ terms in each language', () => {
    const louis = DIRECTORS.find((d) => d.name === 'Louis-Antonin')!;
    const absi = DIRECTORS.find((d) => d.name === 'Georges Absi')!;
    expect(directorPeriod(louis, CONTENT_FR.directors)).toBe('1956 – 1961 et 1968 – 1969');
    expect(directorPeriod(absi, CONTENT_FR.directors)).toBe('2011 – aujourd’hui');
    expect(directorPeriod(louis, CONTENT_EN.directors)).toBe('1956 – 1961 and 1968 – 1969');
    expect(directorPeriod(absi, CONTENT_AR.directors)).toBe('2011 – حتى اليوم');
  });
});
