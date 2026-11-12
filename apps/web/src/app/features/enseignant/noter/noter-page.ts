import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, linkedSignal, resource, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { form, FormField, max, maxLength, min, required, submit } from '@angular/forms/signals';
import { EVENT_LIMITS, type EventDto, type PendingGradingDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { LoadState } from '../../../shared/components/load-state';
import { teacherAssignments } from '../../../shared/data/teacher-data';
import { Alert, Button, EmptyState, Field, FieldControl } from '../../../shared/ui';
import { shownError } from '../../../shared/utils/forms';
import { GradeGrid } from '../notes/grade-grid';
import { classSubjectChoices, COEFFICIENT_LIMITS, initialChoice, pendingMeta, quickGradeTypes, SCALE_LIMITS, scaleLine } from './noter-logic';

interface NewNoteModel {
  title: string;
  outOf: number;
  coefficient: number;
  activityTypeId: string;
}

/** Where the teacher is: choosing the note, typing the marks, or done (published). */
type Step =
  | { readonly kind: 'choose' }
  | { readonly kind: 'grade'; readonly event: EventDto; readonly scale: number }
  | { readonly kind: 'published'; readonly title: string };

const EMPTY_NOTE: NewNoteModel = { title: '', outOf: 20, coefficient: 1, activityTypeId: '' };

/**
 * « Noter »: grade a class straight away. Step 1 « Quelle note ? » (a new note, or a draft or planned exam
 * to finish), step 2 the marks of the class (the « Saisie des notes » grid in quick mode: Enter to the next
 * student, autosave, « Finir plus tard », « Publier aux élèves »). Focus moves to each step's heading.
 */
@Component({
  selector: 'app-noter-page',
  imports: [RouterLink, FormField, Alert, Button, EmptyState, Field, FieldControl, LoadState, GradeGrid],
  templateUrl: './noter-page.html',
  styles: `
    .choice {
      max-inline-size: 28rem;
      margin-block-end: var(--space-6);
    }
    .noter-columns {
      display: grid;
      gap: var(--space-6);
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
      align-items: start;
    }
    .note-numbers {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pending-list {
      display: grid;
      gap: var(--space-2);
    }
    .pending-item {
      display: grid;
      gap: var(--space-1);
      inline-size: 100%;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-body);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .pending-item:hover {
      border-color: var(--color-navy-700);
    }
    .pending-item:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .pending-item__title {
      color: var(--color-heading);
      font-weight: 600;
    }
    .step-heading:focus {
      outline: none;
    }
    .step-meta {
      margin-block-end: var(--space-4);
    }
    .step-back {
      margin-block-end: var(--space-4);
    }
  `,
})
export class NoterPage {
  /** ?classe=<class id> */
  readonly classe = input<string>();
  /** ?matiere=<subject id> */
  readonly matiere = input<string>();

  readonly #api = inject(ApiClient);
  readonly #injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  protected readonly assignments = teacherAssignments();
  protected readonly choices = computed(() => classSubjectChoices(this.assignments.hasValue() ? this.assignments.value() : []));
  protected readonly choiceKey = linkedSignal(() => initialChoice(this.choices(), this.classe(), this.matiere())?.key ?? '');
  protected readonly choice = computed(() => this.choices().find((c) => c.key === this.choiceKey()) ?? null);
  protected readonly className = computed(() => this.choice()?.classLabel ?? 'la classe');

  readonly #types = resource({ loader: () => this.#api.school.activityTypes() });
  protected readonly types = computed(() => quickGradeTypes(this.#types.hasValue() ? this.#types.value() : []));

  protected readonly pending = resource({
    params: () => {
      const c = this.choice();
      return c ? { classId: c.classId, subjectId: c.subjectId } : undefined;
    },
    loader: ({ params }) => this.#api.grades.pending(params),
  });
  protected readonly pendingList = computed(() => (this.pending.hasValue() ? this.pending.value() : []));

  protected readonly step = signal<Step>({ kind: 'choose' });
  /** A short polite line after « Finir plus tard ». */
  protected readonly notice = signal<string | null>(null);

  protected readonly model = signal<NewNoteModel>({ ...EMPTY_NOTE });
  protected readonly noteForm = form(this.model, (p) => {
    required(p.title, { message: 'Donnez un nom à la note, par exemple « Interrogation 3 ».' });
    maxLength(p.title, EVENT_LIMITS.title, { message: `Le nom compte ${EVENT_LIMITS.title} caractères au plus.` });
    required(p.outOf, { message: `Indiquez sur combien la note est donnée, par exemple 20.` });
    min(p.outOf, SCALE_LIMITS.min, { message: `La note est sur ${SCALE_LIMITS.min} à ${SCALE_LIMITS.max}.` });
    max(p.outOf, SCALE_LIMITS.max, { message: `La note est sur ${SCALE_LIMITS.min} à ${SCALE_LIMITS.max}.` });
    required(p.coefficient, { message: 'Indiquez un coefficient, 1 par défaut.' });
    min(p.coefficient, COEFFICIENT_LIMITS.min, { message: `Le coefficient va de ${COEFFICIENT_LIMITS.min} à ${COEFFICIENT_LIMITS.max}.` });
    max(p.coefficient, COEFFICIENT_LIMITS.max, { message: `Le coefficient va de ${COEFFICIENT_LIMITS.min} à ${COEFFICIENT_LIMITS.max}.` });
  });
  protected readonly titleError = computed(() => shownError(this.noteForm.title()));
  protected readonly outOfError = computed(() => shownError(this.noteForm.outOf()));
  protected readonly coefficientError = computed(() => shownError(this.noteForm.coefficient()));
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const s = this.step();
    const where = this.choice()?.label ?? '';
    if (s.kind === 'grade') return `${where}. Tapez les notes, elles s’enregistrent seules.`;
    return where ? `${where}. Créez une note ou reprenez-en une.` : 'Choisissez une classe.';
  });

  protected meta(p: PendingGradingDto): string {
    return pendingMeta(p);
  }
  protected gradeMeta(event: EventDto, scale: number): string {
    return `${event.type.label}, ${scaleLine(scale, event.coefficient).toLowerCase()}`;
  }

  protected onChoice(event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.choiceKey.set(event.target.value);
    this.notice.set(null);
  }

  protected create(event: Event): void {
    event.preventDefault();
    const c = this.choice();
    if (!c || this.busy()) return;
    void submit(this.noteForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      const m = this.model();
      const typeId = m.activityTypeId || this.types()[0]?.id;
      try {
        const sheet = await this.#api.grades.createQuick({
          classId: c.classId,
          subjectId: c.subjectId,
          title: m.title.trim(),
          coefficient: m.coefficient,
          ...(typeId ? { activityTypeId: typeId } : {}),
        });
        this.noteForm().reset({ ...EMPTY_NOTE });
        this.#go({ kind: 'grade', event: sheet.event, scale: m.outOf });
      } catch (error) {
        this.failure.set(`La note n’a pas été créée. ${apiMessage(error)}`);
      } finally {
        this.busy.set(false);
      }
    });
  }

  protected resume(p: PendingGradingDto): void {
    this.#go({ kind: 'grade', event: p.event, scale: p.outOf ?? 20 });
  }

  /** « Finir plus tard », « Changer de note » and « Noter une autre note »: back to step 1. */
  protected backToChoice(saved?: string): void {
    this.notice.set(saved ? `« ${saved} » est enregistrée : elle vous attend dans « À finir ».` : null);
    this.pending.reload();
    this.#go({ kind: 'choose' });
  }

  protected onPublished(published: boolean, title: string): void {
    if (!published) return;
    this.pending.reload();
    this.#go({ kind: 'published', title });
  }

  #go(step: Step): void {
    this.step.set(step);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.#injector });
  }
}
