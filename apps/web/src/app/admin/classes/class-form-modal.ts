import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, hidden, maxLength, pattern, required, submit } from '@angular/forms/signals';
import type { ClassDto, SectionDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { CLASS_CODE, shownError } from '../shared/admin-format';

interface ClassModel {
  sectionId: string;
  code: string;
  label: string;
}

/** Creates a class in the current school year, or renames one (`editing` set). */
@Component({
  selector: 'app-class-form-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal [title]="editing() ? 'Renommer la classe' : 'Créer une classe'" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        @if (!editing()) {
          <p class="t-muted">Pour l’année {{ yearLabel() }}.</p>
          <cdls-field label="Filière" [error]="sectionError()">
            <select cdlsControl [formField]="classForm.sectionId">
              <option value="">Choisir une filière</option>
              @for (section of sections(); track section.id) {
                <option [value]="section.id">{{ section.label }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field
            label="Code"
            helper="Lettres minuscules, chiffres et tirets, par exemple seconde-b. Il sert à l’import CSV."
            [error]="codeError()"
          >
            <input cdlsControl autocomplete="off" [formField]="classForm.code" />
          </cdls-field>
        }
        <cdls-field label="Nom affiché" helper="Par exemple « Seconde B »." [error]="labelError()">
          <input cdlsControl autocomplete="off" [formField]="classForm.label" />
        </cdls-field>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">
            {{ busy() ? 'Enregistrement…' : editing() ? 'Renommer' : 'Créer la classe' }}
          </button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class ClassFormModal {
  readonly open = model(false);
  readonly sections = input<readonly SectionDto[]>([]);
  readonly yearId = input<string | null>(null);
  readonly yearLabel = input('');
  readonly editing = input<ClassDto | null>(null);
  readonly saved = output<ClassDto>();

  readonly #api = inject(ApiClient);
  readonly #isNew = computed(() => !this.editing());

  protected readonly model = signal<ClassModel>({ sectionId: '', code: '', label: '' });
  protected readonly classForm = form(this.model, (p) => {
    hidden(p.sectionId, () => !this.#isNew());
    hidden(p.code, () => !this.#isNew());
    required(p.sectionId, { message: 'Choisissez la filière.', when: () => this.#isNew() });
    required(p.code, { message: 'Saisissez le code de la classe.', when: () => this.#isNew() });
    pattern(p.code, CLASS_CODE, {
      message: 'Utilisez seulement des lettres minuscules sans accent, des chiffres et des tirets.',
      when: () => this.#isNew(),
    });
    required(p.label, { message: 'Saisissez le nom de la classe.' });
    maxLength(p.label, 80, { message: 'Le nom compte 80 caractères au plus.' });
  });
  protected readonly sectionError = computed(() => shownError(this.classForm.sectionId()));
  protected readonly codeError = computed(() => shownError(this.classForm.code()));
  protected readonly labelError = computed(() => shownError(this.classForm.label()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const editing = this.editing();
      untracked(() => {
        this.failure.set(null);
        this.classForm().reset({ sectionId: editing?.sectionId ?? '', code: editing?.code ?? '', label: editing?.label ?? '' });
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.classForm, async () => {
      const value = this.model();
      const editing = this.editing();
      const yearId = this.yearId();
      this.busy.set(true);
      this.failure.set(null);
      try {
        let saved: ClassDto;
        if (editing) {
          saved = await this.#api.school.updateClass(editing.id, { label: value.label.trim() });
        } else if (yearId) {
          saved = await this.#api.school.createClass({
            schoolYearId: yearId,
            sectionId: value.sectionId,
            code: value.code.trim(),
            label: value.label.trim(),
          });
        } else {
          this.failure.set('Aucune année scolaire en cours : définissez-la dans « Années et trimestres ».');
          return;
        }
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
