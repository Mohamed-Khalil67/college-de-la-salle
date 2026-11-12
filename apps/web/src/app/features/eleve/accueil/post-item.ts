import { Component, computed, input } from '@angular/core';
import { type PostDto, schoolToday } from '@cdls/shared';
import { longDate, subjectName } from '../../../shared/utils/format';

/** One announcement: title (h3 on the home page, h2 on the full list), who and when, then the text. */
@Component({
  selector: 'app-post-item',
  template: `
    <article class="post" [attr.aria-labelledby]="'annonce-' + post().id">
      @if (level() === 2) {
        <h2 class="post__title" [id]="'annonce-' + post().id">{{ post().title }}</h2>
      } @else {
        <h3 class="post__title" [id]="'annonce-' + post().id">{{ post().title }}</h3>
      }
      <p class="post__meta">{{ meta() }}</p>
      <p class="post__body">{{ post().body }}</p>
    </article>
  `,
  styles: `
    .post {
      display: grid;
      gap: var(--space-1);
      padding-inline-start: var(--space-4);
      border-inline-start: 3px solid var(--color-accent);
    }
    .post p,
    .post__title {
      margin: 0;
    }
    .post__title {
      font-size: var(--text-body-l);
      font-weight: 600;
      color: var(--color-heading);
    }
    .post__meta {
      font-size: var(--text-body-s);
      color: var(--color-muted);
    }
    .post__body {
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
  `,
})
export class PostItem {
  readonly post = input.required<PostDto>();
  readonly level = input<2 | 3>(3);
  /** « Direction, Mathématiques, le 9 novembre 2026 » */
  protected readonly meta = computed(() => {
    const p = this.post();
    return [p.authorName, subjectName(p.subjectId), `le ${longDate(schoolToday(new Date(p.createdAt)))}`].filter(Boolean).join(', ');
  });
}
