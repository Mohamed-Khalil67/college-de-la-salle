import { Component, computed, effect, inject, input, model, output, resource, signal, untracked } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import type { ClassDto, ClassSubjectDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { classOptionLabel, shownError } from '../shared/admin-format';

export interface CopyResult {
  readonly from: ClassDto;
  readonly rows: readonly ClassSubjectDto[];
}

/** « Copier depuis la classe… »: takes the subjects, coefficients and hours of another class of the same year. */
@Component({
  selector: 'app-class-subject-copy-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal title="Copier les matières d’une autre classe" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        @if (classes.error()) {
          <cdls-alert tone="danger">{{ loadError() }}</cdls-alert>
        } @else if (!classes.hasValue()) {
          <p class="loading-line" role="status">Chargement des classes…</p>
        } @else {
          <cdls-field label="Copier depuis" [error]="sourceError()" [helper]="others().length ? '' : 'Il n’y a pas d’autre classe cette année.'">
            <select cdlsControl [formField]="copyForm.fromClassId">
              <option value="">Choisir une classe</option>
              @for (item of others(); track item.id) {
                <option [value]="item.id">{{ label(item) }}</option>
              }
            </select>
          </cdls-field>
          <cdls-alert tone="info">
            Les matières qui manquent à la classe sont ajoutées. Pour celles qu’elle a déjà, le coefficient et les heures
            deviennent ceux de la classe copiée. Les enseignants ne sont pas copiés.
          </cdls-alert>
        }
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy() || !classes.hasValue()">{{ busy() ? 'Copie…' : 'Copier les matières' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class ClassSubjectCopyModal {
  readonly open = model(false);
  readonly classId = input.required<string>();
  readonly schoolYearId = input<string | null>(null);
  readonly copied = output<CopyResult>();

  readonly #api = inject(ApiClient);

  protected readonly classes = resource({
    // The classes of the class's own school year (a year being prepared is not the current one).
    params: () => (this.open() ? { schoolYearId: this.schoolYearId() ?? undefined } : undefined),
    loader: ({ params }) => this.#api.school.classes(params),
  });
  protected readonly others = computed(() =>
    (this.classes.hasValue() ? this.classes.value() : []).filter(
      (c) => c.id !== this.classId() && (!this.schoolYearId() || c.schoolYearId === this.schoolYearId()),
    ),
  );

  protected readonly model = signal({ fromClassId: '' });
  protected readonly copyForm = form(this.model, (p) => {
    required(p.fromClassId, { message: 'Choisissez la classe à copier.' });
  });
  protected readonly sourceError = computed(() => shownError(this.copyForm.fromClassId()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.failure.set(null);
        this.copyForm().reset({ fromClassId: '' });
      });
    });
  }

  protected label(item: ClassDto): string {
    return classOptionLabel(item);
  }

  protected loadError(): string {
    return apiMessage(this.classes.error(), 'Impossible de charger les classes. Réessayez dans un instant.');
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.copyForm, async () => {
      const from = this.others().find((c) => c.id === this.model().fromClassId);
      if (!from) return;
      this.busy.set(true);
      this.failure.set(null);
      try {
        const rows = await this.#api.school.copyClassSubjects(this.classId(), { fromClassId: from.id });
        this.copied.emit({ from, rows });
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
