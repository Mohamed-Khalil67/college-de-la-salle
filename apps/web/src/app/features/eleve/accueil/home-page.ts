import { afterNextRender, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { schoolToday } from '@cdls/shared';
import { AuthStore } from '../../../core/auth/auth-store';
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
 */
@Component({
  selector: 'app-eleve-home-page',
  imports: [AbsencesBlock, GradesBlock, NewsBlock, NowBlock, TodoBlock],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Bonjour {{ firstName() }}</h1>
        <p class="t-muted">{{ date() }}</p>
      </div>
    </div>
    <div class="home-grid">
      <app-now-block [today]="today()" />
      <app-todo-block [today]="today()" />
      <app-grades-block [today]="today()" />
      <app-absences-block [today]="today()" />
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
  /**
   * Today in Cairo, for every block (one date for the whole page). Checked every minute in the browser, so
   * a page left open past midnight moves on to the new day (the blocks reload for it).
   */
  protected readonly today = signal(schoolToday());
  protected readonly date = computed(() => dayTitle(this.today()));
  protected readonly firstName = computed(() => this.#auth.user()?.firstName ?? '');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const timer = setInterval(() => this.today.set(schoolToday()), 60_000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }
}
