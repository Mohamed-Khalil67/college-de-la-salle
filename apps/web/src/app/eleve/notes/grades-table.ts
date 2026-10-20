import { Component, computed, input } from '@angular/core';
import type { StudentGradeDto, StudentGradesDto } from '@cdls/shared';
import { Badge } from '../../ui';
import { average, mark, subjectName } from '../shared/format';
import { isRecent, overallAverage, subjectsByName } from '../shared/grades';

let nextId = 0;

/** One term of grades: the averages band and the table by subject (stacked rows on phones). */
@Component({
  selector: 'app-grades-table',
  imports: [Badge],
  template: `
    <div class="avg-summary avg-summary--band">
      <div class="stat">
        <span class="stat__value tabular">{{ format(overall()) }}</span>
        <span class="stat__label">Ma moyenne générale</span>
      </div>
      <p class="t-body-s t-muted avg-summary__note">
        Chaque moyenne est calculée sur 20 avec les coefficients des évaluations. La moyenne générale est la moyenne de
        vos matières ; le bulletin tient aussi compte du coefficient de chaque matière. Une note apparaît ici dès que
        l’enseignant la publie.
      </p>
    </div>

    <div class="table-wrap" role="region" [attr.aria-labelledby]="captionId" tabindex="0">
      <table class="table grades-table table--stack">
        <caption [id]="captionId">Notes {{ caption() }} par matière</caption>
        <thead>
          <tr>
            <th scope="col">Matière</th>
            <th scope="col">Évaluations</th>
            <th scope="col" class="num">Ma moyenne</th>
          </tr>
        </thead>
        <tbody>
          @for (subject of subjects(); track subject.subjectId) {
            <tr>
              <th scope="row">{{ name(subject.subjectId) }}</th>
              <td>
                <ul class="chips" role="list">
                  @for (g of subject.grades; track g.grade.id) {
                    <li>
                      {{ g.event.title }} <b>{{ score(g) }}</b>
                      @if (g.event.coefficient !== 1) {
                        <span class="t-muted">×{{ format2(g.event.coefficient) }}</span>
                      }
                      @if (recent(g)) {
                        <cdls-badge tone="success">Nouvelle</cdls-badge>
                      }
                    </li>
                  }
                </ul>
              </td>
              <td class="num" data-label="Ma moyenne"><b>{{ format(subject.average) }}</b></td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Moyenne générale</th>
            <td class="grades-table__empty"></td>
            <td class="num" data-label="Ma moyenne">{{ format(overall()) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `,
})
export class GradesTable {
  readonly data = input.required<StudentGradesDto>();
  /** « du 1er trimestre » */
  readonly caption = input('');
  readonly today = input.required<string>();

  protected readonly captionId = `notes-caption-${++nextId}`;
  protected readonly subjects = computed(() => subjectsByName(this.data()));
  protected readonly overall = computed(() => overallAverage(this.data().subjects));

  protected name(id: string): string {
    return subjectName(id) || 'Autre';
  }
  protected format(value: number | null): string {
    return average(value);
  }
  protected format2(value: number): string {
    return mark(value);
  }
  protected score(g: StudentGradeDto): string {
    return g.grade.outOf === 20 ? mark(g.grade.score) : `${mark(g.grade.score)}/${mark(g.grade.outOf)}`;
  }
  protected recent(g: StudentGradeDto): boolean {
    return isRecent(g.grade.updatedAt, this.today());
  }
}
