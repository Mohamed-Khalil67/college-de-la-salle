import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import type { SchoolYearDto, TermDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { formatRange, shownError } from '../shared/admin-format';

interface TermModel {
  number: number | null;
  label: string;
  startsOn: string;
  endsOn: string;
}

/** Adds a term (1 to 4) inside a school year. */
@Component({
  selector: 'app-term-create-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal [title]="'Ajouter un trimestre à ' + (year()?.label ?? '')" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        @if (year(); as y) {
          <p class="t-muted">L’année va {{ range(y) }}.</p>
        }
        <cdls-field label="Numéro" helper="De 1 à 4." [error]="numberError()">
          <input cdlsControl type="number" step="1" [formField]="termForm.number" />
        </cdls-field>
        <cdls-field label="Nom" helper="Par exemple « 1er trimestre »." [error]="labelError()">
          <input cdlsControl autocomplete="off" [formField]="termForm.label" />
        </cdls-field>
        <cdls-field label="Début" [error]="startError()">
          <input cdlsControl type="date" [formField]="termForm.startsOn" />
        </cdls-field>
        <cdls-field label="Fin" [error]="endError()">
          <input cdlsControl type="date" [formField]="termForm.endsOn" />
        </cdls-field>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Ajout…' : 'Ajouter le trimestre' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class TermCreateModal {
  readonly open = model(false);
  readonly year = input<SchoolYearDto | null>(null);
  readonly created = output<TermDto>();

  readonly #api = inject(ApiClient);

  protected readonly model = signal<TermModel>({ number: 1, label: '', startsOn: '', endsOn: '' });
  protected readonly termForm = form(this.model, (p) => {
    required(p.number, { message: 'Saisissez le numéro du trimestre.' });
    min(p.number, 1, { message: 'Le numéro va de 1 à 4.' });
    max(p.number, 4, { message: 'Le numéro va de 1 à 4.' });
    required(p.label, { message: 'Saisissez le nom du trimestre.' });
    maxLength(p.label, 40, { message: 'Le nom compte 40 caractères au plus.' });
    required(p.startsOn, { message: 'Choisissez la date de début.' });
    required(p.endsOn, { message: 'Choisissez la date de fin.' });
    validate(p.startsOn, ({ value }) => this.#outsideYear(value()));
    validate(p.endsOn, ({ value, valueOf }) => {
      if (!value()) return null;
      const start = valueOf(p.startsOn);
      if (start && value() <= start) return { kind: 'order', message: 'La fin doit venir après le début.' };
      return this.#outsideYear(value());
    });
  });
  protected readonly numberError = computed(() => shownError(this.termForm.number()));
  protected readonly labelError = computed(() => shownError(this.termForm.label()));
  protected readonly startError = computed(() => shownError(this.termForm.startsOn()));
  protected readonly endError = computed(() => shownError(this.termForm.endsOn()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      const year = this.year();
      if (!this.open()) return;
      untracked(() => {
        const next = Math.min(4, (year?.terms.length ?? 0) + 1);
        this.failure.set(null);
        this.termForm().reset({ number: next, label: next === 1 ? '1er trimestre' : `${next}e trimestre`, startsOn: '', endsOn: '' });
      });
    });
  }

  #outsideYear(day: string): { kind: string; message: string } | null {
    const year = this.year();
    return year && day && (day < year.startsOn || day > year.endsOn)
      ? { kind: 'inYear', message: `Choisissez une date ${formatRange(year.startsOn, year.endsOn)}.` }
      : null;
  }

  protected range(year: SchoolYearDto): string {
    return formatRange(year.startsOn, year.endsOn);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const year = this.year();
    if (!year) return;
    void submit(this.termForm, async () => {
      const value = this.model();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const term = await this.#api.school.createTerm(year.id, {
          number: value.number ?? 1,
          label: value.label.trim(),
          startsOn: value.startsOn,
          endsOn: value.endsOn,
        });
        this.created.emit(term);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
