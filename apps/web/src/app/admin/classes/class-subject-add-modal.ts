import { Component, computed, effect, inject, input, model, output, resource, signal, untracked } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import type { ClassSubjectDto, SectionId } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { shownError } from '../shared/admin-format';
import { COEFFICIENT_RULE, decimalProblem, HOURS_RULE, parseDecimal } from './class-subject-values';

interface AddModel {
  subjectId: string;
  coefficient: string;
  hours: string;
}

/** Adds a subject of the catalogue to a class, with its coefficient and hours per week. */
@Component({
  selector: 'app-class-subject-add-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal title="Ajouter une matière à la classe" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        @if (subjects.error()) {
          <cdls-alert tone="danger">{{ errorText() }}</cdls-alert>
        } @else if (!subjects.hasValue()) {
          <p class="loading-line" role="status">Chargement des matières…</p>
        } @else {
          <cdls-field
            label="Matière"
            [helper]="available().length ? '' : 'Toutes les matières de cette filière sont déjà dans la classe.'"
            [error]="subjectError()"
          >
            <select cdlsControl [formField]="addForm.subjectId">
              <option value="">Choisir une matière</option>
              @for (subject of available(); track subject.id) {
                <option [value]="subject.id">{{ subject.name }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field label="Coefficient" helper="Poids de la matière dans la moyenne générale, par exemple 2 ou 1,5." [error]="coefficientError()">
            <input cdlsControl inputmode="decimal" autocomplete="off" [formField]="addForm.coefficient" />
          </cdls-field>
          <cdls-field label="Heures par semaine" helper="Facultatif." [error]="hoursError()">
            <input cdlsControl inputmode="decimal" autocomplete="off" [formField]="addForm.hours" />
          </cdls-field>
        }
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy() || !subjects.hasValue()">{{ busy() ? 'Ajout…' : 'Ajouter la matière' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class ClassSubjectAddModal {
  readonly open = model(false);
  readonly classId = input.required<string>();
  readonly sectionCode = input<SectionId | null>(null);
  /** Subjects the class already has. */
  readonly existing = input<readonly ClassSubjectDto[]>([]);
  readonly added = output<ClassSubjectDto>();

  readonly #api = inject(ApiClient);

  protected readonly subjects = resource({
    params: () => (this.open() ? true : undefined),
    loader: () => this.#api.school.subjects(),
  });
  protected readonly available = computed(() => {
    const have = new Set(this.existing().map((row) => row.subjectId));
    const section = this.sectionCode();
    return (this.subjects.hasValue() ? this.subjects.value() : []).filter(
      (s) => !s.archived && !have.has(s.id) && (!section || s.sections.includes(section)),
    );
  });

  protected readonly model = signal<AddModel>({ subjectId: '', coefficient: '1', hours: '' });
  protected readonly addForm = form(this.model, (p) => {
    required(p.subjectId, { message: 'Choisissez la matière à ajouter.' });
    validate(p.coefficient, ({ value }) => {
      const message = decimalProblem(value(), COEFFICIENT_RULE);
      return message ? { kind: 'coefficient', message } : null;
    });
    validate(p.hours, ({ value }) => {
      const message = decimalProblem(value(), HOURS_RULE);
      return message ? { kind: 'hours', message } : null;
    });
  });
  protected readonly subjectError = computed(() => shownError(this.addForm.subjectId()));
  protected readonly coefficientError = computed(() => shownError(this.addForm.coefficient()));
  protected readonly hoursError = computed(() => shownError(this.addForm.hours()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.failure.set(null);
        this.addForm().reset({ subjectId: '', coefficient: '1', hours: '' });
      });
    });
  }

  protected errorText(): string {
    return apiMessage(this.subjects.error(), 'Impossible de charger les matières. Réessayez dans un instant.');
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.addForm, async () => {
      const value = this.model();
      this.busy.set(true);
      this.failure.set(null);
      try {
        const row = await this.#api.school.addClassSubject(this.classId(), {
          subjectId: value.subjectId,
          coefficient: parseDecimal(value.coefficient) ?? 1,
          hoursPerWeek: value.hours.trim() ? parseDecimal(value.hours) : null,
        });
        this.added.emit(row);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
