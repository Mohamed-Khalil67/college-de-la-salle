import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, input, output, signal, untracked, viewChild } from '@angular/core';
import { disabled, form, FormField, hidden, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import {
  CALENDAR_DAY_LIMITS,
  CALENDAR_DAY_TYPE_LABELS,
  CALENDAR_DAY_TYPES,
  type CalendarDayType,
  type PeriodDto,
  type PeriodKind,
  type SchoolYearDto,
  type SectionDto,
} from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl } from '../../ui';
import { shownError } from '../shared/admin-format';
import { formatTypedDate, parseTypedDate, typedDateProblem } from '../shared/day-math';
import {
  defaultPeriodLabel,
  nextPeriodNumber,
  overlapHint,
  overlappingPeriods,
  PERIOD_KIND_LABEL,
  rangeProblem,
  type TimelineEntry,
} from './year-plan';

export type EntryType = PeriodKind | CalendarDayType;

const PERIOD_TYPES: readonly PeriodKind[] = ['trimester', 'semester'];
const PERIOD_LABEL_MAX = 40;

/** What the panel is asked to do: add something (of a preset type), or edit an entry of the timeline. */
export interface EntryDraft {
  readonly entry: TimelineEntry | null;
  readonly type: EntryType;
}

interface EntryModel {
  type: EntryType;
  label: string;
  sectionId: string;
  number: number | null;
  startsOn: string;
  endsOn: string;
}

function isPeriodType(type: EntryType): type is PeriodKind {
  return type === 'trimester' || type === 'semester';
}

/**
 * The form under the annual calendar: add or edit a period, a holiday, an exam week… Dates are typed
 * (JJ/MM/AAAA). The API's overlap error (409) is shown as it comes, with the period it collides with.
 */
@Component({
  selector: 'app-year-entry-panel',
  imports: [FormField, Alert, Button, Field, FieldControl],
  template: `
    <section #panel class="card card--panel panel" tabindex="-1" [attr.aria-labelledby]="headingId">
      <h3 class="t-h3" [id]="headingId" #heading tabindex="-1">{{ title() }}</h3>

      @if (locked()) {
        <cdls-alert tone="info">
          Cette période est clôturée : ses notes servent aux bulletins, elle ne peut plus être modifiée.
          @if (isAdmin()) {
            Rouvrez-la depuis la liste ci-dessous si vous devez la corriger.
          }
        </cdls-alert>
      }

      <form class="stack" novalidate (submit)="onSubmit($event)">
        <div class="panel__grid">
          <cdls-field label="Type">
            <select cdlsControl [formField]="entryForm.type" (change)="onTypeChange()">
              @for (option of typeOptions(); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field label="Nom" [error]="labelError()">
            <input cdlsControl autocomplete="off" [formField]="entryForm.label" />
          </cdls-field>
          <cdls-field label="Filière" helper="« Toute l’école » vaut pour les deux filières.">
            <select cdlsControl [formField]="entryForm.sectionId">
              <option value="">Toute l’école</option>
              @for (section of sections(); track section.id) {
                <option [value]="section.id">{{ section.label }}</option>
              }
            </select>
          </cdls-field>
          @if (isPeriod()) {
            <cdls-field label="Numéro" helper="De 1 à 4." [error]="numberError()">
              <input cdlsControl type="number" inputmode="numeric" step="1" [formField]="entryForm.number" />
            </cdls-field>
          }
          <cdls-field label="Début" helper="Format JJ/MM/AAAA, par exemple 12/09/2026." [error]="startError()">
            <input cdlsControl inputmode="numeric" autocomplete="off" placeholder="JJ/MM/AAAA" [formField]="entryForm.startsOn" />
          </cdls-field>
          <cdls-field
            label="Fin"
            [helper]="isPeriod() ? 'Format JJ/MM/AAAA.' : 'Format JJ/MM/AAAA. Laissez vide pour un seul jour.'"
            [error]="endError()"
          >
            <input cdlsControl inputmode="numeric" autocomplete="off" placeholder="JJ/MM/AAAA" [formField]="entryForm.endsOn" />
          </cdls-field>
        </div>

        @if (draft().entry?.classIds?.length) {
          <p class="t-body-s t-muted">Ce jour concerne seulement certaines classes : elles ne changent pas quand vous enregistrez.</p>
        }

        @if (failure()) {
          <cdls-alert tone="danger">
            {{ failure() }}
            @if (hint()) {
              <br />{{ hint() }}
            }
          </cdls-alert>
        }

        <div class="panel__footer">
          @if (draft().entry && !locked()) {
            <button cdlsButton variant="danger" type="button" (click)="remove.emit(draft().entry!)">Supprimer</button>
          }
          <span class="panel__spacer"></span>
          <button cdlsButton variant="secondary" type="button" (click)="closed.emit()">{{ locked() ? 'Fermer' : 'Annuler' }}</button>
          @if (!locked()) {
            <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : draft().entry ? 'Enregistrer' : 'Ajouter' }}</button>
          }
        </div>
      </form>
    </section>
  `,
  styles: `
    .panel {
      display: grid;
      gap: var(--space-4);
    }
    .panel__grid {
      display: grid;
      gap: var(--space-4);
    }
    @media (min-width: 48rem) {
      .panel__grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    .panel__footer {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
    }
    .panel__spacer {
      flex: 1;
    }
  `,
})
export class YearEntryPanel {
  readonly draft = input.required<EntryDraft>();
  readonly year = input.required<SchoolYearDto>();
  readonly sections = input.required<readonly SectionDto[]>();
  readonly isAdmin = input(false);
  /** Saved: the sentence to show in the page's confirmation. */
  readonly saved = output<string>();
  readonly closed = output<void>();
  readonly remove = output<TimelineEntry>();

  readonly #api = inject(ApiClient);
  readonly #injector = inject(Injector);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly headingId = `entry-panel-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly model = signal<EntryModel>({ type: 'trimester', label: '', sectionId: '', number: 1, startsOn: '', endsOn: '' });
  protected readonly isPeriod = computed(() => isPeriodType(this.model().type));
  protected readonly locked = computed(() => !!this.draft().entry?.locked);

  protected readonly entryForm = form(this.model, (p) => {
    disabled(p.type, () => this.locked());
    disabled(p.label, () => this.locked());
    disabled(p.sectionId, () => this.locked());
    disabled(p.number, () => this.locked());
    disabled(p.startsOn, () => this.locked());
    disabled(p.endsOn, () => this.locked());
    hidden(p.number, () => !isPeriodType(this.model().type));
    required(p.label, { message: 'Saisissez un nom, par exemple « Vacances de Noël ».' });
    maxLength(p.label, CALENDAR_DAY_LIMITS.label, { message: `Le nom compte ${CALENDAR_DAY_LIMITS.label} caractères au plus.` });
    validate(p.label, ({ value, valueOf }) =>
      isPeriodType(valueOf(p.type)) && value().trim().length > PERIOD_LABEL_MAX
        ? { kind: 'periodLabel', message: `Le nom d’une période compte ${PERIOD_LABEL_MAX} caractères au plus.` }
        : null,
    );
    min(p.number, 1, { message: 'Le numéro va de 1 à 4.' });
    max(p.number, 4, { message: 'Le numéro va de 1 à 4.' });
    validate(p.number, ({ value, valueOf }) =>
      isPeriodType(valueOf(p.type)) && value() === null ? { kind: 'number', message: 'Saisissez le numéro de la période, de 1 à 4.' } : null,
    );
    validate(p.startsOn, ({ value }) => {
      const message = typedDateProblem(value());
      return message ? { kind: 'date', message } : null;
    });
    validate(p.endsOn, ({ value, valueOf }) => {
      const period = isPeriodType(valueOf(p.type));
      if (!value().trim()) return period ? { kind: 'date', message: 'Saisissez la date de fin au format JJ/MM/AAAA.' } : null;
      const message = typedDateProblem(value());
      if (message) return { kind: 'date', message };
      const start = parseTypedDate(valueOf(p.startsOn));
      const end = parseTypedDate(value());
      const problem = start && end ? rangeProblem(start, end, this.year(), !period) : null;
      return problem ? { kind: 'range', message: problem } : null;
    });
  });
  protected readonly labelError = computed(() => shownError(this.entryForm.label()));
  protected readonly numberError = computed(() => shownError(this.entryForm.number()));
  protected readonly startError = computed(() => shownError(this.entryForm.startsOn()));
  protected readonly endError = computed(() => shownError(this.entryForm.endsOn()));

  protected readonly typeOptions = computed(() => {
    const entry = this.draft().entry;
    const periods = PERIOD_TYPES.map((value) => ({ value: value as EntryType, label: PERIOD_KIND_LABEL[value] }));
    const days = CALENDAR_DAY_TYPES.map((value) => ({ value: value as EntryType, label: CALENDAR_DAY_TYPE_LABELS[value] }));
    if (!entry) return [...periods, ...days];
    return entry.source === 'period' ? periods : days;
  });
  protected readonly title = computed(() => {
    const entry = this.draft().entry;
    if (!entry) return isPeriodType(this.draft().type) ? 'Ajouter une période' : 'Ajouter des vacances ou une date';
    return `${entry.source === 'period' ? 'Modifier la période' : 'Modifier'} : ${entry.label}`;
  });

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly hint = signal<string | null>(null);

  constructor() {
    effect(() => {
      const draft = this.draft();
      // Each time the form is pointed at something new, move focus to its title so keyboard and screen reader users land in it.
      afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.#injector });
      untracked(() => {
        this.failure.set(null);
        this.hint.set(null);
        const entry = draft.entry;
        const period = isPeriodType(draft.type);
        const number = period ? nextPeriodNumber(this.year().periods, draft.type as PeriodKind, null) : null;
        this.entryForm().reset({
          type: draft.type,
          label: entry?.label ?? (period ? defaultPeriodLabel(draft.type as PeriodKind, number ?? 1) : ''),
          sectionId: entry?.sectionId ?? '',
          number: entry ? this.#numberOf(entry) : number,
          startsOn: entry ? formatTypedDate(entry.startsOn) : '',
          endsOn: entry && (period || entry.endsOn !== entry.startsOn) ? formatTypedDate(entry.endsOn) : '',
        });
      });
    });
  }

  #numberOf(entry: TimelineEntry): number | null {
    return entry.source === 'period' ? (this.year().periods.find((p) => p.id === entry.id)?.number ?? null) : null;
  }

  /** Switching between kinds of period proposes the next free number and name for new periods. */
  protected onTypeChange(): void {
    const { type } = this.model();
    if (this.draft().entry || !isPeriodType(type)) return;
    const number = nextPeriodNumber(this.year().periods, type, this.model().sectionId || null);
    this.entryForm.number().value.set(number);
    this.entryForm.label().value.set(defaultPeriodLabel(type, number));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.entryForm, async () => {
      const value = this.model();
      const entry = this.draft().entry;
      const start = parseTypedDate(value.startsOn) ?? '';
      const end = parseTypedDate(value.endsOn) ?? start;
      const sectionId = value.sectionId || null;
      this.busy.set(true);
      this.failure.set(null);
      this.hint.set(null);
      try {
        if (isPeriodType(value.type)) {
          const body = { kind: value.type, sectionId, number: value.number ?? 1, label: value.label.trim(), startsOn: start, endsOn: end };
          if (entry) await this.#api.school.updatePeriod(entry.id, body);
          else await this.#api.school.createTerm(this.year().id, body);
        } else {
          const body = { type: value.type, label: value.label.trim(), startsOn: start, endsOn: end, sectionId };
          if (entry) await this.#api.school.updateCalendarDay(entry.id, body);
          else await this.#api.school.createCalendarDay({ ...body, schoolYearId: this.year().id });
        }
        this.saved.emit(`« ${value.label.trim()} » est ${entry ? 'enregistré' : 'ajouté'}.`);
      } catch (error) {
        this.failure.set(apiMessage(error));
        if (error instanceof HttpErrorResponse && error.status === 409 && isPeriodType(value.type)) {
          this.hint.set(this.#hintFor(value.type, sectionId, start, end, entry?.id));
        }
      } finally {
        this.busy.set(false);
      }
    });
  }

  #hintFor(kind: PeriodKind, sectionId: string | null, startsOn: string, endsOn: string, id: string | undefined): string | null {
    const periods: readonly PeriodDto[] = this.year().periods;
    return overlapHint(overlappingPeriods(periods, { id, kind, sectionId, startsOn, endsOn }));
  }
}
