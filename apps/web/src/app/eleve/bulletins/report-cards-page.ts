import { Component, DOCUMENT, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';
import { Alert, Button, EmptyState, Icon } from '../../ui';
import { saveFile } from '../shared/download';
import { longDate, plural } from '../shared/format';
import { attendanceCounts } from '../shared/grades';
import { LoadState } from '../shared/load-state';
import { fileName } from '../shared/week';
import { ReportCard } from './report-card';

/** Published term report cards: pick a term, read it, print it or download the PDF. */
@Component({
  selector: 'app-report-cards-page',
  imports: [Alert, Button, EmptyState, Icon, LoadState, ReportCard],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Bulletins</h1>
        <p class="t-muted">Publiés par l’administration à la fin de chaque trimestre.</p>
      </div>
      @if (selected()) {
        <div class="page__actions">
          @if (options().length > 1) {
            <div class="field field--inline">
              <label class="field__label" for="bulletin-term">Trimestre</label>
              <select class="field__control" id="bulletin-term" (change)="cardId.set($any($event.target).value)">
                @for (c of options(); track c.id) {
                  <option [value]="c.id" [selected]="c.id === cardId()">{{ c.label }}</option>
                }
              </select>
            </div>
          }
          <button cdlsButton variant="secondary" type="button" (click)="print()"><cdls-icon name="printer" />Imprimer</button>
          <button cdlsButton type="button" [attr.aria-busy]="downloading()" (click)="download()">
            <cdls-icon name="download" />{{ downloading() ? 'Préparation du PDF…' : 'Télécharger le PDF' }}
          </button>
        </div>
      }
    </div>

    @if (downloadError()) {
      <cdls-alert tone="danger">{{ downloadError() }}</cdls-alert>
    }

    <app-load-state [ref]="cards" label="Chargement des bulletins…" />
    @if (cards.hasValue()) {
      @if (selected(); as card) {
        <app-report-card
          [card]="card"
          [termLabel]="termLabel()"
          [yearLabel]="yearLabel()"
          [classLabel]="classLabel()"
          [schoolLife]="schoolLife()"
        />
      } @else {
        <cdls-empty-state icon="file-text" title="Aucun bulletin publié" description="Votre bulletin apparaîtra ici dès que l’administration l’aura publié, à la fin du trimestre." />
      }
    }
  `,
})
export class ReportCardsPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #document = inject(DOCUMENT);

  protected readonly cards = resource({
    params: () => this.#auth.user()?.studentId ?? undefined,
    loader: ({ params }) => this.#api.reportCards.ofStudent(params),
  });
  readonly #years = resource({ loader: () => this.#api.school.years() });
  readonly #classes = resource({ loader: () => this.#api.school.classes() });
  readonly #attendance = resource({
    params: () => this.#auth.user()?.studentId ?? undefined,
    loader: ({ params }) => this.#api.attendance.ofStudent(params),
  });

  readonly #terms = computed(() => (this.#years.hasValue() ? this.#years.value().flatMap((y) => y.periods.map((t) => ({ ...t, year: y.label }))) : []));
  readonly #list = computed(() => {
    const cards = this.cards.hasValue() ? this.cards.value() : [];
    const start = (periodId: string) => this.#terms().find((t) => t.id === periodId)?.startsOn ?? '';
    return [...cards].sort((a, b) => start(b.periodId).localeCompare(start(a.periodId)));
  });
  /** The latest report card first. */
  protected readonly cardId = linkedSignal(() => this.#list()[0]?.id ?? '');
  protected readonly selected = computed(() => this.#list().find((c) => c.id === this.cardId()) ?? null);
  readonly #term = computed(() => this.#terms().find((t) => t.id === this.selected()?.periodId) ?? null);

  protected readonly termLabel = computed(() => this.#term()?.label ?? 'trimestre');
  protected readonly yearLabel = computed(() => this.#term()?.year ?? '');
  protected readonly classLabel = computed(() => {
    const classes = this.#classes.hasValue() ? this.#classes.value() : [];
    const c = classes.find((x) => x.id === this.selected()?.classId);
    return c ? `${c.label}, ${plural(c.studentCount, 'élève')}` : '';
  });
  protected readonly options = computed(() =>
    this.#list().map((c) => {
      const term = this.#terms().find((t) => t.id === c.periodId);
      const published = c.publishedAt ? `, publié le ${longDate(c.publishedAt.slice(0, 10))}` : '';
      return { id: c.id, label: `${term?.label ?? 'Trimestre'}${published}` };
    }),
  );
  protected readonly schoolLife = computed(() => {
    const term = this.#term();
    if (!term || !this.#attendance.hasValue()) return 'Absences non disponibles.';
    const inTerm = this.#attendance.value().filter((a) => a.record.date >= term.startsOn && a.record.date <= term.endsOn);
    const counts = attendanceCounts(inTerm);
    const absences = counts.absent + counts.excused;
    if (!absences && !counts.late) return 'Aucune absence ni aucun retard.';
    const parts = [absences ? `${plural(absences, 'absence')}${counts.excused ? `, dont ${counts.excused} excusée${counts.excused > 1 ? 's' : ''}` : ''}` : '', counts.late ? plural(counts.late, 'retard') : ''];
    return `${parts.filter(Boolean).join('. ')}.`;
  });

  protected readonly downloading = signal(false);
  protected readonly downloadError = signal<string | null>(null);

  protected print(): void {
    this.#document.defaultView?.print();
  }

  protected async download(): Promise<void> {
    const card = this.selected();
    if (!card || this.downloading()) return;
    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      const pdf = await this.#api.reportCards.pdf(card.id);
      saveFile(this.#document, pdf, fileName(`bulletin ${this.termLabel()} ${card.studentName}`, 'pdf'));
    } catch (error) {
      this.downloadError.set(`Le PDF n’a pas pu être téléchargé. ${apiMessage(error)}`);
    } finally {
      this.downloading.set(false);
    }
  }
}
