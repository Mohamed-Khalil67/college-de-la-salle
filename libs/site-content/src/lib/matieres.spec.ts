import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MATIERE_GROUPS, MATIERES, matiereById, matiereName, matieresFor } from '../index';

const publicFile = (src: string) => resolve(__dirname, '../../../../public', src.replace(/^\//, ''));

describe('matières catalogue', () => {
  it('has 17 subjects with unique ids', () => {
    expect(MATIERES).toHaveLength(17);
    expect(new Set(MATIERES.map((m) => m.id)).size).toBe(17);
  });

  it('every subject has French text, a known group, a track and its own SVG illustration', () => {
    for (const m of MATIERES) {
      expect(MATIERE_GROUPS, m.id).toContain(m.group);
      expect(m.tracks.length, m.id).toBeGreaterThan(0);
      expect(m.alt, m.id).toMatch(/^Illustration : /);
      expect(m.blurb, m.id).toMatch(/\.$/);
      expect(existsSync(publicFile(m.image)), m.image).toBe(true);
      const svg = readFileSync(publicFile(m.image), 'utf8');
      expect(svg, m.image).toContain('<svg');
      // Valid XML: a repeated attribute makes browsers refuse the whole image.
      for (const [, attrs] of svg.matchAll(/<[a-zA-Z]+((?:\s+[a-zA-Z:-]+="[^"]*")+)\s*\/?>/g)) {
        const names = [...attrs!.matchAll(/\s+([a-zA-Z:-]+)=/g)].map((a) => a[1]);
        expect(new Set(names).size, `${m.image}: repeated attribute in ${attrs}`).toBe(names.length);
      }
    }
  });

  it('looks subjects up by id, and shows unknown ids as written', () => {
    expect(matiereById('mathematiques')?.name).toBe('Mathématiques');
    expect(matiereById('nope')).toBeNull();
    expect(matiereName('arabe')).toBe('Langue arabe');
    expect(matiereName('nope')).toBe('nope');
  });

  it('each track has its own subjects, and shared ones appear in both', () => {
    const nationale = matieresFor('nationale').map((m) => m.id);
    const bac = matieresFor('bac').map((m) => m.id);
    expect(nationale).toContain('psychologie');
    expect(nationale).not.toContain('espagnol');
    expect(bac).toContain('espagnol');
    expect(bac).not.toContain('psychologie');
    expect(nationale).toContain('mathematiques');
    expect(bac).toContain('mathematiques');
  });
});
