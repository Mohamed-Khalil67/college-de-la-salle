import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { schoolToday } from '@cdls/shared';
import { ApiClient } from '../../core/api/api-client';
import { Button, EmptyState, Icon } from '../../ui';
import { SessionItem } from '../../timetable/session-item';
import { TimetableApi } from '../../timetable/timetable-api';
import {
  byDayOfWeek,
  rangeOf,
  shortDate,
  timeBands,
  weekWindow,
} from '../../timetable/timetable-format';
import { LoadState } from '../shared/load-state';
import { dayTitle } from '../shared/format';
import { shiftWeek, weekLabel } from '../shared/week';

/**
 * The student's timetable: a list of days on phones, a read-only week table on larger screens. A
 * cancelled session is struck through and says so; a changed one writes « avant / maintenant ».
 */
@Component({
  selector: 'app-student-timetable-page',
  imports: [Button, EmptyState, Icon, LoadState, RouterLink, SessionItem],
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
        <a cdlsButton variant="tertiary" size="sm" routerLink="../agenda">Examens et devoirs</a>
      </div>
    </div>

    @if (groupsLine()) {
      <p class="t-body-s my-groups">{{ groupsLine() }}</p>
    }
    <app-load-state [ref]="week" label="Chargement de la semaine…" />
    @if (week.hasValue()) {
      @if (!week.value().length) {
        <cdls-empty-state
          title="Pas de cours cette semaine"
          description="Vacances, jour férié ou emploi du temps pas encore publié : revenez à une autre semaine."
          icon="calendar"
        />
      } @else {
        <div class="tt-days">
          @for (column of columns(); track column.day) {
            <section class="card card--panel" [attr.aria-labelledby]="'jour-' + column.day">
              <h2 class="t-h3" [id]="'jour-' + column.day">{{ title(column.day) }}</h2>
              @if (column.items.length) {
                <ol class="tt-list" role="list">
                  @for (item of column.items; track item.key) {
                    <li><app-session-item [session]="item" /></li>
                  }
                </ol>
              } @else {
                <p class="t-body-s t-muted">Pas de cours.</p>
              }
            </section>
          }
        </div>

        <div class="table-wrap tt-table" role="region" tabindex="0" aria-labelledby="tt-caption">
          <table class="table">
            <caption id="tt-caption">{{ label() }}</caption>
            <thead>
              <tr>
                <th scope="col">Horaire</th>
                @for (column of columns(); track column.day) {
                  <th scope="col">{{ short(column.day) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (band of bands(); track band.start + band.end) {
                <tr>
                  <th scope="row">{{ range(band) }}</th>
                  @for (column of columns(); track column.day) {
                    <td>
                      @for (item of cell(column.day, band.start, band.end); track item.key) {
                        <app-session-item [session]="item" />
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
  styles: `
    .my-groups {
      margin-bottom: var(--space-4);
    }
    .tt-days {
      display: grid;
      gap: var(--space-4);
    }
    .tt-list {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tt-table {
      display: none;
    }
    .tt-table td {
      vertical-align: top;
      min-width: 11rem;
    }
    .tt-table td app-session-item + app-session-item {
      margin-top: var(--space-2);
    }
    @media (min-width: 64rem) {
      .tt-days {
        display: none;
      }
      .tt-table {
        display: block;
      }
    }
  `,
})
export class StudentTimetablePage {
  readonly #api = inject(TimetableApi);
  readonly #groupsApi = inject(ApiClient);
  readonly #groups = resource({ loader: () => this.#groupsApi.groups.mine() });
  /** « Vos groupes : TP A (TP) » : why some sessions of the class are not in the list. */
  protected readonly groupsLine = computed(() => {
    const list = this.#groups.hasValue() ? this.#groups.value() : [];
    return list.length
      ? `Vos groupes : ${list.map((g) => `${g.label} (${g.division})`).join(', ')}. Vous voyez les séances de ces groupes et celles de toute la classe.`
      : '';
  });
  protected readonly today = schoolToday();
  protected readonly day = signal(this.today);
  protected readonly label = computed(() => weekLabel(this.day()));

  protected readonly week = resource({
    params: () => weekWindow(this.day()),
    loader: ({ params }) => this.#api.occurrences(params),
  });

  protected readonly columns = computed(() => byDayOfWeek(this.day(), this.week.hasValue() ? this.week.value() : []));
  protected readonly bands = computed(() => timeBands(this.week.hasValue() ? this.week.value() : []));

  protected move(weeks: number): void {
    this.day.update((d) => shiftWeek(d, weeks));
  }
  protected title(day: string): string {
    return dayTitle(day);
  }
  protected short(day: string): string {
    return shortDate(day);
  }
  protected range(band: { start: string; end: string }): string {
    return rangeOf({ startTime: band.start, endTime: band.end });
  }
  protected cell(day: string, start: string, end: string) {
    const all = this.columns().find((c) => c.day === day)?.items ?? [];
    return all.filter((o) => o.current.startTime === start && o.current.endTime === end);
  }
}
