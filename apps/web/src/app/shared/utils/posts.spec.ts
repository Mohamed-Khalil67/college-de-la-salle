import type { PostDto } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import { newsView } from './posts';

const post = (id: string, createdAt: string): PostDto => ({
  id,
  title: id,
  body: 'Texte',
  subjectId: null,
  classId: null,
  sectionId: null,
  authorId: 'a',
  authorName: 'Direction',
  createdAt,
});

describe('newsView', () => {
  it('is null without announcement (the empty state)', () => {
    expect(newsView([])).toBeNull();
  });
  it('shows the two latest, newest first, without changing the input', () => {
    const posts = [post('old', '2026-10-01T08:00:00Z'), post('new', '2026-11-09T08:00:00Z'), post('mid', '2026-11-01T08:00:00Z')];
    expect(newsView(posts)?.map((p) => p.id)).toEqual(['new', 'mid']);
    expect(posts.map((p) => p.id)).toEqual(['old', 'new', 'mid']);
  });
  it('takes the count asked for', () => {
    const posts = [post('a', '2026-11-01T08:00:00Z'), post('b', '2026-11-02T08:00:00Z'), post('c', '2026-11-03T08:00:00Z')];
    expect(newsView(posts, 3)).toHaveLength(3);
    expect(newsView(posts, 1)?.map((p) => p.id)).toEqual(['c']);
  });
});
