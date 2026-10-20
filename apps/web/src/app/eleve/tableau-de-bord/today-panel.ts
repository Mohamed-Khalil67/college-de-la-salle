import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OccurrenceDto } from '@cdls/shared';
import { ApiClient } from '../../core/api/api-client';
import { Badge } from '../../ui';
import { clock, kindLabel, subjectName } from '../shared/format';
import { LoadState } from '../shared/load-state';

/** Today's classes and exams (homework deadlines are in their own panel). */
@Component({
  selector: 'app-today-panel',
  imports: [RouterLink, Badge, LoadState],
  host: { class: 'panel' },
  template: `
    <section class="card card--panel" aria-labelledby="today-title">
      <div class="card__header">
        <h2 id="today-title" class="t-h3">Aujourd’hui</h2>
        <a class="t-body-s" routerLink="emploi-du-temps">Emploi du temps</a>
      </div>
      <app-load-state [ref]="occurrences" label="Chargement de la journée…" />
      @if (occurrences.hasValue()) {
        @if (items().length) {
          <ol class="list" role="list">
            @for (item of items(); track item.key) {
              <li>
                <span class="list__time">{{ start(item) }}</span>
                <div class="list__main">
                  <p>
                    {{ item.event.title }}
                    @if (isNow(item)) {
                      <cdls-badge tone="info">En cours</cdls-badge>
                    }
                  </p>
                  <p class="list__meta">{{ meta(item) }}</p>
                </div>
              </li>
            }
          </ol>
        } @else {
          <p class="t-muted">Pas de cours aujourd’hui.</p>
        }
      }
    </section>
  `,
})
export class TodayPanel {
  readonly today = input.required<string>();
  /** « HH:MM », to flag the class in progress. */
  readonly now = input('');

  readonly #api = inject(ApiClient);
  protected readonly occurrences = resource({
    params: () => ({ from: this.today(), to: this.today() }),
    loader: ({ params }) => this.#api.calendar.occurrences(params),
  });
  protected readonly items = computed(() =>
    this.occurrences.hasValue() ? this.occurrences.value().filter((o) => o.event.kind !== 'devoir') : [],
  );

  protected start(item: OccurrenceDto): string {
    return clock(item.event.startTime) || 'Journée';
  }
  protected isNow(item: OccurrenceDto): boolean {
    const { startTime, endTime } = item.event;
    return !!startTime && !!endTime && startTime <= this.now() && this.now() < endTime;
  }
  protected meta(item: OccurrenceDto): string {
    const e = item.event;
    const subject = subjectName(e.subjectId);
    const kind = e.kind === 'cours' ? '' : kindLabel(e.kind);
    return [kind, subject && subject !== e.title ? subject : '', e.place, e.authorName].filter(Boolean).join(', ');
  }
}
