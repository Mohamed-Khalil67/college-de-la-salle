import { Component, inject, resource } from '@angular/core';
import type { PostDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { longDate, subjectName } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';

/** The latest announcements addressed to the student. */
@Component({
  selector: 'app-posts-panel',
  imports: [LoadState],
  host: { class: 'panel' },
  template: `
    <section class="card card--panel" aria-labelledby="news-title">
      <h2 id="news-title" class="t-h3">Annonces</h2>
      <app-load-state [ref]="posts" label="Chargement des annonces…" />
      @if (posts.hasValue()) {
        @if (posts.value().items.length) {
          <ul class="list" role="list">
            @for (p of posts.value().items; track p.id) {
              <li>
                <div class="list__main">
                  <p>{{ p.title }}</p>
                  <p class="list__meta">{{ meta(p) }}</p>
                  <p class="t-body-s">{{ p.body }}</p>
                </div>
              </li>
            }
          </ul>
        } @else {
          <p class="t-muted">Aucune annonce pour le moment.</p>
        }
      }
    </section>
  `,
})
export class PostsPanel {
  readonly #api = inject(ApiClient);
  protected readonly posts = resource({ loader: () => this.#api.calendar.posts({ pageSize: 3 }) });

  protected meta(p: PostDto): string {
    const subject = subjectName(p.subjectId);
    return [p.authorName, subject, `le ${longDate(p.createdAt.slice(0, 10))}`].filter(Boolean).join(', ');
  }
}
