import { Component, computed, inject, resource } from '@angular/core';
import { type PostDto } from '@cdls/shared';
import { schoolToday } from '../../../core/school/school-profile';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { longDate } from '../../../shared/utils/format';
import { newsView } from './admin-home-views';

/** « Annonces »: the two latest announcements of the school. */
@Component({
  selector: 'app-admin-news-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Annonces"
      headingId="bloc-annonces"
      [state]="s"
      link="annonces"
      linkLabel="Écrire une annonce"
      loadingLabel="Chargement des annonces…"
      emptyText="Aucune annonce pour l’instant. Écrivez la première pour informer une classe, une section ou tout le collège."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <ul class="news" role="list">
          @for (post of s.data; track post.id) {
            <li>
              <article class="post" [attr.aria-labelledby]="'annonce-' + post.id">
                <h3 class="post__title" [id]="'annonce-' + post.id">{{ post.title }}</h3>
                <p class="post__meta">{{ meta(post) }}</p>
                <p class="post__body">{{ post.body }}</p>
              </article>
            </li>
          }
        </ul>
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .news {
      display: grid;
      gap: var(--space-6);
      margin: 0;
      padding: 0;
      list-style: none;
    }
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
export class AdminNewsBlock {
  readonly #api = inject(ApiClient);
  readonly #posts = resource({ loader: () => this.#api.calendar.posts({ pageSize: 2 }) });
  protected readonly state = computed(() => blockState(snapshotOf(this.#posts), newsView));

  protected reload(): void {
    this.#posts.reload();
  }

  protected meta(p: PostDto): string {
    return `${p.authorName}, le ${longDate(schoolToday(new Date(p.createdAt)))}`;
  }
}
