import { Component, computed, inject, linkedSignal, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { longDay, todayIso } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { Button, EmptyState, Icon, Tabs, type TabItem } from '../../../shared/ui';
import { currentYear, termOf } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';
import { GradesTable } from './grades-table';

/** The student's published grades and averages, one tab per term. */
@Component({
  selector: 'app-grades-page',
  imports: [RouterLink, Button, EmptyState, Icon, Tabs, LoadState, GradesTable],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Mes notes</h1>
        @if (year(); as y) {
          <p class="t-muted">Année {{ y.label }}</p>
        }
      </div>
      <div class="page__actions">
        <a cdlsButton variant="secondary" routerLink="../bulletins"><cdls-icon name="file-text" />Bulletins</a>
      </div>
    </div>

    <app-load-state [ref]="years" label="Chargement des trimestres…" />
    @if (tabs().length) {
      <cdls-tabs [tabs]="tabs()" label="Trimestres" [(value)]="periodId">
        <app-load-state [ref]="grades" label="Chargement des notes…" />
        @if (grades.hasValue()) {
          @if (hasGrades()) {
            <app-grades-table [data]="grades.value()" [caption]="'du ' + term()?.label" [today]="today" />
          } @else {
            <cdls-empty-state icon="file-text" [title]="'Pas encore de notes au ' + term()?.label" [description]="emptyText()" />
          }
        }
      </cdls-tabs>
    }
  `,
})
export class GradesPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  protected readonly today = todayIso();

  protected readonly years = resource({ loader: () => this.#api.school.years() });
  protected readonly year = computed(() => (this.years.hasValue() ? currentYear(this.years.value()) : null));
  readonly #terms = computed(() => [...(this.year()?.periods ?? [])].sort((a, b) => a.number - b.number));
  protected readonly tabs = computed<TabItem[]>(() => this.#terms().map((t) => ({ id: t.id, label: t.label })));
  /** The current term first; the student can switch. */
  protected readonly periodId = linkedSignal(() => termOf(this.#terms(), this.today)?.id ?? '');
  protected readonly term = computed(() => this.#terms().find((t) => t.id === this.periodId()) ?? null);

  protected readonly grades = resource({
    params: () => {
      const studentId = this.#auth.user()?.studentId;
      const periodId = this.periodId();
      return studentId && periodId ? { studentId, periodId } : undefined;
    },
    loader: ({ params }) => this.#api.grades.ofStudent(params.studentId, { periodId: params.periodId }),
  });

  protected readonly hasGrades = computed(
    () => this.grades.hasValue() && this.grades.value().subjects.some((s) => s.grades.length > 0),
  );
  protected readonly emptyText = computed(() => {
    const t = this.term();
    if (!t) return '';
    return t.startsOn > this.today
      ? `Le ${t.label} commence le ${longDay(t.startsOn)}. Vos notes apparaîtront ici dès leur publication.`
      : 'Vos notes apparaîtront ici dès que vos enseignants les publieront.';
  });
}
