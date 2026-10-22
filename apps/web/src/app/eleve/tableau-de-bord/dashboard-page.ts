import { Component, computed, inject, resource } from '@angular/core';
import { todayIso } from '@cdls/shared';
import { ApiClient } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { currentYear, dayTitle, termOf } from '../shared/format';
import { AbsencesPanel } from './absences-panel';
import { AveragesPanel } from './averages-panel';
import { HomeworkPanel } from './homework-panel';
import { LatestGradesPanel } from './latest-grades-panel';
import { PostsPanel } from './posts-panel';
import { TodayPanel } from './today-panel';

/** The student's home: today, homework due, latest grades, averages, absences and announcements. */
@Component({
  selector: 'app-dashboard-page',
  imports: [AbsencesPanel, AveragesPanel, HomeworkPanel, LatestGradesPanel, PostsPanel, TodayPanel],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Bonjour {{ firstName() }}</h1>
        <p class="t-muted">{{ subtitle() }}</p>
      </div>
    </div>

    <div class="grid-3">
      <app-today-panel [today]="today" [now]="now" />
      <app-homework-panel [today]="today" />
      <app-latest-grades-panel [grades]="grades" [today]="today" />
      <app-averages-panel [grades]="grades" [termLabel]="term()?.label ?? ''" />
      <div class="stack">
        @if (studentId(); as id) {
          <app-absences-panel [studentId]="id" />
        }
        <app-posts-panel />
      </div>
    </div>
  `,
  styles: `
    .panel {
      display: grid;
    }
  `,
})
export class DashboardPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);

  protected readonly today = todayIso();
  protected readonly now = new Date().toTimeString().slice(0, 5);
  protected readonly firstName = computed(() => this.#auth.user()?.firstName ?? '');
  protected readonly studentId = computed(() => this.#auth.user()?.studentId ?? null);

  readonly #years = resource({ loader: () => this.#api.school.years() });
  protected readonly term = computed(() => {
    const year = this.#years.hasValue() ? currentYear(this.#years.value()) : null;
    return year ? termOf(year.periods, this.today) : null;
  });
  protected readonly subtitle = computed(() => {
    const term = this.term();
    return term ? `${dayTitle(this.today)}, ${term.label}` : dayTitle(this.today);
  });

  /** Shared by the latest grades and the averages panels (current term). */
  protected readonly grades = resource({
    params: () => {
      const studentId = this.studentId();
      // Without the terms (still loading, or failed), wait; then fall back to the whole year.
      if (!studentId || this.#years.isLoading()) return undefined;
      return { studentId, periodId: this.term()?.id };
    },
    loader: ({ params }) => this.#api.grades.ofStudent(params.studentId, { periodId: params.periodId }),
  });
}
