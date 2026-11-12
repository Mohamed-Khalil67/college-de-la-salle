import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock } from '../../../shared/components/home-block';
import { PostItem } from '../../../shared/components/post-item';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { newsView } from '../../../shared/utils/posts';

/** « Annonces »: the two latest announcements the teacher can read; the entry link also opens the writing form. */
@Component({
  selector: 'app-teacher-news-block',
  imports: [HomeBlock, PostItem],
  template: `
    @let s = state();
    <app-home-block
      heading="Annonces"
      headingId="bloc-annonces"
      [state]="s"
      link="annonces"
      linkLabel="Écrire ou lire les annonces"
      loadingLabel="Chargement des annonces…"
      emptyText="Aucune annonce pour l’instant. Écrivez-en une pour vos classes quand vous en avez besoin."
      [wide]="true"
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <ul class="news" role="list">
          @for (post of s.data; track post.id) {
            <li><app-post-item [post]="post" [level]="3" /></li>
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
    @media (min-width: 48rem) {
      .news {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class TeacherNewsBlock {
  readonly #api = inject(ApiClient);
  readonly #posts = resource({ loader: () => this.#api.calendar.posts({ pageSize: 2 }) });
  protected readonly state = computed(() => blockState(snapshotOf(this.#posts), (page) => newsView(page.items)));

  protected reload(): void {
    this.#posts.reload();
  }
}
