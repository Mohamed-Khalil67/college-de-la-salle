import { Component, computed, input } from '@angular/core';
import type { Resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StudentGradeDto, StudentGradesDto } from '@cdls/shared';
import { Badge } from '../../../shared/ui';
import { mark, subjectName } from '../../../shared/utils/format';
import { isRecent, latestGrades } from '../shared/grades';
import { LoadState } from '../../../shared/components/load-state';

/** The three latest published grades. */
@Component({
  selector: 'app-latest-grades-panel',
  imports: [RouterLink, Badge, LoadState],
  host: { class: 'panel' },
  template: `
    <section class="card card--panel" aria-labelledby="last-title">
      <div class="card__header">
        <h2 id="last-title" class="t-h3">Dernières notes</h2>
        <a class="t-body-s" routerLink="notes">Toutes mes notes</a>
      </div>
      <app-load-state [ref]="grades()" label="Chargement des notes…" />
      @if (grades().hasValue()) {
        @if (latest().length) {
          <ul class="list" role="list">
            @for (g of latest(); track g.grade.id) {
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
        } @else {
          <p class="t-muted">Vos notes apparaîtront ici dès leur publication.</p>
        }
      }
    </section>
  `,
})
export class LatestGradesPanel {
  readonly grades = input.required<Resource<StudentGradesDto | undefined>>();
  readonly today = input.required<string>();

  protected readonly latest = computed(() => {
    const data = this.grades().hasValue() ? this.grades().value() : undefined;
    return data ? latestGrades(data, 3) : [];
  });

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
