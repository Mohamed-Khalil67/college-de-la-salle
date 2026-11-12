import { Component, computed, inject, input, resource } from '@angular/core';
import type { ReportCardDto, StudentGradeDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { HomeBlock, snapshotOf } from '../../../shared/components/home-block';
import { Badge } from '../../../shared/ui';
import { blockState } from '../../../shared/utils/block-state';
import { average, mark, subjectName } from '../../../shared/utils/format';
import { isRecent } from '../shared/grades';
import { currentTerm, gradesView } from './home-views';

/**
 * « Notes »: the overall average of the current term, the three latest published grades and, once the
 * term's report card is published, « Bulletin publié ».
 */
@Component({
  selector: 'app-grades-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Notes"
      headingId="bloc-notes"
      [state]="s"
      link="notes"
      linkLabel="Toutes les notes et le bulletin"
      loadingLabel="Chargement des notes…"
      [emptyText]="emptyText()"
    >
      @if (s.status === 'ready') {
        <div class="stat">
          <span class="stat__value tabular" [class.stat__value--muted]="s.data.overall === null">{{ format(s.data.overall) }}</span>
          <span class="stat__label">Moyenne générale {{ termPhrase() }}</span>
        </div>
        @if (s.data.reportCardPublished) {
          <p class="grades__card"><cdls-badge tone="success">Bulletin publié</cdls-badge></p>
        }
        @if (s.data.latest.length) {
          <ul class="list" role="list" aria-label="Dernières notes">
            @for (g of s.data.latest; track g.grade.id) {
              <li>
                <div class="list__main">
                  <p>
                    {{ subject(g) }}
                    @if (recent(g)) {
                      <cdls-badge tone="success">Nouvelle</cdls-badge>
                    }
                  </p>
                  <p class="list__meta">{{ g.event.title }}</p>
                </div>
                <p class="grade-figure tabular">{{ score(g) }}<span>/{{ outOf(g) }}</span></p>
              </li>
            }
          </ul>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .grades__card {
      margin: 0;
    }
  `,
})
export class GradesBlock {
  /** Today in Cairo, `YYYY-MM-DD`. */
  readonly today = input.required<string>();

  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #years = resource({ loader: () => this.#api.school.years() });
  readonly #term = computed(() => (this.#years.hasValue() ? currentTerm(this.#years.value(), this.today()) : null));

  readonly #grades = resource({
    params: () => {
      const studentId = this.#auth.user()?.studentId;
      // Without the terms (still loading or failed), wait; then fall back to the whole year.
      if (!studentId || this.#years.isLoading()) return undefined;
      return { studentId, periodId: this.#term()?.id };
    },
    loader: ({ params }) => this.#api.grades.ofStudent(params.studentId, { periodId: params.periodId }),
  });
  readonly #reportCards = resource({
    params: () => this.#auth.user()?.studentId ?? undefined,
    loader: ({ params }) => this.#api.reportCards.ofStudent(params),
  });

  protected readonly state = computed(() => {
    const cards = snapshotOf(this.#reportCards);
    // The « Bulletin publié » line is a bonus: if the report cards cannot be read, the grades still show.
    const published: readonly ReportCardDto[] = cards.error ? [] : (cards.value ?? []);
    return blockState(snapshotOf(this.#grades), (data) => gradesView(data, published, this.#term()?.id ?? null));
  });

  protected readonly termPhrase = computed(() => {
    const term = this.#term();
    return term ? `du ${term.label}` : 'de l’année';
  });
  protected readonly emptyText = computed(
    () => `Pas encore de note publiée ${this.termPhrase()}. Elles arriveront ici dès que vos enseignants les publieront.`,
  );

  protected format(value: number | null): string {
    return average(value);
  }
  protected subject(g: StudentGradeDto): string {
    return subjectName(g.event.subjectId) || g.event.title;
  }
  protected score(g: StudentGradeDto): string {
    return mark(g.grade.score);
  }
  protected outOf(g: StudentGradeDto): string {
    return mark(g.grade.outOf);
  }
  protected recent(g: StudentGradeDto): boolean {
    return isRecent(g.grade.updatedAt, this.today());
  }
}
