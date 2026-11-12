import { Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import type { Paginated, PostDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { LoadState } from '../../../shared/components/load-state';
import { EmptyState, Pagination } from '../../../shared/ui';
import { PostItem } from '../accueil/post-item';

const PAGE_SIZE = 10;

/** Every announcement for the student's class and section, newest first, ten a page. */
@Component({
  selector: 'app-announcements-page',
  imports: [EmptyState, LoadState, Pagination, PostItem],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Annonces</h1>
        <p class="t-muted">Les messages de l’école et de vos enseignants, du plus récent au plus ancien.</p>
      </div>
    </div>
    <app-load-state [ref]="posts" label="Chargement des annonces…" />
    @if (shown(); as list) {
      @if (list.items.length) {
        <ul class="posts card card--panel" role="list">
          @for (post of list.items; track post.id) {
            <li><app-post-item [post]="post" [level]="2" /></li>
          }
        </ul>
        <cdls-pagination [total]="total()" [pageSize]="pageSize" label="Pages des annonces" noun="annonces" [(page)]="page" />
      } @else {
        <cdls-empty-state
          icon="bell"
          title="Aucune annonce pour l’instant"
          description="Les messages de l’école et de vos enseignants arriveront ici."
        />
      }
    }
  `,
  styles: `
    .posts {
      display: grid;
      gap: var(--space-8);
      margin: 0 0 var(--space-6);
      list-style: none;
    }
  `,
})
export class AnnouncementsPage {
  readonly #api = inject(ApiClient);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly page = signal(1);
  protected readonly posts = resource({
    params: () => ({ page: this.page(), pageSize: PAGE_SIZE }),
    loader: ({ params }) => this.#api.calendar.posts(params),
  });
  /** The page on screen stays while the next one loads, so the pagination keeps its place and focus. */
  protected readonly shown = linkedSignal<Paginated<PostDto> | undefined, Paginated<PostDto> | undefined>({
    source: () => (this.posts.hasValue() ? this.posts.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });
  protected readonly total = computed(() => this.shown()?.total ?? 0);
}
