import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAC, CONTACTS, DIRECTORS, FOUNDER, MILESTONES, NATIONALE, PHOTOS, SECTIONS, sectionBySlug } from '../index';

/** Reads width and height from a JPEG's start-of-frame marker. */
function jpegSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(resolve(__dirname, '../../../../public', file.replace(/^\//, '')));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`${file} is not a JPEG`);
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('bad marker');
    const marker = bytes[i + 1]!;
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5]! << 8) | bytes[i + 6]!, width: (bytes[i + 7]! << 8) | bytes[i + 8]! };
    }
    i += 2 + length;
  }
  throw new Error('no SOF marker');
}

describe('photos', () => {
  it('has the 26 photographs, each file present with the exact size declared (reserves the right space)', () => {
    const photos = Object.values(PHOTOS);
    expect(photos).toHaveLength(26);
    for (const p of photos) {
      expect(jpegSize(p.src), p.id).toEqual({ width: p.width, height: p.height });
    }
  });

  it('every photo has French alt text, a caption, a credit naming its source, and a source URL', () => {
    for (const p of Object.values(PHOTOS)) {
      expect(p.alt.length, p.id).toBeGreaterThan(15);
      expect(p.caption, p.id).toMatch(/\.$/);
      expect(p.credit, p.id).toMatch(/^Photo : /);
      expect(p.sourceUrl, p.id).toMatch(/^https?:\/\/(www\.)?lasalle-(eg\.net|po\.org)\//);
    }
  });
});

describe('sections', () => {
  it('are « Bac nationale » and « Bac français »', () => {
    expect(SECTIONS.map((s) => s.slug)).toEqual(['nationale', 'bac']);
    expect(sectionBySlug('bac')).toBe(BAC);
    expect(NATIONALE.title).toBe('Bac nationale');
    expect(BAC.title).toBe('Bac français');
    expect(sectionBySlug('maternelle')).toBeNull();
  });

  it('Bac headcounts match the published figures: 74 + 87 + 107 = 268', () => {
    const totals = BAC.counts.map((c) => c.levels.reduce((sum, l) => sum + l.students, 0));
    expect(totals).toEqual([74, 87, 107]);
    expect(totals.reduce((a, b) => a + b, 0)).toBe(268);
    expect(BAC.facts.map((f) => f.value)).toContain('268');
  });

  it('the Bac section states the AEFE homologation date and the 2009 opening', () => {
    const text = JSON.stringify(BAC);
    expect(text).toContain('10 janvier 2013');
    expect(text).toContain('septembre 2009');
    expect(MILESTONES.map((m) => m.year)).toContain('2013');
  });

  it('links are https (or the official http site), and external ones carry no secrets', () => {
    for (const l of [...NATIONALE.links, ...BAC.links]) {
      expect(l.url).toMatch(/^https?:\/\//);
      expect(l.url).not.toMatch(/token|password|secret/i);
    }
  });

  it('the site content is all French (no Arabic script)', () => {
    const arabic = /[؀-ۿ]/;
    for (const s of SECTIONS) expect(arabic.test(JSON.stringify(s)), s.slug).toBe(false);
    expect(arabic.test(JSON.stringify([...MILESTONES, ...DIRECTORS, ...CONTACTS, FOUNDER]))).toBe(false);
  });
});

describe('school facts', () => {
  it('lists 22 Brother directors and 4 lay directors, as published', () => {
    expect(DIRECTORS.filter((d) => d.kind === 'frere')).toHaveLength(22);
    expect(DIRECTORS.filter((d) => d.kind === 'laic')).toHaveLength(4);
    expect(DIRECTORS.find((d) => d.name === 'Georges Absi')?.role).toContain('2014');
  });

  it('the founder dates match the official page', () => {
    expect(FOUNDER.dates).toBe('1651 – 1719');
    expect(FOUNDER.facts.map((f) => f.date)).toContain('24 mai 1900');
  });

  it('contacts: nine departments, every number in international format', () => {
    expect(CONTACTS).toHaveLength(9);
    for (const c of CONTACTS) for (const phone of c.phones) expect(phone).toMatch(/^\+20 2 \d{4} \d{2} \d{2}$/);
    expect(CONTACTS.find((c) => c.label === 'Bac français')?.phones).toEqual(['+20 2 2592 95 98']);
  });
});
