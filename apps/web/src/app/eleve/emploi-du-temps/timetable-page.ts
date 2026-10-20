import { Component, computed, inject, resource, signal } from '@angular/core';
import { type OccurrenceDto, todayIso } from '@cdls/shared';
import { ApiClient } from '../../core/api/api-client';
import { Button, Icon } from '../../ui';
import { EventDetails } from '../shared/event-details';
import { LoadState } from '../shared/load-state';
import { WeekView } from '../shared/week-view';
import { shiftWeek, weekLabel, weekRange } from '../shared/week';

/** The student's week: classes, exams, homework deadlines and activities, with prev/next week. */
@Component({
  selector: 'app-timetable-page',
  imports: [Button, Icon, EventDetails, LoadState, WeekView],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Emploi du temps</h1>
        <p class="t-muted" aria-live="polite">{{ label() }}</p>
      </div>
      <div class="page__actions">
        <button cdlsButton variant="secondary" size="sm" type="button" (click)="move(-1)">
          <cdls-icon name="chevron-left" />Semaine précédente
        </button>
        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="day.set(today)">Cette semaine</button>
        <button cdlsButton variant="secondary" size="sm" type="button" (click)="move(1)">
          Semaine suivante<cdls-icon name="chevron-right" />
        </button>
      </div>
    </div>

    <app-load-state [ref]="week" label="Chargement de la semaine…" />
    @if (week.hasValue()) {
      <app-week-view [day]="day()" [occurrences]="week.value()" [today]="today" (open)="show($event)" />
    }

    <app-event-details [occurrence]="selected()" [(open)]="detailsOpen" />
  `,
})
export class TimetablePage {
  readonly #api = inject(ApiClient);
  protected readonly today = todayIso();
  protected readonly day = signal(this.today);
  protected readonly label = computed(() => weekLabel(this.day()));

  protected readonly week = resource({
    params: () => weekRange(this.day()),
    loader: ({ params }) => this.#api.calendar.occurrences(params),
  });

  protected readonly selected = signal<OccurrenceDto | null>(null);
  protected readonly detailsOpen = signal(false);

  protected move(weeks: number): void {
    this.day.update((d) => shiftWeek(d, weeks));
  }

  protected show(item: OccurrenceDto): void {
    this.selected.set(item);
    this.detailsOpen.set(true);
  }
}
