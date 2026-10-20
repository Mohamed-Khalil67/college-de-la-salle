import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { HomeworkDto } from '@cdls/shared';
import { ApiClient } from '../../core/api/api-client';
import { HomeworkItem } from '../devoirs/homework-item';
import { LoadState } from '../shared/load-state';

/** The next homework to hand in, with the done checkbox. */
@Component({
  selector: 'app-homework-panel',
  imports: [RouterLink, HomeworkItem, LoadState],
  host: { class: 'panel' },
  template: `
    <section class="card card--panel" aria-labelledby="hw-title">
      <div class="card__header">
        <h2 id="hw-title" class="t-h3">Devoirs à rendre</h2>
        <a class="t-body-s" routerLink="devoirs">Tous les devoirs</a>
      </div>
      <app-load-state [ref]="homework" label="Chargement des devoirs…" />
      @if (homework.hasValue()) {
        @if (items().length) {
          <ul class="list" role="list">
            @for (item of items(); track item.event.id) {
              <li><app-homework-item [item]="item" [today]="today()" (changed)="replace($event)" /></li>
            }
          </ul>
        } @else {
          <p class="t-muted">Aucun devoir à rendre pour le moment.</p>
        }
      }
    </section>
  `,
})
export class HomeworkPanel {
  readonly today = input.required<string>();

  readonly #api = inject(ApiClient);
  protected readonly homework = resource({
    params: () => ({ from: this.today() }),
    loader: ({ params }) => this.#api.calendar.homework(params),
  });
  protected readonly items = computed(() => (this.homework.hasValue() ? this.homework.value().slice(0, 5) : []));

  protected replace(updated: HomeworkDto): void {
    this.homework.update((list) => list?.map((h) => (h.event.id === updated.event.id ? updated : h)));
  }
}
