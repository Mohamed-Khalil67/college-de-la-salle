import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form, FormField, max, min, required, submit } from '@angular/forms/signals';
import type { ClassDto, SubjectDto, TeachingAssignmentDto, UserDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../../shared/ui';
import { fullName, groupBySection } from '../shared/admin-format';
import { shownError } from '../../../shared/utils/forms';

interface AssignmentModel {
  teacherId: string;
  classId: string;
  subjectId: string;
  coefficient: number | null;
}

/** Assigns a teacher to teach a subject in a class, with the subject's coefficient there. */
@Component({
  selector: 'app-assignment-create-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl],
  template: `
    <cdls-modal title="Nouvelle affectation" [(open)]="open">
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <cdls-field label="Enseignant" [error]="teacherError()">
          <select cdlsControl [formField]="assignmentForm.teacherId">
            <option value="">Choisir un enseignant</option>
            @for (teacher of teachers(); track teacher.id) {
              <option [value]="teacher.teacherId">{{ name(teacher) }}</option>
            }
          </select>
        </cdls-field>
        <cdls-field label="Classe" [error]="classError()">
          <select cdlsControl [formField]="assignmentForm.classId">
            <option value="">Choisir une classe</option>
            @for (group of classGroups(); track group.code) {
              <optgroup [label]="group.label">
                @for (item of group.items; track item.id) {
                  <option [value]="item.id">{{ item.label }}</option>
                }
              </optgroup>
            }
          </select>
        </cdls-field>
        <cdls-field label="Matière" [error]="subjectError()">
          <select cdlsControl [formField]="assignmentForm.subjectId">
            <option value="">Choisir une matière</option>
            @for (group of subjectGroups(); track group.name) {
              <optgroup [label]="group.name">
                @for (subject of group.items; track subject.id) {
                  <option [value]="subject.id">{{ subject.name }}</option>
                }
              </optgroup>
            }
          </select>
        </cdls-field>
        <cdls-field label="Coefficient" helper="De 0 à 20, par exemple 2 ou 1,5. Il pondère la matière dans la moyenne du bulletin. Si la classe a déjà cette matière, son coefficient actuel est conservé." [error]="coefficientError()">
          <input cdlsControl type="number" inputmode="decimal" step="0.5" [formField]="assignmentForm.coefficient" />
        </cdls-field>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : 'Créer l’affectation' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class AssignmentCreateModal {
  readonly open = model(false);
  readonly teachers = input<readonly UserDto[]>([]);
  readonly classes = input<readonly ClassDto[]>([]);
  readonly subjects = input<readonly SubjectDto[]>([]);
  /** Pre-selected from the page filters. */
  readonly classId = input('');
  readonly teacherId = input('');
  readonly created = output<TeachingAssignmentDto>();

  readonly #api = inject(ApiClient);

  protected readonly classGroups = computed(() => groupBySection(this.classes()));
  protected readonly subjectGroups = computed(() => {
    const groups = new Map<string, SubjectDto[]>();
    for (const subject of this.subjects()) groups.set(subject.group, [...(groups.get(subject.group) ?? []), subject]);
    return [...groups].map(([name, items]) => ({ name, items }));
  });

  protected readonly model = signal<AssignmentModel>({ teacherId: '', classId: '', subjectId: '', coefficient: 1 });
  protected readonly assignmentForm = form(this.model, (p) => {
    required(p.teacherId, { message: 'Choisissez l’enseignant.' });
    required(p.classId, { message: 'Choisissez la classe.' });
    required(p.subjectId, { message: 'Choisissez la matière.' });
    required(p.coefficient, { message: 'Saisissez un coefficient, par exemple 1.' });
    min(p.coefficient, 0, { message: 'Le coefficient va de 0 à 20.' });
    max(p.coefficient, 20, { message: 'Le coefficient va de 0 à 20.' });
  });
  protected readonly teacherError = computed(() => shownError(this.assignmentForm.teacherId()));
  protected readonly classError = computed(() => shownError(this.assignmentForm.classId()));
  protected readonly subjectError = computed(() => shownError(this.assignmentForm.subjectId()));
  protected readonly coefficientError = computed(() => shownError(this.assignmentForm.coefficient()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.failure.set(null);
        this.assignmentForm().reset({ teacherId: this.teacherId(), classId: this.classId(), subjectId: '', coefficient: 1 });
      });
    });
  }

  protected name(user: UserDto): string {
    return fullName(user);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.assignmentForm, async () => {
      const value = this.model();
      this.busy.set(true);
      this.failure.set(null);
      try {
        // A teacher teaches a subject of the class: make sure the class has it (the typed coefficient is for a new subject).
        const coefficient = Math.round((value.coefficient ?? 1) * 100) / 100;
        // A subject the class already has keeps its coefficient (a second teacher must not reset it).
        const existing = (await this.#api.school.classSubjects(value.classId)).find((s) => s.subjectId === value.subjectId);
        const classSubject = existing ?? (await this.#api.school.addClassSubject(value.classId, { subjectId: value.subjectId, coefficient }));
        const created = await this.#api.school.createAssignment({
          teacherId: value.teacherId,
          classSubjectId: classSubject.id,
        });
        this.created.emit(created);
        this.open.set(false);
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
