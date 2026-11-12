import { Component, computed, inject, resource, signal } from '@angular/core';
import { schoolToday } from '@cdls/shared';
import { AuthStore } from '../../../core/auth/auth-store';
import { Button, EmptyState, Icon } from '../../../shared/ui';
import { LoadState } from '../../../shared/components/load-state';
import { dayTitle } from '../../../shared/utils/format';
import { shiftWeek, weekLabel } from '../../../shared/utils/week';
import { SessionItem } from '../../timetable/session-item';
import { TimetableApi } from '../../timetable/timetable-api';
import { byDayOfWeek, weekWindow } from '../../timetable/timetable-format';

/**
 * « Mon emploi du temps »: the teacher's week, to read. A teacher does not build or change the timetable:
 * the planificateur does (cancelled, covered or moved sessions show here with their label). The API still lets a
 * teacher change their own sessions; the screen no longer offers it.
 */
@Component({
  selector: 'app-my-timetable-page',
  imports: [Button, EmptyState, Icon, LoadState, SessionItem],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Mon emploi du temps</h1>
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
    <p class="t-body-s t-muted">Une séance à changer ? Demandez-le au planificateur de l’emploi du temps.</p>

    <app-load-state [ref]="week" label="Chargement de la semaine…" />
    @if (week.hasValue()) {
      @if (!week.value().length) {
        <cdls-empty-state
          title="Aucune séance cette semaine"
          description="Vacances, jour férié ou emploi du temps pas encore publié : essayez une autre semaine."
          icon="calendar"
        />
      } @else {
        <div class="tt-week">
          @for (column of columns(); track column.day) {
            <section class="card card--panel" [attr.aria-labelledby]="'jour-' + column.day">
              <h2 class="t-h3" [id]="'jour-' + column.day">{{ title(column.day) }}</h2>
              @if (column.items.length) {
                <ol class="tt-list" role="list">
                  @for (item of column.items; track item.key) {
                    <li class="tt-item">
                      <app-session-item [session]="item" [showTeacher]="false" [showClass]="true" />
                    </li>
                  }
                </ol>
              } @else {
                <p class="t-body-s t-muted">Pas de séance.</p>
              }
            </section>
          }
        </div>
      }
    }
  `,
  styles: `
    :host > p {
      margin: 0;
    }
    .tt-week {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    }
    .tt-list {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tt-item {
      display: grid;
      gap: var(--space-2);
    }
  `,
})
export class MyTimetablePage {
  readonly #api = inject(TimetableApi);
  readonly #auth = inject(AuthStore);

  protected readonly today = schoolToday();
  protected readonly day = signal(this.today);
  protected readonly label = computed(() => weekLabel(this.day()));

  protected readonly week = resource({
    params: () => {
      const teacherId = this.#auth.user()?.teacherId;
      return teacherId ? { ...weekWindow(this.day()), teacherId } : undefined;
    },
    loader: ({ params }) => this.#api.occurrences(params),
  });
  protected readonly columns = computed(() => byDayOfWeek(this.day(), this.week.hasValue() ? this.week.value() : []));

  protected move(weeks: number): void {
    this.day.update((d) => shiftWeek(d, weeks));
  }
  protected title(day: string): string {
    return dayTitle(day);
  }
}
