import { Component, computed, inject, resource } from '@angular/core';
import { addDays, type HomeworkDto, type OccurrenceDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState, bothOf, snapshotOf } from '../../../shared/utils/block-state';
import { capitalize, subjectName } from '../../../shared/utils/format';
import { shortDate } from '../../timetable/timetable-format';
import { HomeworkItem } from '../devoirs/homework-item';
import { TODO_DAYS, todoView } from './home-views';

/**
 * « À faire »: the next homework, ticked right here (same call as the Devoirs page), and the tests and
 * exams of the next two weeks with their day.
 */
@Component({
  selector: 'app-todo-block',
  imports: [HomeBlock, HomeworkItem],
  template: `
    @let s = state();
    <app-home-block
      heading="À faire"
      headingId="bloc-a-faire"
      [state]="s"
      link="agenda"
      linkLabel="Tous les devoirs et contrôles"
      loadingLabel="Chargement des devoirs…"
      emptyText="Rien à rendre ni contrôle prévu d’ici deux semaines."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <div class="todo">
          <h3 class="todo__title" id="bloc-a-faire-devoirs">Devoirs</h3>
          @if (s.data.homework.length) {
            <ul class="list" role="list" aria-labelledby="bloc-a-faire-devoirs">
              @for (item of s.data.homework; track item.event.id) {
                <li><app-homework-item [item]="item" [today]="today()" (changed)="replace($event)" /></li>
              }
            </ul>
          } @else {
            <p class="todo__none">Rien à rendre d’ici deux semaines.</p>
          }
        </div>
        <div class="todo">
          <h3 class="todo__title" id="bloc-a-faire-controles">Contrôles</h3>
          @if (s.data.tests.length) {
            <ul class="list" role="list" aria-labelledby="bloc-a-faire-controles">
              @for (test of s.data.tests; track test.key) {
                <li>
                  <div class="list__main">
                    <p>{{ test.event.title }}</p>
                    <p class="list__meta">{{ meta(test) }}</p>
                  </div>
                  <p class="todo__day">{{ day(test) }}</p>
                </li>
              }
            </ul>
          } @else {
            <p class="todo__none">Aucun contrôle prévu d’ici deux semaines.</p>
          }
        </div>
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .todo {
      display: grid;
      gap: var(--space-2);
    }
    .todo__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-heading);
    }
    .todo__none {
      margin: 0;
      color: var(--color-muted);
      font-size: var(--text-body-s);
    }
    .todo__day {
      flex: none;
      margin: 0;
      font-size: var(--text-body-s);
      font-weight: 600;
      color: var(--color-heading);
      white-space: nowrap;
    }
  `,
})
export class TodoBlock {
  readonly #api = inject(ApiClient);
  protected readonly today = inject(SchoolClock).today;
  readonly #homework = resource({
    params: () => ({ from: this.today() }),
    loader: ({ params }) => this.#api.calendar.homework(params),
  });
  readonly #events = resource({
    params: () => ({ from: this.today(), to: addDays(this.today(), TODO_DAYS) }),
    loader: ({ params }) => this.#api.calendar.occurrences(params),
  });

  protected readonly state = computed(() =>
    blockState(bothOf(snapshotOf(this.#homework), snapshotOf(this.#events)), ([homework, events]) =>
      todoView(homework, events, this.today()),
    ),
  );

  protected reload(): void {
    this.#homework.reload();
    this.#events.reload();
  }

  /** A tick saved by the item: keep it in the list (it never moves, so the focus stays on its box). */
  protected replace(updated: HomeworkDto): void {
    this.#homework.update((list) => list?.map((h) => (h.event.id === updated.event.id ? updated : h)));
  }
  protected meta(test: OccurrenceDto): string {
    return [subjectName(test.event.subjectId), test.event.type.label].filter(Boolean).join(', ');
  }
  /** « Aujourd’hui », « Demain », « Jeu. 12 nov. ». */
  protected day(test: OccurrenceDto): string {
    if (test.day === this.today()) return 'Aujourd’hui';
    if (test.day === addDays(this.today(), 1)) return 'Demain';
    return capitalize(shortDate(test.day));
  }
}
