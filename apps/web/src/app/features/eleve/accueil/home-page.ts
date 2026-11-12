import { Component, computed, inject } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeStatus, HomeStatusRegion } from '../../../shared/components/home-status';
import { dayTitle } from '../../../shared/utils/format';
import { AbsencesBlock } from './absences-block';
import { GradesBlock } from './grades-block';
import { NewsBlock } from './news-block';
import { NowBlock } from './now-block';
import { TodoBlock } from './todo-block';

/**
 * The student's one page: everything checked every day, in blocks that each load their own data and end
 * with one link to their detail page. Phone: the blocks stack in this order. From tablet width:
 * Maintenant across the top, À faire, Notes and Absences side by side, Annonces across the bottom.
 * One permanent live region says when the page has loaded and which block failed.
 */
@Component({
  selector: 'app-eleve-home-page',
  imports: [AbsencesBlock, GradesBlock, HomeStatusRegion, NewsBlock, NowBlock, TodoBlock],
  providers: [HomeStatus],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Bonjour {{ firstName() }}</h1>
        <p class="t-muted">{{ date() }}</p>
      </div>
    </div>
    <app-home-status />
    <div class="home-grid">
      <app-now-block />
      <app-todo-block />
      <app-grades-block />
      <app-absences-block />
      <app-news-block />
    </div>
  `,
  styles: `
    .home-grid {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: minmax(0, 1fr);
    }
    @media (min-width: 48rem) {
      .home-grid {
        gap: var(--space-6);
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class EleveHomePage {
  readonly #auth = inject(AuthStore);
  /** The school clock moves on by itself (a page left open follows midnight; the blocks reload for the new day). */
  readonly #clock = inject(SchoolClock);
  protected readonly date = computed(() => dayTitle(this.#clock.today()));
  protected readonly firstName = computed(() => this.#auth.user()?.firstName ?? '');
}
