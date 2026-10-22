import { Component, computed, input, model, output } from '@angular/core';
import type { RolloverPreview } from '@cdls/shared';
import { Alert, Badge, Button } from '../../ui';
import { formatRange, plural } from '../shared/admin-format';
import type { Choices } from './rollover-logic';
import { StudentTable } from './student-table';

/** Step 3: the preview. Counts per step, what to check, the classes and every student with their decision. */
@Component({
  selector: 'app-review-step',
  imports: [Alert, Badge, Button, StudentTable],
  template: `
    <div class="stack">
      <p class="t-muted">
        Voici ce qui serait fait pour <strong>{{ preview().newYear.label }}</strong> ({{ range() }}). Rien n’est encore écrit.
        @if (preview().newYear.exists) {
          L’année existe déjà : seul ce qui manque serait créé.
        }
      </p>

      @if (stale()) {
        <cdls-alert tone="warning">
          Vos décisions ont changé depuis le dernier aperçu. <button cdlsButton variant="secondary" size="sm" type="button" [disabled]="busy()" (click)="refresh.emit()">{{ busy() ? 'Calcul…' : 'Recalculer l’aperçu' }}</button>
          Le passage à la confirmation le recalcule aussi.
        </cdls-alert>
      }

      @if (conflicts().length) {
        <section class="stack stack--sm" aria-labelledby="conflicts-title">
          <h3 class="t-h3" id="conflicts-title">Conflits d’emploi du temps ({{ conflicts().length }})</h3>
          <cdls-alert tone="danger">
            Ces séances ne seront pas copiées. Le passage continue sans elles : vous les placerez ensuite dans l’emploi du temps.
          </cdls-alert>
          <ul class="issues">
            @for (issue of conflicts(); track $index) {
              <li>{{ issue.message }}</li>
            }
          </ul>
        </section>
      }

      @if (warnings().length) {
        <section class="stack stack--sm" aria-labelledby="warnings-title">
          <h3 class="t-h3" id="warnings-title">À vérifier ({{ warnings().length }})</h3>
          <ul class="issues">
            @for (issue of warnings(); track $index) {
              <li>{{ issue.message }}</li>
            }
          </ul>
        </section>
      }

      <section class="stack stack--sm" aria-labelledby="steps-title">
        <h3 class="t-h2" id="steps-title">Ce qui sera créé</h3>
        <div class="table-wrap" role="region" aria-labelledby="steps-caption" tabindex="0">
          <table class="table table--stack">
            <caption id="steps-caption" class="visually-hidden">Éléments créés, déjà présents et laissés de côté, par étape</caption>
            <thead>
              <tr>
                <th scope="col">Étape</th>
                <th scope="col" class="num">Créés</th>
                <th scope="col" class="num">Déjà là</th>
                <th scope="col" class="num">Laissés de côté</th>
              </tr>
            </thead>
            <tbody>
              @for (step of preview().steps; track step.id) {
                <tr>
                  <th scope="row">{{ step.label }}</th>
                  <td class="num" data-label="Créés :">{{ step.create }}</td>
                  <td class="num" data-label="Déjà là :">{{ step.existing }}</td>
                  <td class="num" data-label="Laissés de côté :">{{ step.skipped }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (preview().archivesSourceYear) {
          <p class="t-body-s">
            L’année <strong>{{ preview().sourceYear.label }}</strong> sera archivée en lecture seule.
            @if (preview().makesNewYearCurrent) {
              L’année {{ preview().newYear.label }} deviendra l’année en cours.
            }
          </p>
        }
      </section>

      <section class="stack stack--sm" aria-labelledby="classes-title">
        <h3 class="t-h2" id="classes-title">Classes et passages</h3>
        <div class="table-wrap" role="region" aria-labelledby="classes-caption" tabindex="0">
          <table class="table table--stack">
            <caption id="classes-caption" class="visually-hidden">Classes de l’année source, classe suivante et nombre d’élèves</caption>
            <thead>
              <tr>
                <th scope="col">Classe</th>
                <th scope="col">Élèves promus vers</th>
                <th scope="col" class="num">Élèves</th>
                <th scope="col">Nouvelle année</th>
              </tr>
            </thead>
            <tbody>
              @for (c of preview().classes; track c.sourceClassId) {
                <tr>
                  <th scope="row">
                    <span class="d-block">{{ c.label }}</span>
                    <span class="cell-sub">{{ c.sectionCode === 'bac' ? 'Bac français' : 'Bac nationale' }}</span>
                  </th>
                  <td data-label="Promus vers :">
                    @if (c.nextLabel) {
                      {{ c.nextLabel }}
                    } @else {
                      <cdls-badge tone="heritage">Classe terminale : diplôme</cdls-badge>
                    }
                  </td>
                  <td class="num" data-label="Élèves :">{{ plural(c.studentCount, 'élève', 'élèves') }}</td>
                  <td data-label="Nouvelle année :">{{ c.action === 'create' ? 'Sera créée' : 'Existe déjà' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <app-student-table [students]="preview().students" [classes]="preview().classes" [sourceLabel]="preview().sourceYear.label" [(choices)]="choices" />
    </div>
  `,
  styles: `
    .issues {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding-left: var(--space-5);
      list-style: disc;
    }
  `,
})
export class ReviewStep {
  readonly preview = input.required<RolloverPreview>();
  readonly choices = model.required<Choices>();
  /** The decisions changed after the preview was computed. */
  readonly stale = input(false);
  readonly busy = input(false);
  readonly refresh = output<void>();

  protected readonly plural = plural;
  protected readonly conflicts = computed(() => this.preview().issues.filter((i) => i.level === 'conflict'));
  protected readonly warnings = computed(() => this.preview().issues.filter((i) => i.level === 'warning'));
  protected readonly range = computed(() => formatRange(this.preview().newYear.startsOn, this.preview().newYear.endsOn));
}
