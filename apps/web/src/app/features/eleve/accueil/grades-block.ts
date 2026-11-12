import { Component, computed, inject, resource } from '@angular/core';
import type { ReportCardDto, StudentGradeDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { SchoolYears } from '../../../shared/data/school-years';
import { Badge } from '../../../shared/ui';
import { blockState, bothOf, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { average, mark, subjectName } from '../../../shared/utils/format';
import { isRecent } from '../shared/grades';
import { gradesView } from './home-views';

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
      (retry)="reload()"
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
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #years = inject(SchoolYears);
  protected readonly today = inject(SchoolClock).today;
  readonly #term = this.#years.term;

  readonly #grades = resource({
    params: () => {
      const studentId = this.#auth.user()?.studentId;
      // Without the terms (still loading), wait; if they failed, fall back to the whole year.
      if (!studentId || !this.#years.settled()) return undefined;
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
    // The block waits until they have settled (a value or an error), so it never flashes its empty state.
    const settled: Snapshot<readonly ReportCardDto[]> = cards.error ? { error: undefined, value: [] } : cards;
    return blockState(bothOf(snapshotOf(this.#grades), settled), ([data, published]) =>
      gradesView(data, published, this.#term()?.id ?? null),
    );
  });

  protected reload(): void {
    if (this.#years.years.error()) this.#years.reload();
    this.#grades.reload();
    this.#reportCards.reload();
  }

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
