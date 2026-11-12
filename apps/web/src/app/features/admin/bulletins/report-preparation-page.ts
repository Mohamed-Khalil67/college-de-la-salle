import { Component, computed, effect, inject, linkedSignal, resource, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import type { PeriodDto, ReportPreparationClassDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { LoadState } from '../../../shared/components/load-state';
import { SchoolYears } from '../../../shared/data/school-years';
import { Alert, Badge, Button, EmptyState, Field, FieldControl } from '../../../shared/ui';
import { plural } from '../../../shared/utils/format';
import { canRemind, gapDetail, reminderMessage, teachersText } from './preparation-logic';

/**
 * « Préparer les bulletins »: per class, which subjects are not ready for the term's report cards, who teaches
 * them, and « Relancer », which puts a reminder in those teachers' « Notes à finir ». Generating, reviewing and
 * publishing the cards stay on the Bulletins page.
 */
@Component({
  selector: 'app-report-preparation-page',
  imports: [FormField, Alert, Badge, Button, EmptyState, Field, FieldControl, LoadState, RouterLink],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Préparer les bulletins</h1>
        <p class="t-muted">Voyez, classe par classe, ce qu’il reste à saisir ou à publier, puis relancez les enseignants concernés.</p>
      </div>
      <div class="page__actions">
        <a cdlsButton variant="secondary" routerLink="/admin/bulletins">Générer et publier les bulletins</a>
        <button cdlsButton type="button" [disabled]="!canRemindAll() || busyScope() !== null" (click)="remind(null)">
          {{ busyScope() === 'all' ? 'Envoi…' : 'Relancer tous les enseignants en retard' }}
        </button>
      </div>
    </div>

    @if (years.error()) {
      <cdls-alert tone="danger">Impossible de charger les trimestres. Réessayez dans un instant.</cdls-alert>
    } @else if (terms().length) {
      <form class="filters" aria-label="Choisir le trimestre" (submit)="$event.preventDefault()">
        <cdls-field label="Trimestre">
          <select cdlsControl [formField]="pickForm.periodId">
            @for (term of terms(); track term.id) {
              <option [value]="term.id">{{ term.label }}{{ term.closedAt ? ' (clôturé)' : '' }}</option>
            }
          </select>
        </cdls-field>
      </form>
    } @else if (years.hasValue()) {
      <cdls-empty-state icon="calendar" title="Aucun trimestre" description="Créez les trimestres de l’année depuis « Année scolaire »." />
    }

    <p class="t-body-s t-muted" role="status">{{ notice() }}</p>
    @if (failure()) {
      <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
    }

    <app-load-state [ref]="preparation" label="Chargement des notes du trimestre…" />
    @if (preparation.hasValue()) {
      @let prep = preparation.value();
      @if (prep) {
        <p class="t-body-s t-muted">
          {{ prep.readySubjectCount }} sur {{ prep.subjectCount }} matières prêtes, {{ prep.completeClassCount }} sur
          {{ prep.classCount }} {{ prep.classCount > 1 ? 'classes complètes' : 'classe complète' }}.
          @if (prep.period.closedAt) {
            Ce trimestre est clôturé : on ne peut plus relancer, passez aux bulletins.
          }
        </p>
        @if (prep.classes.length) {
          <div class="table-wrap" role="region" aria-labelledby="prep-caption" tabindex="0">
            <table class="table table--stack">
              <caption class="visually-hidden" id="prep-caption">
                Préparation des bulletins du {{ prep.period.label }}, par classe
              </caption>
              <thead>
                <tr>
                  <th scope="col">Classe</th>
                  <th scope="col">État</th>
                  <th scope="col">Ce qu’il reste à faire</th>
                  <th scope="col"><span class="visually-hidden">Relancer</span></th>
                </tr>
              </thead>
              <tbody>
                @for (c of prep.classes; track c.classId) {
                  <tr>
                    <th scope="row">
                      {{ c.label }}
                      <span class="t-body-s t-muted prep__sub">{{ plural(c.studentCount, 'élève') }}</span>
                    </th>
                    <td data-label="État :">
                      @if (c.complete) {
                        <cdls-badge tone="success">Complète</cdls-badge>
                        @if (c.cardsGenerated) {
                          <span class="t-body-s t-muted prep__sub">
                            {{ c.cardsPublished }} sur {{ c.cardsGenerated }} bulletins publiés
                          </span>
                        }
                      } @else if (!c.subjectCount) {
                        <cdls-badge tone="neutral">Sans matière</cdls-badge>
                      } @else {
                        <cdls-badge tone="warning">{{ plural(c.gaps.length, 'matière') }} à finir</cdls-badge>
                      }
                    </td>
                    <td data-label="Reste à faire :">
                      @if (c.gaps.length) {
                        <details class="prep__details" [open]="c.gaps.length <= 3">
                          <summary>Détail, matière par matière</summary>
                          <ul class="prep__gaps" role="list">
                            @for (g of c.gaps; track g.subjectId) {
                              <li>
                                <strong>{{ g.subjectName }}</strong>
                                <span class="t-body-s t-muted">{{ teacher(g) }}, {{ detail(g) }}</span>
                              </li>
                            }
                          </ul>
                        </details>
                      } @else if (!c.subjectCount) {
                        Ajoutez des matières à cette classe depuis « Classes et inscriptions ».
                      } @else {
                        Rien : tout est saisi et publié.
                      }
                    </td>
                    <td class="num">
                      @if (relaunchable(c, prep.period)) {
                        <button cdlsButton variant="secondary" size="sm" type="button" [disabled]="busyScope() !== null" (click)="remind(c.classId)">
                          {{ busyScope() === c.classId ? 'Envoi…' : 'Relancer' }}<span class="visually-hidden"> les enseignants de {{ c.label }}</span>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <cdls-empty-state icon="users" title="Aucune classe" description="Ce trimestre ne concerne aucune classe pour l’instant." />
        }
      }
    }
  `,
  styles: `
    .prep__sub {
      display: block;
    }
    .prep__details summary {
      cursor: pointer;
      min-height: 1.5rem;
      color: var(--color-heading);
      font-weight: 600;
    }
    .prep__gaps {
      display: grid;
      gap: var(--space-2);
      margin: var(--space-3) 0 0;
      padding: 0;
      list-style: none;
    }
    .prep__gaps li {
      display: grid;
    }
  `,
})
export class ReportPreparationPage {
  readonly #api = inject(ApiClient);
  protected readonly years = inject(SchoolYears).years;
  readonly #schoolYears = inject(SchoolYears);

  /** The terms of the current year; the term of today is chosen first. */
  protected readonly terms = computed<readonly PeriodDto[]>(() => this.#schoolYears.year()?.periods ?? []);
  readonly #model = linkedSignal(() => ({ periodId: this.#schoolYears.term()?.id ?? '' }));
  protected readonly pickForm = form(this.#model);
  protected readonly periodId = computed(() => this.#model().periodId);

  protected readonly preparation = resource({
    params: () => this.periodId() || undefined,
    loader: ({ params }) => this.#api.reportCards.preparation(params),
  });

  protected readonly busyScope = signal<string | null>(null);
  protected readonly notice = signal('');
  protected readonly failure = signal<string | null>(null);

  constructor() {
    // The sentence about a reminder belongs to the term it was sent for.
    effect(() => {
      this.periodId();
      untracked(() => {
        this.notice.set('');
        this.failure.set(null);
      });
    });
  }

  protected readonly plural = plural;
  protected readonly detail = gapDetail;
  protected readonly teacher = teachersText;

  protected readonly canRemindAll = computed(() => {
    const prep = this.preparation.hasValue() ? this.preparation.value() : null;
    return prep ? canRemind(prep.classes, prep.period.closedAt !== null) : false;
  });

  protected relaunchable(c: ReportPreparationClassDto, period: PeriodDto): boolean {
    return canRemind([c], period.closedAt !== null);
  }

  /** « Relancer » for one class, or (null) for every class of the term. */
  protected async remind(classId: string | null): Promise<void> {
    const periodId = this.periodId();
    if (!periodId || this.busyScope() !== null) return;
    this.busyScope.set(classId ?? 'all');
    this.failure.set(null);
    this.notice.set('');
    try {
      const result = await this.#api.reportCards.remind(periodId, classId ? { classId } : {});
      this.notice.set(reminderMessage(result));
    } catch (error) {
      this.failure.set(`Les enseignants n’ont pas été relancés. ${apiMessage(error)}`);
    } finally {
      this.busyScope.set(null);
    }
  }
}
