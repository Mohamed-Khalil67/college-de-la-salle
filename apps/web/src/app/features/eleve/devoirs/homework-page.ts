import { Component, computed, inject, resource } from '@angular/core';
import { addDays, type HomeworkDto, todayIso } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { EmptyState } from '../../../shared/ui';
import { plural } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';
import { HomeworkItem } from './homework-item';

/** Homework to hand in (« devoir » events of the class), with a done checkbox per item. */
@Component({
  selector: 'app-homework-page',
  imports: [EmptyState, LoadState, HomeworkItem],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Devoirs</h1>
        <p class="t-muted">{{ summary() }}</p>
      </div>
    </div>

    <app-load-state [ref]="homework" label="Chargement des devoirs…" />
    @if (homework.hasValue()) {
      @if (homework.value().length) {
        <div class="grid-2">
          <section class="card card--panel" aria-labelledby="a-faire">
            <h2 id="a-faire" class="t-h3">À rendre</h2>
            @if (upcoming().length) {
              <ul class="list" role="list">
                @for (item of upcoming(); track item.event.id) {
                  <li><app-homework-item [item]="item" [today]="today" (changed)="replace($event)" /></li>
                }
              </ul>
            } @else {
              <p class="t-muted">Rien à rendre dans les prochains jours.</p>
            }
          </section>
          <section class="card card--panel" aria-labelledby="faits">
            <h2 id="faits" class="t-h3">Date de remise passée</h2>
            @if (past().length) {
              <ul class="list" role="list">
                @for (item of past(); track item.event.id) {
                  <li><app-homework-item [item]="item" [today]="today" (changed)="replace($event)" /></li>
                }
              </ul>
            } @else {
              <p class="t-muted">Aucun devoir ce mois-ci.</p>
            }
          </section>
        </div>
      } @else {
        <cdls-empty-state icon="book" title="Aucun devoir pour le moment" description="Les devoirs publiés par vos enseignants apparaîtront ici, avec leur date de remise." />
      }
    }
  `,
})
export class HomeworkPage {
  readonly #api = inject(ApiClient);
  protected readonly today = todayIso();

  protected readonly homework = resource({
    params: () => ({ from: addDays(this.today, -30) }),
    loader: ({ params }) => this.#api.calendar.homework(params),
  });

  // Items are grouped by due date, not by done state, so ticking one never moves it (or the focus).
  readonly #list = computed(() => (this.homework.hasValue() ? this.homework.value() : []));
  /** Soonest first. */
  protected readonly upcoming = computed(() => this.#list().filter((h) => h.event.date >= this.today));
  /** Most recent due date first. */
  protected readonly past = computed(() => this.#list().filter((h) => h.event.date < this.today).reverse());
  protected readonly summary = computed(() => {
    const left = this.upcoming().filter((h) => !h.done).length;
    if (!this.homework.hasValue()) return 'Cochez les devoirs que vous avez faits.';
    return left === 0
      ? 'Tous les devoirs à venir sont faits.'
      : `${plural(left, 'devoir')} à faire. Cochez ceux que vous avez terminés.`;
  });

  protected replace(updated: HomeworkDto): void {
    this.homework.update((list) => list?.map((h) => (h.event.id === updated.event.id ? updated : h)));
  }
}
