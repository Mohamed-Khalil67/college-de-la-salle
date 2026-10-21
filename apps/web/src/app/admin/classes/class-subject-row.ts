import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { form, FormField, validate } from '@angular/forms/signals';
import type { ClassSubjectDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Button } from '../../ui';
import { shownError } from '../shared/admin-format';
import { COEFFICIENT_RULE, decimalProblem, formatDecimal, HOURS_RULE, parseDecimal } from './class-subject-values';

interface RowModel {
  coefficient: string;
  hours: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * One subject of a class, edited in place: coefficient and hours per week are saved when the field is left
 * or Enter is pressed. A status next to the row says what happened (saving, saved, what to fix).
 */
@Component({
  selector: 'tr[appClassSubjectRow]',
  imports: [FormField, Button],
  template: `
    <th scope="row">{{ row().subjectName }}</th>
    <td class="teachers" data-label="Enseignants :">{{ teachers() }}</td>
    <td class="num" data-label="Coefficient :">
      <input
        class="field__control cell-input"
        inputmode="decimal"
        autocomplete="off"
        [attr.aria-label]="'Coefficient de ' + row().subjectName"
        [attr.aria-invalid]="coefficientError() ? 'true' : null"
        [attr.aria-describedby]="statusId"
        [formField]="rowForm.coefficient"
        (keydown.enter)="save()"
        (blur)="save()"
      />
    </td>
    <td class="num" data-label="Heures par semaine :">
      <input
        class="field__control cell-input"
        inputmode="decimal"
        autocomplete="off"
        [attr.aria-label]="'Heures par semaine de ' + row().subjectName"
        [attr.aria-invalid]="hoursError() ? 'true' : null"
        [attr.aria-describedby]="statusId"
        [formField]="rowForm.hours"
        (keydown.enter)="save()"
        (blur)="save()"
      />
    </td>
    <td class="status" data-label="État :">
      <span [id]="statusId" role="status" [class.status--error]="state() === 'failed' || !!fieldError()">{{ statusText() }}</span>
    </td>
    <td class="num">
      <button cdlsButton variant="tertiary" size="sm" type="button" (click)="remove.emit(row())">
        Retirer<span class="visually-hidden"> {{ row().subjectName }} de la classe</span>
      </button>
    </td>
  `,
  styles: `
    .cell-input {
      width: 5.5rem;
      min-height: 2.5rem;
      padding-block: var(--space-2);
      text-align: right;
    }
    .status {
      min-width: 11rem;
      font-size: var(--text-body-s);
      color: var(--color-muted);
    }
    .status--error {
      color: var(--color-danger);
    }
    @media (max-width: 40rem) {
      /* Stacked row: a label and its box on one line, and no empty « État : » line when there is nothing to say. */
      td.num[data-label] {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
      }
      .cell-input {
        width: 4.5rem;
      }
      .status {
        min-width: 0;
      }
      .status:has(> span:empty)::before {
        content: none !important;
      }
    }
  `,
})
export class ClassSubjectRow {
  readonly row = input.required<ClassSubjectDto>();
  /** The row as saved by the API. */
  readonly changed = output<ClassSubjectDto>();
  readonly remove = output<ClassSubjectDto>();

  readonly #api = inject(ApiClient);

  protected readonly statusId = `row-status-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly model = signal<RowModel>({ coefficient: '', hours: '' });
  protected readonly rowForm = form(this.model, (p) => {
    validate(p.coefficient, ({ value }) => {
      const message = decimalProblem(value(), COEFFICIENT_RULE);
      return message ? { kind: 'coefficient', message } : null;
    });
    validate(p.hours, ({ value }) => {
      const message = decimalProblem(value(), HOURS_RULE);
      return message ? { kind: 'hours', message } : null;
    });
  });
  protected readonly coefficientError = computed(() => shownError(this.rowForm.coefficient()));
  protected readonly hoursError = computed(() => shownError(this.rowForm.hours()));
  protected readonly fieldError = computed(() => this.coefficientError() ?? this.hoursError());

  protected readonly state = signal<SaveState>('idle');
  protected readonly failure = signal<string | null>(null);

  protected readonly teachers = computed(() => this.row().teachers.map((t) => t.teacherName).join(', ') || 'Aucun enseignant');
  protected readonly dirty = computed(() => {
    const row = this.row();
    const value = this.model();
    return value.coefficient.trim() !== formatDecimal(row.coefficient) || value.hours.trim() !== formatDecimal(row.hoursPerWeek);
  });
  protected readonly statusText = computed(() => {
    if (this.state() === 'saving') return 'Enregistrement…';
    if (this.state() === 'failed') return this.failure() ?? 'L’enregistrement a échoué.';
    if (this.fieldError()) return this.fieldError() ?? '';
    if (this.dirty()) return 'Modifié, pas encore enregistré.';
    return this.state() === 'saved' ? 'Enregistré.' : '';
  });

  constructor() {
    effect(() => {
      const row = this.row();
      untracked(() => this.rowForm().reset({ coefficient: formatDecimal(row.coefficient), hours: formatDecimal(row.hoursPerWeek) }));
    });
    effect(() => {
      if (this.dirty() && this.state() === 'saved') untracked(() => this.state.set('idle'));
    });
  }

  protected async save(): Promise<void> {
    if (this.state() === 'saving' || !this.dirty()) return;
    const value = this.model();
    this.rowForm.coefficient().markAsTouched();
    this.rowForm.hours().markAsTouched();
    if (decimalProblem(value.coefficient, COEFFICIENT_RULE) || decimalProblem(value.hours, HOURS_RULE)) return;
    this.state.set('saving');
    this.failure.set(null);
    try {
      const saved = await this.#api.school.updateClassSubject(this.row().id, {
        coefficient: parseDecimal(value.coefficient) ?? 1,
        hoursPerWeek: value.hours.trim() ? parseDecimal(value.hours) : null,
      });
      this.state.set('saved');
      this.changed.emit(saved);
    } catch (error) {
      this.failure.set(apiMessage(error));
      this.state.set('failed');
    }
  }
}
