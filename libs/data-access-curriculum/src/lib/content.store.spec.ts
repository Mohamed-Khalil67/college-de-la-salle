import { TestBed } from '@angular/core/testing';
import { AuthStore } from '@exam/data-access-auth';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { PAGE_IDS, SUBJECTS } from '@exam/contracts';
import { DEFAULT_PAGES } from './content.defaults';
import { ContentStore } from './content.store';

function store(teacher: boolean): ContentStore {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthStore,
        useValue: { uid: signal(teacher ? 'teacher-1' : null), isTeacher: signal(teacher) },
      },
    ],
  });
  return TestBed.inject(ContentStore);
}

describe('bundled content', () => {
  it('has a page for every page id, in its own language', () => {
    expect(Object.keys(DEFAULT_PAGES).sort()).toEqual([...PAGE_IDS].sort());
    for (const s of SUBJECTS) expect(DEFAULT_PAGES[s.slug].lang).toBe(s.lang);
    expect(DEFAULT_PAGES['home'].lang).toBe('ar');
  });

  it('carries the school milestones in chronological order', () => {
    const years = DEFAULT_PAGES['history'].timeline.map((e) => e.sortYear);
    expect(years).toEqual([1898, 1905, 1954, 1957]);
    expect(DEFAULT_PAGES['history'].timeline.map((e) => e.id)).toEqual(['fondation', 'campus', 'chapelle', 'khoronfish']);
  });

  it('French subject pages are written in French', () => {
    for (const slug of ['mathematiques', 'physique-chimie'] as const) {
      const page = DEFAULT_PAGES[slug];
      expect(page.chapters.length).toBeGreaterThan(2);
      expect(page.chapters.some((c) => /[a-z]/i.test(c.title))).toBe(true);
      expect(page.chapters.every((c) => !/[؀-ۿ]/.test(c.title))).toBe(true);
    }
  });

  it('every default resource and chapter id is unique within its page', () => {
    for (const page of Object.values(DEFAULT_PAGES)) {
      const ids = page.chapters.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('ContentStore', () => {
  it('serves the bundled default until a teacher saves', () => {
    const s = store(false);
    expect(s.page('mathematiques')().chapters[0]?.title).toBe('Analyse');
    expect(s.isDefault('mathematiques')()).toBe(true);
  });

  it('refuses edits from anyone who is not a teacher', async () => {
    const s = store(false);
    await expect(s.save('home', { summary: 'x' })).rejects.toThrow('NOT_TEACHER');
    expect(s.page('home')().summary).toBe('');
  });
});
