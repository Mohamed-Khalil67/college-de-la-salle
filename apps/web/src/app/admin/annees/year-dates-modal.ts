import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import type { SchoolYearDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { shownError } from '../shared/admin-format';
import { formatTypedDate, parseTypedDate, typedDateProblem } from '../shared/day-math';

/** The first step of the school year: its start and end dates, typed as JJ/MM/AAAA. */
@Component({
  selector: 'app-year-dates-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal [title]="'Dates de l’année ' + (year()?.label ?? '')" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <cdls-field label="Début" helper="Format JJ/MM/AAAA, par exemple 01/09/2026." [error]="startError()">
          <input cdlsControl inputmode="numeric" autocomplete="off" placeholder="JJ/MM/AAAA" [formField]="datesForm.startsOn" />
        </cdls-field>
        <cdls-field label="Fin" helper="Format JJ/MM/AAAA, par exemple 30/06/2027." [error]="endError()">
          <input cdlsControl inputmode="numeric" autocomplete="off" placeholder="JJ/MM/AAAA" [formField]="datesForm.endsOn" />
        </cdls-field>
        <p class="t-body-s t-muted">Les périodes, vacances et examens déjà saisis doivent rester dans ces dates.</p>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : 'Enregistrer les dates' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class YearDatesModal {
  readonly open = model(false);
  readonly year = input<SchoolYearDto | null>(null);
  readonly saved = output<SchoolYearDto>();

  readonly #api = inject(ApiClient);

  protected readonly model = signal({ startsOn: '', endsOn: '' });
  protected readonly datesForm = form(this.model, (p) => {
    validate(p.startsOn, ({ value }) => {
      const message = typedDateProblem(value());
      return message ? { kind: 'date', message } : null;
    });
    validate(p.endsOn, ({ value, valueOf }) => {
      const message = typedDateProblem(value());
      if (message) return { kind: 'date', message };
      const start = parseTypedDate(valueOf(p.startsOn));
      const end = parseTypedDate(value());
      return start && end && end <= start ? { kind: 'order', message: 'La fin doit suivre le début.' } : null;
    });
  });
  protected readonly startError = computed(() => shownError(this.datesForm.startsOn()));
  protected readonly endError = computed(() => shownError(this.datesForm.endsOn()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      const year = this.year();
      if (!this.open()) return;
      untracked(() => {
        this.failure.set(null);
        this.datesForm().reset({ startsOn: year ? formatTypedDate(year.startsOn) : '', endsOn: year ? formatTypedDate(year.endsOn) : '' });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const year = this.year();
    if (!year) return;
    void submit(this.datesForm, async () => {
      const value = this.model();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const saved = await this.#api.school.updateYear(year.id, {
          startsOn: parseTypedDate(value.startsOn) ?? year.startsOn,
          endsOn: parseTypedDate(value.endsOn) ?? year.endsOn,
        });
        this.saved.emit(saved);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
