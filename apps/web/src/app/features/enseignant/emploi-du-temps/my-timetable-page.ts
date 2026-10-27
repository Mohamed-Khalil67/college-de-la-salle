import { Component, computed, inject, resource, signal } from '@angular/core';
import { schoolToday, type TimetableOccurrenceDto, type TimetableWriteResult } from '@cdls/shared';
import { apiMessage } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { Alert, Button, EmptyState, Icon } from '../../../shared/ui';
import { LoadState } from '../../../shared/components/load-state';
import { dayTitle } from '../../../shared/utils/format';
import { shiftWeek, weekLabel } from '../../../shared/utils/week';
import { SessionDialog } from '../../timetable/session-dialog';
import { SessionItem } from '../../timetable/session-item';
import { TimetableApi } from '../../timetable/timetable-api';
import { byDayOfWeek, sessionSummary, weekWindow } from '../../timetable/timetable-format';

/**
 * « Mon emploi du temps »: the teacher's week, with the three-scope dialog to cancel, move or change the
 * room of one of their sessions (free rooms are suggested), and a way to restore a changed session.
 */
@Component({
  selector: 'app-my-timetable-page',
  imports: [Alert, Button, EmptyState, Icon, LoadState, SessionDialog, SessionItem],
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

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }
    @if (failure()) {
      <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
    }

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
                      @if (item.canChange) {
                        <div class="tt-item__actions">
                          <button
                            cdlsButton
                            variant="secondary"
                            size="sm"
                            type="button"
                            [attr.aria-label]="'Modifier la séance : ' + summary(item)"
                            (click)="edit(item)"
                          >
                            Modifier…
                          </button>
                          @if (item.exceptionId) {
                            <button
                              cdlsButton
                              variant="tertiary"
                              size="sm"
                              type="button"
                              [disabled]="restoring() === item.exceptionId"
                              [attr.aria-label]="'Rétablir la séance : ' + summary(item)"
                              (click)="restore(item)"
                            >
                              Rétablir
                            </button>
                          }
                        </div>
                      }
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

    <app-session-dialog [(open)]="dialogOpen" [session]="selected()" [staff]="false" (saved)="saved($event)" />
  `,
  styles: `
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
    .tt-item__actions {
      display: flex;
      flex-wrap: wrap;
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

  protected readonly selected = signal<TimetableOccurrenceDto | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly notice = signal('');
  protected readonly failure = signal<string | null>(null);
  protected readonly restoring = signal<string | null>(null);

  protected move(weeks: number): void {
    this.day.update((d) => shiftWeek(d, weeks));
  }
  protected title(day: string): string {
    return dayTitle(day);
  }
  protected summary(item: TimetableOccurrenceDto): string {
    return sessionSummary(item, true);
  }

  protected edit(item: TimetableOccurrenceDto): void {
    this.notice.set('');
    this.failure.set(null);
    this.selected.set(item);
    this.dialogOpen.set(true);
  }

  protected saved(result: TimetableWriteResult): void {
    this.notice.set(
      result.exception ? 'La séance a été modifiée : les élèves voient le changement.' : 'Modification enregistrée.',
    );
    this.week.reload();
  }

  protected async restore(item: TimetableOccurrenceDto): Promise<void> {
    if (!item.exceptionId) return;
    this.restoring.set(item.exceptionId);
    this.notice.set('');
    this.failure.set(null);
    try {
      await this.#api.removeException(item.exceptionId);
      this.notice.set('La séance est rétablie comme prévu dans l’emploi du temps.');
      this.week.reload();
    } catch (error) {
      this.failure.set(apiMessage(error));
    } finally {
      this.restoring.set(null);
    }
  }
}
