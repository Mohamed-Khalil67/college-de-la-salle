import type { ActivatedRouteSnapshot } from '@angular/router';
import { MATIERES } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { PROFILE } from '../core/school/school-profile';
import { FR } from './fr';
import { DIRECTORS } from '../school/active/archive';
import { directorPeriod, MATIERE_IDS, type SchoolContent } from '../school/school-content';
import { DEFAULT_LANG, isLang, LANG_META, LANGS } from './lang';
import { publicRouteData, readPublicRoute } from './locale';
import { canonicalPageUrl, pageUrl, PRERENDERED_PAGES, PUBLIC_PAGES, routePath } from './pages';

/*
 * The types already make every key of the interface present. These tests check what types cannot: the addresses of
 * the pages, the route data, and that no text of the French site was left empty.
 */

/** Every string reachable in a value (functions are called with a sample argument). */
function strings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (typeof value === 'function') return strings((value as (arg: unknown) => unknown)('X'), path);
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

describe('the French site and its pages', () => {
  it('is French only', () => {
    expect(LANGS).toEqual(['fr']);
    expect(DEFAULT_LANG).toBe('fr');
    expect(LANG_META.fr.dir).toBe('ltr');
    expect(isLang('fr')).toBe(true);
    expect(isLang('en')).toBe(false);
    expect(isLang('ar')).toBe(false);
    expect(PROFILE.languages).toEqual(['fr']);
  });

  it('keeps the historic French addresses', () => {
    expect(PUBLIC_PAGES.map((p) => pageUrl('fr', p))).toEqual([
      '/',
      '/histoire',
      '/bac-nationale',
      '/bac-francais',
      '/contact',
      '/accessibilite',
      '/connexion',
    ]);
    for (const page of PUBLIC_PAGES) expect(canonicalPageUrl(page)).toBe(pageUrl('fr', page));
  });

  it('gives each page a distinct address', () => {
    const all = PUBLIC_PAGES.map((p) => routePath('fr', p));
    expect(new Set(all).size).toBe(all.length);
  });

  it('prerenders every page but the login page', () => {
    expect(PRERENDERED_PAGES).not.toContain('login');
    expect(PRERENDERED_PAGES).toHaveLength(PUBLIC_PAGES.length - 1);
  });
});

describe('route data', () => {
  const snapshot = (data: object, firstChild: ActivatedRouteSnapshot | null = null) =>
    ({ data, firstChild }) as unknown as ActivatedRouteSnapshot;

  it('reads the deepest public route', () => {
    const leaf = snapshot(publicRouteData({ lang: 'fr', page: 'contact', description: 'd' }));
    expect(readPublicRoute(snapshot({}, snapshot({ lang: 'fr' }, leaf)))).toEqual({ lang: 'fr', page: 'contact', description: 'd' });
  });

  it('ignores the spaces and malformed data', () => {
    expect(readPublicRoute(snapshot({ areaLabel: 'Espace élève' }))).toBeNull();
    expect(readPublicRoute(snapshot({ lang: 'en', page: 'home', description: 'd' }))).toBeNull();
    expect(readPublicRoute(snapshot({ lang: 'fr', page: 'nowhere', description: 'd' }))).toBeNull();
  });
});

describe('french texts', () => {
  it('leaves no text empty', () => {
    const messages = { ...FR.messages, pages: { ...FR.messages.pages, home: { description: FR.messages.pages.home.description } } };
    const empty = strings(messages)
      .concat(strings(FR.content))
      .filter((s) => !s.text.trim() && !s.path.endsWith('countsNote'));
    expect(empty).toEqual([]);
  });

  it('has no title of its own on the home page (the site name is used)', () => {
    expect(FR.messages.pages.home.title).toBe('');
  });
});

describe('school content', () => {
  it('has every subject of the catalogue', () => {
    expect([...MATIERE_IDS].sort()).toEqual(MATIERES.map((m) => m.id).sort());
    expect(Object.keys(FR.content.matieres as SchoolContent['matieres']).sort()).toEqual([...MATIERE_IDS].sort());
  });

  it.skipIf(PROFILE.id !== 'cdls-daher')('writes the directors’ terms', () => {
    const louis = DIRECTORS.find((d) => d.name === 'Louis-Antonin')!;
    const absi = DIRECTORS.find((d) => d.name === 'Georges Absi')!;
    expect(directorPeriod(louis, FR.content.directors)).toBe('1956 – 1961 et 1968 – 1969');
    expect(directorPeriod(absi, FR.content.directors)).toBe('2011 – aujourd’hui');
  });
});
