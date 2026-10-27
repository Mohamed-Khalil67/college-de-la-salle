import { Component, DOCUMENT, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import type { ReportCardDto, PeriodDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Badge, Button, EmptyState, Field, FieldControl, Icon } from '../../../shared/ui';
import { ConfirmModal } from '../../../shared/components/confirm-modal';
import { formatAverage, groupBySection, plural } from '../shared/admin-format';
import { saveFile } from '../../../shared/utils/download';
import { AppreciationEditor } from './appreciation-editor';

interface ClassCards {
  readonly classId: string;
  readonly label: string;
  readonly cards: readonly ReportCardDto[];
}

/** Term report cards: generate from published grades, review, add appreciations, publish, download PDFs. */
@Component({
  selector: 'app-report-cards-page',
  imports: [FormField, Alert, Badge, Button, EmptyState, Field, FieldControl, Icon, ConfirmModal, AppreciationEditor],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Bulletins</h1>
        <p class="t-muted">Calculés à partir des notes publiées d’un trimestre clôturé.</p>
      </div>
      <div class="page__actions">
        <button cdlsButton variant="secondary" type="button" [disabled]="!periodId()" (click)="startBatch('generate')">Générer les bulletins</button>
        <button cdlsButton type="button" [disabled]="!periodId()" (click)="startBatch('publish')">Publier les bulletins</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    @if (years.error()) {
      <cdls-alert tone="danger">{{ errorText(years.error()) }}</cdls-alert>
    } @else if (years.hasValue()) {
      @if (closedTerms().length) {
        <form class="filters filters--two" aria-label="Choisir le trimestre et la classe" (submit)="$event.preventDefault()">
          <cdls-field label="Trimestre clôturé">
            <select cdlsControl [formField]="pickForm.periodId">
              @for (group of closedTerms(); track group.year) {
                <optgroup [label]="group.year">
                  @for (term of group.periods; track term.id) {
                    <option [value]="term.id">{{ term.label }} {{ group.year }}</option>
                  }
                </optgroup>
              }
            </select>
          </cdls-field>
          <cdls-field label="Classe" helper="Facultatif : sans classe, toutes les classes de l’année.">
            <select cdlsControl [formField]="pickForm.classId">
              <option value="">Toutes les classes</option>
              @for (group of classGroups(); track group.code) {
                <optgroup [label]="group.label">
                  @for (item of group.items; track item.id) {
                    <option [value]="item.id">{{ item.label }}</option>
                  }
                </optgroup>
              }
            </select>
          </cdls-field>
        </form>

        @if (cards.error()) {
          <cdls-alert tone="danger">{{ errorText(cards.error()) }}</cdls-alert>
        } @else if (cards.hasValue()) {
          @if (byClass().length) {
            <p class="t-body-s t-muted summary" role="status">{{ summary() }}</p>
            @if (pdfError()) {
              <cdls-alert tone="danger">{{ pdfError() }}</cdls-alert>
            }
            <div class="stack classes">
              @for (group of byClass(); track group.classId) {
                <section class="stack stack--sm" [attr.aria-labelledby]="'class-' + group.classId">
                  <h2 class="t-h2" [id]="'class-' + group.classId">{{ group.label }}</h2>
                  <div class="table-wrap" role="region" [attr.aria-labelledby]="'caption-' + group.classId" tabindex="0">
                    <table class="table table--stack">
                      <caption class="visually-hidden" [id]="'caption-' + group.classId">
                        Bulletins de {{ group.label }}, par rang
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Élève</th>
                          <th scope="col" class="num">Rang</th>
                          <th scope="col" class="num">Moyenne</th>
                          <th scope="col">Statut</th>
                          <th scope="col">Appréciation</th>
                          <th scope="col" class="num"><span class="visually-hidden">Bulletin PDF</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (card of group.cards; track card.id) {
                          <tr>
                            <th scope="row">{{ card.studentName }}</th>
                            <td class="num" data-label="Rang :">{{ card.rank ?? '—' }}</td>
                            <td class="num" data-label="Moyenne :">{{ average(card.average) }}</td>
                            <td data-label="Statut :">
                              @if (card.publishedAt) {
                                <cdls-badge tone="success">Publié</cdls-badge>
                              } @else {
                                <cdls-badge tone="warning">Brouillon</cdls-badge>
                              }
                            </td>
                            <td class="appreciation"><app-appreciation-editor [card]="card" /></td>
                            <td class="num">
                              <button cdlsButton variant="tertiary" size="sm" type="button" [disabled]="pdfBusy() === card.id" (click)="downloadPdf(card)">
                                <cdls-icon name="download" />PDF<span class="visually-hidden"> du bulletin de {{ card.studentName }}</span>
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
              }
            </div>
          } @else {
            <cdls-empty-state
              icon="file-text"
              title="Aucun bulletin pour ce choix"
              description="Générez les bulletins du trimestre : ils restent en brouillon jusqu’à leur publication."
            >
              <button cdlsButton variant="secondary" type="button" (click)="startBatch('generate')">Générer les bulletins</button>
            </cdls-empty-state>
          }
        } @else {
          <p class="loading-line" role="status">Chargement des bulletins…</p>
        }
      } @else {
        <cdls-empty-state
          icon="calendar"
          title="Aucun trimestre clôturé"
          description="Les bulletins se calculent sur un trimestre clôturé. Clôturez-le dans « Année scolaire »."
        />
      }
    } @else {
      <p class="loading-line" role="status">Chargement des trimestres…</p>
    }

    <app-confirm-modal
      [title]="batch() === 'generate' ? 'Générer les bulletins ?' : 'Publier les bulletins ?'"
      [confirmLabel]="batch() === 'generate' ? 'Générer' : 'Publier'"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="batchOpen"
      (confirmed)="runBatch()"
    >
      @if (batch() === 'generate') {
        <p>
          Les bulletins sont calculés à partir des notes publiées pour : <strong>{{ scopeLabel() }}</strong>. Les brouillons
          existants sont recalculés et gardent leur appréciation. Les bulletins déjà publiés ne changent pas.
        </p>
      } @else {
        <p>
          Les bulletins en brouillon deviennent visibles par les élèves, qui pourront télécharger leur PDF. Concerné :
          <strong>{{ scopeLabel() }}</strong>. Une fois publiés, leurs appréciations ne sont plus modifiables.
        </p>
      }
    </app-confirm-modal>
  `,
  styles: `
    .filters--two {
      grid-template-columns: repeat(auto-fit, minmax(14rem, 22rem));
    }
    .summary {
      margin-bottom: var(--space-4);
    }
    .classes {
      gap: var(--space-12);
    }
    .appreciation {
      min-width: 16rem;
    }
  `,
})
export class ReportCardsPage {
  readonly #api = inject(ApiClient);
  readonly #document = inject(DOCUMENT);

  protected readonly years = resource({ loader: () => this.#api.school.years() });
  /** Closed terms, newest year first, grouped by year. */
  protected readonly closedTerms = computed(() => {
    if (!this.years.hasValue()) return [];
    return this.years
      .value()
      .map((year) => ({ year: year.label, yearId: year.id, periods: year.periods.filter((t) => t.closedAt) }))
      .filter((group) => group.periods.length);
  });
  readonly #termsById = computed(() => {
    const map = new Map<string, PeriodDto>();
    for (const group of this.closedTerms()) for (const term of group.periods) map.set(term.id, term);
    return map;
  });

  /** Defaults to the latest closed term; the class resets when the term changes year. */
  protected readonly pick = linkedSignal<string | undefined, { periodId: string; classId: string }>({
    source: () => this.closedTerms()[0]?.periods.at(-1)?.id,
    computation: (latest, previous) => {
      const kept = previous?.value.periodId;
      return kept && this.#termsById().has(kept) ? previous.value : { periodId: latest ?? '', classId: '' };
    },
  });
  protected readonly pickForm = form(this.pick);
  protected readonly periodId = computed(() => this.pick().periodId);
  protected readonly classId = computed(() => this.pick().classId);
  readonly #yearId = computed(() => this.#termsById().get(this.periodId())?.schoolYearId);

  protected readonly classes = resource({
    params: () => this.#yearId(),
    loader: ({ params }) => this.#api.school.classes({ schoolYearId: params }),
  });
  protected readonly classGroups = computed(() => (this.classes.hasValue() ? groupBySection(this.classes.value()) : []));
  readonly #classLabels = computed(() => new Map((this.classes.hasValue() ? this.classes.value() : []).map((c) => [c.id, c.label])));

  protected readonly cards = resource({
    params: () => (this.periodId() ? { periodId: this.periodId(), classId: this.classId() } : undefined),
    loader: ({ params }) => this.#api.reportCards.ofTerm(params.periodId, params.classId ? { classId: params.classId } : {}),
  });
  protected readonly byClass = computed<ClassCards[]>(() => {
    if (!this.cards.hasValue()) return [];
    const groups = new Map<string, ReportCardDto[]>();
    for (const card of this.cards.value()) groups.set(card.classId, [...(groups.get(card.classId) ?? []), card]);
    const labels = this.#classLabels();
    return [...groups]
      .map(([classId, cards]) => ({ classId, label: labels.get(classId) ?? 'Classe', cards }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  });
  protected readonly summary = computed(() => {
    if (!this.cards.hasValue()) return '';
    const list = this.cards.value();
    const published = list.filter((c) => c.publishedAt).length;
    return `${plural(list.length, 'bulletin', 'bulletins')}, dont ${published} publié${published > 1 ? 's' : ''}.`;
  });
  protected readonly scopeLabel = computed(() => {
    const term = this.#termsById().get(this.periodId());
    const year = this.closedTerms().find((g) => g.yearId === term?.schoolYearId)?.year ?? '';
    const classLabel = this.classId() ? this.#classLabels().get(this.classId()) : null;
    return `${term?.label ?? ''} ${year}${classLabel ? `, classe ${classLabel}` : ', toutes les classes'}`;
  });

  protected readonly batch = signal<'generate' | 'publish'>('generate');
  protected readonly batchOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pdfBusy = signal<string | null>(null);
  protected readonly pdfError = signal<string | null>(null);

  protected average(value: number | null): string {
    return formatAverage(value);
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les bulletins. Réessayez dans un instant.');
  }

  protected startBatch(kind: 'generate' | 'publish'): void {
    this.batch.set(kind);
    this.actionError.set(null);
    this.batchOpen.set(true);
  }

  protected async runBatch(): Promise<void> {
    const periodId = this.periodId();
    if (!periodId) return;
    const body = this.classId() ? { classId: this.classId() } : {};
    const kind = this.batch();
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const { count } =
        kind === 'generate' ? await this.#api.reportCards.generate(periodId, body) : await this.#api.reportCards.publish(periodId, body);
      this.batchOpen.set(false);
      this.notice.set(
        kind === 'generate'
          ? `${plural(count, 'bulletin généré', 'bulletins générés')} en brouillon : ${this.scopeLabel()}.`
          : `${plural(count, 'bulletin publié', 'bulletins publiés')} : ${this.scopeLabel()}.`,
      );
      this.cards.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async downloadPdf(card: ReportCardDto): Promise<void> {
    this.pdfBusy.set(card.id);
    this.pdfError.set(null);
    try {
      const blob = await this.#api.reportCards.pdf(card.id);
      const slug = card.studentName.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase();
      saveFile(this.#document, blob, `bulletin-${slug}.pdf`);
    } catch (error) {
      this.pdfError.set(apiMessage(error, 'Le PDF n’a pas pu être téléchargé. Réessayez dans un instant.'));
    } finally {
      this.pdfBusy.set(null);
    }
  }
}
