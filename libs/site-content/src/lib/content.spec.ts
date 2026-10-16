import { describe, expect, it } from 'vitest';
import { KEY_FIGURES, MILESTONES, PHOTOS, SUBJECTS, subjectBySlug } from '../index';

const ARABIC = /[؀-ۿ]/;

/** Technical fields, never shown as text. */
const TECHNICAL = new Set(['slug', 'lang', 'photo', 'id', 'status', 'url', 'navLabel']);

/** Every user-visible string of an object, recursively. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => (TECHNICAL.has(key) ? [] : strings(v)));
  }
  return [];
}

describe('subjects', () => {
  it('are the three subjects of the section, in navigation order', () => {
    expect(SUBJECTS.map((s) => s.slug)).toEqual(['arabe', 'mathematiques', 'physique-chimie']);
    expect(subjectBySlug('mathematiques')?.title).toBe('Mathématiques');
    expect(subjectBySlug('biologie')).toBeNull();
  });

  it('only the Arabic subject is written in Arabic; its navigation label is French', () => {
    for (const s of SUBJECTS) {
      const text = strings(s);
      if (s.slug === 'arabe') {
        expect(s.lang).toBe('ar');
        expect(s.navLabel).toBe('Langue arabe');
        expect(text.filter((t) => t && !ARABIC.test(t))).toEqual([]);
      } else {
        expect(s.lang).toBe('fr');
        expect(text.filter((t) => ARABIC.test(t))).toEqual([]);
      }
    }
  });

  it('every subject is complete: chapters with objectives and notions, worked examples, tips, resources', () => {
    for (const s of SUBJECTS) {
      expect(s.chapters.length).toBeGreaterThanOrEqual(6);
      expect(new Set(s.chapters.map((c) => c.id)).size).toBe(s.chapters.length);
      for (const c of s.chapters) {
        expect(c.objectives.length).toBeGreaterThan(0);
        expect(c.notions.length).toBeGreaterThan(0);
        expect(['prevu', 'en-cours', 'termine']).toContain(c.status);
      }
      expect(s.examples.length).toBeGreaterThanOrEqual(4);
      for (const e of s.examples) expect(e.steps.length).toBeGreaterThan(0);
      expect(s.tips.length).toBeGreaterThanOrEqual(4);
      expect(s.resources.length).toBeGreaterThan(0);
    }
  });

  it('highlights match the content they count', () => {
    const math = subjectBySlug('mathematiques')!;
    expect(math.highlights[0]?.value).toBe(String(math.chapters.length));
    const pc = subjectBySlug('physique-chimie')!;
    expect(pc.highlights[0]?.value).toBe(String(pc.chapters.length));
    expect(pc.highlights[2]?.value).toBe(String(pc.examples.length));
  });

  it('no chapter is marked done until a teacher says so', () => {
    for (const s of SUBJECTS) expect(s.chapters.every((c) => c.status === 'prevu')).toBe(true);
  });
});

describe('school history and photos', () => {
  it('milestones are in chronological order and start with the 1898 foundation', () => {
    const years = MILESTONES.map((m) => Number(m.year));
    expect(years[0]).toBe(1898);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(KEY_FIGURES.map((f) => f.value)).toContain('1898');
  });

  it('every referenced photo exists and every photo is credited with its source', () => {
    const ids = new Set(Object.keys(PHOTOS));
    for (const m of MILESTONES) if (m.photo) expect(ids.has(m.photo)).toBe(true);
    for (const s of SUBJECTS) expect(ids.has(s.photo)).toBe(true);
    for (const p of Object.values(PHOTOS)) {
      expect(p.src).toMatch(/^\/images\/(school|archives)\/[a-z0-9-]+\.jpg$/);
      expect(p.credit).toMatch(/Frères des Écoles Chrétiennes|Collège De La Salle/);
      expect(p.sourceUrl).toMatch(/^https?:\/\/(www\.)?lasalle-(po\.org|eg\.net)\//);
      expect(p.alt.length).toBeGreaterThan(20);
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });
});
