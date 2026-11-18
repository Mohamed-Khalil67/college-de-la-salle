import { Component, computed, inject, linkedSignal, model, output, resource, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { type ActivityTypeDto, type ClassDto, type EventDto, isExamActivityCode, type TimetableBlockedError } from '@cdls/shared';
import { SECTION_LABELS } from '../../../core/school/school-profile';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { Alert, Button, Field, FieldControl, Modal } from '../../../shared/ui';
import { fieldValue } from '../../../shared/utils/forms';
import { BlockedNotice } from '../../timetable/blocked-notice';
import { blockedOf } from '../../timetable/timetable-api';
import { emptyExam, type ExamModel, examNotes, examProblem, toExamInput } from './exam-logic';

/**
 * « Ajouter un examen »: an exam or a test for any class (type, class, subject, day, hours, room). The
 * planner owns the exam weeks, so the form says whether the day is in one and whether the class already has
 * two assessments that day (it informs, it never blocks). A clash of the class or of the room is refused by the
 * API (409) and shown here, nothing is saved.
 */
@Component({
  selector: 'app-add-exam-dialog',
  imports: [Alert, BlockedNotice, Button, Field, FieldControl, FormField, Modal],
  template: `
    <cdls-modal title="Ajouter un examen" [(open)]="open" [dismissible]="!busy()">
      <form class="stack stack--sm" novalidate (submit)="submit($event)">
        <cdls-field label="Type">
          <select cdlsControl [formField]="examForm.activityTypeId">
            @for (t of types(); track t.id) {
              <option [value]="t.id">{{ t.label }}</option>
            }
          </select>
        </cdls-field>
        <cdls-field label="Classe">
          <select cdlsControl [formField]="examForm.classId" (change)="pickClass($event)">
            <option value="">Choisir…</option>
            @for (c of classes(); track c.id) {
              <option [value]="c.id">{{ className(c) }}</option>
            }
          </select>
        </cdls-field>
        <cdls-field label="Matière" helper="Les matières enseignées dans la classe.">
          <select cdlsControl [formField]="examForm.subjectId">
            <option value="">Choisir…</option>
            @for (s of subjects(); track s.id) {
              <option [value]="s.subjectId">{{ s.subjectName }}</option>
            }
          </select>
        </cdls-field>
        <cdls-field label="Titre" helper="Facultatif. Sans titre : « {{ proposedTitle() }} ».">
          <input cdlsControl type="text" autocomplete="off" [formField]="examForm.title" />
        </cdls-field>
        <cdls-field label="Date">
          <input cdlsControl type="date" [formField]="examForm.date" />
        </cdls-field>
        @for (note of notes(); track note) {
          <p class="t-body-s t-muted">{{ note }}</p>
        }
        <div class="grid-2 grid-2--tight">
          <cdls-field label="Début">
            <input cdlsControl type="time" [formField]="examForm.startTime" />
          </cdls-field>
          <cdls-field label="Fin">
            <input cdlsControl type="time" [formField]="examForm.endTime" />
          </cdls-field>
        </div>
        <cdls-field label="Salle" helper="Facultatif. Une salle déjà prise à cette heure est refusée.">
          <select cdlsControl [formField]="examForm.roomId">
            <option value="">Aucune salle</option>
            @for (r of rooms(); track r.id) {
              <option [value]="r.id">{{ r.name }}</option>
            }
          </select>
        </cdls-field>

        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <app-blocked-notice [conflicts]="conflicts()" [warnings]="[]" [suggestions]="[]" [busy]="busy()" />

        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" [disabled]="busy()" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : 'Ajouter l’examen' }}</button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class AddExamDialog {
  readonly open = model(false);
  readonly saved = output<EventDto>();

  readonly #api = inject(ApiClient);
  readonly #clock = inject(SchoolClock);

  protected readonly busy = signal(false);
  /** Cleared each time the dialog opens or closes. */
  protected readonly failure = linkedSignal<boolean, string | null>({ source: this.open, computation: () => null });
  protected readonly conflicts = linkedSignal<boolean, TimetableBlockedError['conflicts']>({ source: this.open, computation: () => [] });

  /** Loaded once, when the dialog is first opened. */
  readonly #wanted = computed(() => (this.open() ? true : undefined));
  readonly #types = resource({ params: () => this.#wanted(), loader: () => this.#api.school.activityTypes() });
  readonly #classes = resource({ params: () => this.#wanted(), loader: () => this.#api.school.classes() });
  readonly #rooms = resource({ params: () => this.#wanted(), loader: () => this.#api.school.rooms() });
  protected readonly types = computed(() => (this.#types.hasValue() ? this.#types.value().filter((t) => isExamActivityCode(t.code) && !t.archived) : []));
  protected readonly classes = computed(() => (this.#classes.hasValue() ? this.#classes.value() : []));
  protected readonly rooms = computed(() => (this.#rooms.hasValue() ? this.#rooms.value().filter((r) => r.active) : []));

  /**
   * A fresh form each time the dialog opens or closes; while it stays open, the types arriving (they load on
   * the first open) only fix the type: the first one until the person picks one that exists.
   */
  protected readonly model = linkedSignal<{ open: boolean; types: readonly ActivityTypeDto[] }, ExamModel>({
    source: () => ({ open: this.open(), types: this.types() }),
    computation: ({ open, types }, previous) => {
      const first = types[0]?.id ?? '';
      if (previous && previous.source.open === open) {
        const kept = previous.value;
        return types.some((t) => t.id === kept.activityTypeId) ? kept : { ...kept, activityTypeId: first };
      }
      // The clock ticks at midnight: it must not reset a form being filled in.
      return { ...emptyExam(untracked(() => this.#clock.today())), activityTypeId: first };
    },
  });
  protected readonly examForm = form(this.model);

  readonly #classId = computed(() => this.model().classId);
  readonly #subjects = resource({
    params: () => this.#classId() || undefined,
    loader: ({ params }) => this.#api.school.classSubjects(params),
  });
  protected readonly subjects = computed(() => (this.#subjects.hasValue() ? this.#subjects.value() : []));

  /** What the date and class say about the day: exam week or not, assessments already planned. */
  readonly #dayKey = computed(() => {
    const { classId, date } = this.model();
    return classId && date ? { classId, date } : undefined;
  });
  readonly #days = resource({
    params: () => this.#dayKey(),
    loader: ({ params }) => this.#api.school.calendarDays({ from: params.date, to: params.date }),
  });
  readonly #events = resource({
    params: () => this.#dayKey(),
    loader: ({ params }) => this.#api.calendar.events({ from: params.date, to: params.date, classId: params.classId }),
  });
  /** Both sources are advice: while they load, or if they fail, the form says nothing rather than something false. */
  protected readonly notes = computed(() => {
    if (!this.#days.hasValue() || !this.#events.hasValue()) return [];
    const m = this.model();
    return examNotes(this.#days.value(), this.#events.value(), m.date, this.classes().find((c) => c.id === m.classId));
  });

  protected readonly proposedTitle = computed(() => {
    const m = this.model();
    const type = this.types().find((t) => t.id === m.activityTypeId);
    return toExamInput(m, type?.label ?? 'Examen', this.#subjectName()).title;
  });

  /** A new class has its own subjects: the subject chosen for the previous one is cleared with the change. */
  protected pickClass(event: Event): void {
    this.model.update((m) => ({ ...m, classId: fieldValue(event), subjectId: '' }));
  }

  protected className(c: ClassDto): string {
    return `${c.label} (${SECTION_LABELS[c.sectionCode]})`;
  }

  #subjectName(): string {
    return this.subjects().find((s) => s.subjectId === this.model().subjectId)?.subjectName ?? '';
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const m = this.model();
    const problem = examProblem(m);
    this.conflicts.set([]);
    if (problem) {
      this.failure.set(problem);
      return;
    }
    this.failure.set(null);
    const type = this.types().find((t) => t.id === m.activityTypeId);
    this.busy.set(true);
    try {
      const created = await this.#api.calendar.create(toExamInput(m, type?.label ?? 'Examen', this.#subjectName()));
      this.open.set(false);
      this.saved.emit(created);
    } catch (error) {
      const blocked = blockedOf(error);
      if (blocked) this.conflicts.set(blocked.conflicts);
      else this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
