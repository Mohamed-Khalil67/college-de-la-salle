import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGES } from '@exam/data-access-curriculum';
import { toPatch, toRows, validateField, yearOf } from './section-spec';

describe('section editing', () => {
  const math = DEFAULT_PAGES['mathematiques'];
  const history = DEFAULT_PAGES['history'];

  it('round-trips chapters through the editor rows without losing data', () => {
    const rows = toRows(math, 'chapters');
    expect(rows[0]?.a).toBe('Analyse');
    const patch = toPatch('chapters', rows);
    expect(patch.chapters).toEqual(math.chapters);
  });

  it('renaming a chapter changes only its title', () => {
    const rows = toRows(math, 'chapters').map((r, i) => (i === 0 ? { ...r, a: 'Analyse réelle' } : r));
    const chapters = toPatch('chapters', rows).chapters ?? [];
    expect(chapters[0]?.title).toBe('Analyse réelle');
    expect(chapters[0]?.topics).toEqual(math.chapters[0]?.topics);
    expect(chapters.slice(1)).toEqual(math.chapters.slice(1));
  });

  it('turns multi-line topics into a list', () => {
    const rows = [{ id: 'x', a: 'Titre', b: '', c: ' un \n\n deux ' }];
    expect(toPatch('chapters', rows).chapters?.[0]?.topics).toEqual(['un', 'deux']);
  });

  it('reads years from Arabic-Indic and Latin digits, and keeps the timeline ordered', () => {
    expect(yearOf('١٩٥٤–١٩٥٨')).toBe(1954);
    expect(yearOf('Dec 1958')).toBe(1958);
    expect(yearOf('القرن العاشر')).toBe(0);
    const rows = toRows(history, 'timeline').reverse();
    const years = (toPatch('timeline', rows).timeline ?? []).map((e) => e.sortYear);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('validates fields in the page language', () => {
    expect(validateField('chapters', 'a', '  ', 'fr')?.message).toBe('Ce champ est obligatoire.');
    expect(validateField('chapters', 'a', '  ', 'ar')?.message).toBe('هذا الحقل مطلوب.');
    expect(validateField('resources', 'c', 'javascript:alert(1)', 'fr')?.kind).toBe('url');
    expect(validateField('resources', 'c', 'https://example.org/f.pdf', 'fr')).toBeNull();
    expect(validateField('announcements', 'a', '2026-13-45', 'ar')?.kind).toBe('date');
    expect(validateField('announcements', 'a', '2026-10-16', 'ar')).toBeNull();
    expect(validateField('hero', 'b', '', 'fr')).toBeNull(); // optional
  });
});
