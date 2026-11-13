import { type PostDto, schoolToday } from '@cdls/shared';

/** The latest announcements, newest first; null when there are none (the block's empty state). */
export function newsView(posts: readonly PostDto[], count = 2): readonly PostDto[] | null {
  const latest = [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, count);
  return latest.length ? latest : null;
}

/** The school day (Cairo time, `YYYY-MM-DD`) an announcement was written: never the UTC date of its timestamp. */
export function postDay(createdAt: string): string {
  return schoolToday(new Date(createdAt));
}
