import { describe, expect, it } from 'vitest';
import {
  type ContentPage,
  dayToMs,
  isCalendarDay,
  isPageId,
  isSafeUrl,
  sanitizePage,
  subjectById,
  subjectBySlug,
  SUBJECTS,
} from './content';

const FALLBACK: ContentPage = {
  id: 'mathematiques',
  lang: 'fr',
  hero: { title: 'Mathématiques', subtitle: 'sub', intro: 'intro' },
  summary: 'fallback summary',
  timeline: [],
  chapters: [{ id: 'c1', title: 'Analyse', summary: '', topics: ['Limites'] }],
  resources: [],
  announcements: [],
  updatedAt: null,
  updatedBy: null,
};

describe('content model', () => {
  it('maps subjects to slugs and languages', () => {
    expect(SUBJECTS.map((s) => [s.slug, s.lang])).toEqual([
      ['arabe', 'ar'],
      ['mathematiques', 'fr'],
      ['physique-chimie', 'fr'],
    ]);
    expect(subjectBySlug('mathematiques')?.id).toBe('mathematics');
    expect(subjectBySlug('biologie')).toBeNull();
    expect(subjectById('physics-chemistry').slug).toBe('physique-chimie');
  });

  it('recognises page ids', () => {
    expect(isPageId('home')).toBe(true);
    expect(isPageId('../etc')).toBe(false);
    expect(isPageId(undefined)).toBe(false);
  });

  it('accepts only https URLs and site-relative paths', () => {
    expect(isSafeUrl('https://drive.example.org/fiche.pdf')).toBe(true);
    expect(isSafeUrl('/files/fiche.pdf')).toBe(true);
    expect(isSafeUrl('http://insecure.example.org')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('//evil.example.org/x')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });

  it('validates calendar days', () => {
    expect(isCalendarDay('2026-10-16')).toBe(true);
    expect(isCalendarDay('2026-13-40')).toBe(false);
    expect(isCalendarDay('16/10/2026')).toBe(false);
    expect(new Date(dayToMs('2026-10-16')).toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });
});

describe('sanitizePage', () => {
  it('keeps the fallback for anything missing or corrupt', () => {
    expect(sanitizePage(null, FALLBACK)).toEqual(FALLBACK);
    expect(sanitizePage('nonsense', FALLBACK)).toEqual(FALLBACK);
    expect(sanitizePage({ chapters: 'not a list' }, FALLBACK).chapters).toEqual([]);
  });

  it('never lets a document change the page identity', () => {
    const page = sanitizePage({ id: 'home', lang: 'ar' }, FALLBACK);
    expect(page.id).toBe('mathematiques');
    expect(page.lang).toBe('fr');
  });

  it('drops unsafe resources and incomplete items, and trims lengths', () => {
    const page = sanitizePage(
      {
        resources: [
          { id: 'ok', title: 'Fiche', url: 'https://example.org/a.pdf' },
          { id: 'xss', title: 'Piège', url: 'javascript:alert(1)' },
          { id: 'notitle', title: '', url: 'https://example.org/b.pdf' },
        ],
        announcements: [
          { id: 'a', date: '2026-10-01', title: 'Bonne', body: 'x' },
          { id: 'b', date: 'bad-date', title: 'Mauvaise', body: 'y' },
        ],
        chapters: [{ id: 'c', title: 'T'.repeat(500), summary: '', topics: ['  a  ', '', 'b'] }],
      },
      FALLBACK,
    );
    expect(page.resources.map((r) => r.id)).toEqual(['ok']);
    expect(page.announcements.map((a) => a.id)).toEqual(['a']);
    expect(page.chapters[0]?.title.length).toBe(200);
    expect(page.chapters[0]?.topics).toEqual(['a', 'b']);
  });

  it('bounds list sizes', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, title: `Chapitre ${i}`, summary: '', topics: [] }));
    expect(sanitizePage({ chapters: many }, FALLBACK).chapters).toHaveLength(40);
  });
});
