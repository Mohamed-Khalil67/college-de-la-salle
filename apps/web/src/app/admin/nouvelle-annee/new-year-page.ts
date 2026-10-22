import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import {
  ROLLOVER_PREVIEW_STALE,
  type ApiError,
  type RolloverPreview,
  type RolloverResult,
  type SchoolYearDto,
} from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, EmptyState } from '../../ui';
import { isYearLabel } from '../shared/admin-format';
import { ConfirmModal } from '../shared/confirm-modal';
import { ConfirmStep } from './confirm-step';
import { OptionsStep } from './options-step';
import { ResultStep } from './result-step';
import { ReviewStep } from './review-step';
import {
  type Choices,
  consequences,
  countActions,
  fromOverrides,
  parseDraft,
  STEPS,
  type StepId,
  suggestNewYear,
  toRequest,
} from './rollover-logic';
import { SourceStep, type SourceValues } from './source-step';
import { YearStepper } from './year-stepper';

const STORAGE_KEY = 'cdls.rollover.draft';

/**
 * « Nouvelle année »: the rollover wizard. Five steps (year and dates, what is copied, the preview with every
 * student, the confirmation, the result). The draft is kept in the browser tab, so the secretariat can leave and
 * come back to the step where they stopped; the preview is always recomputed, never trusted from before.
 */
@Component({
  selector: 'app-new-year-page',
  imports: [Alert, Button, EmptyState, ConfirmModal, ConfirmStep, OptionsStep, ResultStep, ReviewStep, SourceStep, YearStepper],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Nouvelle année</h1>
        <p class="t-muted">Préparez l’année suivante à partir de l’année en cours : classes, matières, calendrier, emploi du temps et passage des élèves.</p>
      </div>
    </div>

    @if (years.error()) {
      <cdls-alert tone="danger">{{ errorText(years.error()) }}</cdls-alert>
    } @else if (!years.hasValue()) {
      <p class="loading-line" role="status">Chargement des années…</p>
    } @else if (!years.value().length) {
      <cdls-empty-state icon="calendar" title="Aucune année scolaire" description="Créez d’abord une année scolaire avec ses classes : le passage part de là." />
    } @else {
      <app-year-stepper [current]="step()" [reached]="reached()" [locked]="busy() || step() === 'result'" (go)="goTo($event)" />

      <p class="visually-hidden" role="status">{{ busyText() }}</p>

      <section class="step" aria-labelledby="step-heading">
        <h2 class="t-h2" id="step-heading" tabindex="-1">{{ stepTitle() }}</h2>

        @if (error()) {
          <cdls-alert tone="danger">{{ error() }}</cdls-alert>
        }

        @switch (step()) {
          @case ('source') {
            <app-source-step [years]="years.value()" [(values)]="source" />
          }
          @case ('copy') {
            <app-options-step [(copyAssignments)]="copyAssignments" [(copyTimetable)]="copyTimetable" />
          }
          @case ('review') {
            @if (preview(); as p) {
              <app-review-step [preview]="p" [(choices)]="choices" [stale]="stale()" [busy]="busy()" (refresh)="runPreview()" />
            }
          }
          @case ('confirm') {
            @if (preview(); as p) {
              <app-confirm-step [preview]="p" [counts]="counts()" [busy]="busy()" (launch)="confirmOpen.set(true)" />
            }
          }
          @case ('result') {
            @if (result(); as r) {
              <app-result-step [result]="r" />
            }
          }
        }

        @if (step() !== 'result') {
          <div class="nav">
            @if (step() !== 'source') {
              <button cdlsButton variant="secondary" type="button" [disabled]="busy()" (click)="back()">Retour</button>
            }
            @if (step() !== 'confirm') {
              <button cdlsButton type="button" [disabled]="busy()" (click)="next()">{{ nextLabel() }}</button>
            }
          </div>
        }
      </section>
    }

    <app-confirm-modal
      title="Lancer le passage à la nouvelle année ?"
      confirmLabel="Lancer le passage"
      [danger]="true"
      [busy]="busy()"
      [error]="applyError()"
      [(open)]="confirmOpen"
      (confirmed)="apply()"
    >
      @if (preview(); as p) {
        <p>
          L’année <strong>{{ p.newYear.label }}</strong> est créée avec ses classes, ses matières et son calendrier, et les élèves sont inscrits dans leur
          nouvelle classe.
        </p>
        <ul class="consequences">
          <li>
            <strong>L’année {{ p.sourceYear.label }} est archivée</strong> : en lecture seule, plus aucune note, aucun événement, aucun appel ni aucune
            modification de l’emploi du temps.
          </li>
          @if (p.makesNewYearCurrent) {
            <li>{{ p.newYear.label }} devient l’année en cours pour tout le collège.</li>
          }
          @for (line of lines(); track line) {
            <li>{{ line }}</li>
          }
        </ul>
        <p class="t-body-s t-muted">Le passage se fait en une seule fois. Ce que vous créez n’est pas annulable d’un clic ; relancer ne crée rien en double.</p>
      }
    </app-confirm-modal>
  `,
  styles: `
    .step {
      display: grid;
      gap: var(--space-6);
      align-content: start;
    }
    .step > h2 {
      margin: 0;
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-line);
    }
    .consequences {
      display: grid;
      gap: var(--space-2);
      margin: 0 0 var(--space-4);
      padding-left: var(--space-5);
      list-style: disc;
    }
  `,
})
export class NewYearPage {
  readonly #api = inject(ApiClient);
  readonly #document = inject(DOCUMENT);

  protected readonly years = resource({ loader: () => this.#api.school.years() });

  protected readonly step = signal<StepId>('source');
  protected readonly reachedIndex = signal(0);
  protected readonly reached = computed(() => this.reachedIndex() + 1);

  protected readonly source = signal<SourceValues>({ sourceYearId: '', label: '', startsOn: '', endsOn: '' });
  protected readonly copyAssignments = signal(true);
  protected readonly copyTimetable = signal(true);
  protected readonly choices = signal<Choices>(new Map());

  protected readonly preview = signal<RolloverPreview | null>(null);
  /** The request the preview was computed for: when it differs from the current one, the preview is out of date. */
  readonly #previewKey = signal('');
  protected readonly result = signal<RolloverResult | null>(null);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly applyError = signal<string | null>(null);
  protected readonly confirmOpen = signal(false);

  protected readonly stepTitle = computed(() => STEPS.find((s) => s.id === this.step())?.label ?? '');
  protected readonly nextLabel = computed(() => {
    switch (this.step()) {
      case 'source':
        return 'Choisir ce qui est copié';
      case 'copy':
        return 'Voir l’aperçu';
      default:
        return 'Passer à la confirmation';
    }
  });
  protected readonly busyText = computed(() => (this.busy() ? 'Calcul en cours, un instant…' : ''));

  readonly #request = computed(() => toRequest({ ...this.source(), copyAssignments: this.copyAssignments(), copyTimetable: this.copyTimetable() }, this.choices()));
  protected readonly stale = computed(() => !!this.preview() && JSON.stringify(this.#request()) !== this.#previewKey());
  protected readonly counts = computed(() => {
    const p = this.preview();
    return countActions(p?.students ?? [], this.choices());
  });
  protected readonly lines = computed(() => consequences(this.counts()));

  constructor() {
    // Starting point: the saved draft of this tab, or the current year and its next year.
    effect(() => {
      if (!this.years.hasValue() || this.source().sourceYearId) return;
      const list = this.years.value();
      if (!list.length) return;
      untracked(() => this.#startFrom(list));
    });
    // The draft follows the secretariat's work.
    effect(() => {
      const source = this.source();
      if (!source.sourceYearId) return;
      const draft = {
        ...source,
        copyAssignments: this.copyAssignments(),
        copyTimetable: this.copyTimetable(),
        step: this.step(),
        choices: [...this.choices()],
      };
      save(this.step() === 'result' ? null : JSON.stringify(draft));
    });
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les années. Réessayez dans un instant.');
  }

  #startFrom(years: readonly SchoolYearDto[]): void {
    const saved = parseDraft(load());
    if (saved && years.some((y) => y.id === saved.sourceYearId)) {
      this.source.set({ sourceYearId: saved.sourceYearId, label: saved.label, startsOn: saved.startsOn, endsOn: saved.endsOn });
      this.copyAssignments.set(saved.copyAssignments);
      this.copyTimetable.set(saved.copyTimetable);
      this.choices.set(fromOverrides(saved.choices.map(([studentId, action]) => ({ studentId, action }))));
      this.step.set(saved.step);
      this.reachedIndex.set(STEPS.findIndex((s) => s.id === saved.step));
      // The preview is recomputed, never restored.
      if (saved.step === 'review') void this.runPreview(true);
      return;
    }
    const from = years.find((y) => y.status === 'current') ?? years[0]!;
    this.source.set({ sourceYearId: from.id, ...suggestNewYear(from) });
  }

  protected goTo(step: StepId): void {
    const target = STEPS.findIndex((s) => s.id === step);
    if (target > this.reachedIndex() || this.busy()) return;
    this.#move(step);
  }

  protected back(): void {
    const index = STEPS.findIndex((s) => s.id === this.step());
    if (index > 0) this.#move(STEPS[index - 1]!.id);
  }

  protected async next(): Promise<void> {
    this.error.set(null);
    switch (this.step()) {
      case 'source': {
        const problem = this.#sourceProblem();
        if (problem) {
          this.error.set(problem);
          return;
        }
        this.#move('copy');
        return;
      }
      case 'copy':
        if (await this.runPreview()) this.#move('review');
        return;
      case 'review':
        // Decisions changed since the last preview: the confirmation needs the hash of the current ones.
        if (this.stale() && !(await this.runPreview())) return;
        this.#move('confirm');
        return;
    }
  }

  #sourceProblem(): string | null {
    const s = this.source();
    if (!isYearLabel(s.label.trim())) return 'Écrivez le nom de la nouvelle année avec deux années qui se suivent, par exemple 2027-2028.';
    if (!s.startsOn || !s.endsOn) return 'Choisissez la rentrée et la fin de l’année.';
    if (s.endsOn <= s.startsOn) return 'La fin de l’année doit venir après la rentrée.';
    return null;
  }

  #move(step: StepId): void {
    this.error.set(null);
    this.step.set(step);
    this.reachedIndex.update((r) => Math.max(r, STEPS.findIndex((s) => s.id === step)));
    // The heading of the new step takes focus: a screen reader announces where it is, the keyboard starts there.
    setTimeout(() => this.#document.getElementById('step-heading')?.focus(), 0);
  }

  /** Asks the API for the preview of the current request; true when it worked. */
  protected async runPreview(quiet = false): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    const request = this.#request();
    try {
      this.preview.set(await this.#api.rollover.preview(request));
      this.#previewKey.set(JSON.stringify(request));
      return true;
    } catch (error) {
      this.error.set(apiMessage(error, 'L’aperçu n’a pas pu être calculé. Réessayez dans un instant.'));
      if (quiet) this.step.set('source');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async apply(): Promise<void> {
    const p = this.preview();
    if (!p || this.busy()) return;
    this.busy.set(true);
    this.applyError.set(null);
    try {
      const result = await this.#api.rollover.apply({ ...this.#request(), planHash: p.planHash });
      this.result.set(result);
      this.confirmOpen.set(false);
      save(null);
      this.#move('result');
    } catch (error) {
      const code = ((error as { error?: ApiError & { code?: string } } | undefined)?.error)?.code;
      if (code === ROLLOVER_PREVIEW_STALE) {
        // The data moved since the preview: nothing was written; show the new preview to check again.
        this.confirmOpen.set(false);
        this.#move('review');
        this.busy.set(false);
        await this.runPreview();
        this.error.set('Les données ont changé depuis l’aperçu : rien n’a été fait. Vérifiez l’aperçu mis à jour, puis confirmez de nouveau.');
        return;
      }
      this.applyError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

function load(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage can be blocked: the wizard simply is not resumable */
  }
}
