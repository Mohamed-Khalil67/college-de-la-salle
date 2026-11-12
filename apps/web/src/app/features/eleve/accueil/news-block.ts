import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock, snapshotOf } from '../../../shared/components/home-block';
import { blockState } from '../../../shared/utils/block-state';
import { newsView } from './home-views';
import { PostItem } from './post-item';

/** « Annonces »: the two latest announcements for the student's class and section. */
@Component({
  selector: 'app-news-block',
  imports: [HomeBlock, PostItem],
  template: `
    @let s = state();
    <app-home-block
      heading="Annonces"
      headingId="bloc-annonces"
      [state]="s"
      link="annonces"
      linkLabel="Toutes les annonces"
      loadingLabel="Chargement des annonces…"
      emptyText="Aucune annonce pour l’instant. Les messages de l’école et de vos enseignants arriveront ici."
      [wide]="true"
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
export class NewsBlock {
  readonly #api = inject(ApiClient);
  readonly #posts = resource({ loader: () => this.#api.calendar.posts({ pageSize: 2 }) });
  protected readonly state = computed(() => blockState(snapshotOf(this.#posts), (page) => newsView(page.items)));
}
