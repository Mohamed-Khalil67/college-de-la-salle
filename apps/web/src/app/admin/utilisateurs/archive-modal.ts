import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import { isCalendarDay, todayIso, type ArchiveOutcome } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal, Segmented, type SegmentOption } from '../../ui';
import { formatDay, plural, shownError } from '../shared/admin-format';

/** Who is archived: one student, or every student of a class. */
export type ArchiveTarget =
  | { readonly kind: 'student'; readonly studentId: string; readonly name: string }
  | { readonly kind: 'class'; readonly classId: string; readonly label: string; readonly count: number };

const OUTCOMES: readonly SegmentOption[] = [
  { value: 'graduated', label: 'Diplômé' },
  { value: 'left', label: 'A quitté le collège' },
];

/**
 * Marks students as graduated or left, in two steps: choose the outcome and the day, then confirm what
 * will happen. Archived accounts cannot sign in and become read-only; grades and report cards are kept.
 */
@Component({
  selector: 'app-archive-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl, Segmented],
  template: `
    <cdls-modal [title]="title()" [(open)]="open">
      @if (target(); as t) {
        @if (!confirming()) {
          <form class="stack" novalidate (submit)="onContinue($event)">
            <p>
              @if (t.kind === 'student') {
                <strong>{{ t.name }}</strong>
              } @else {
                Les {{ plural(t.count, 'élève', 'élèves') }} de <strong>{{ t.label }}</strong>
              }
              {{ t.kind === 'student' ? 'a' : 'ont' }} terminé leur parcours au collège ?
            </p>
            <div class="stack stack--sm">
              <p class="field__label">Situation</p>
              <cdls-segmented legend="Situation de l’élève" [options]="outcomes" [(value)]="outcome" />
            </div>
            <cdls-field label="Date" helper="Le jour où l’inscription se termine." [error]="dayError()">
              <input cdlsControl type="date" [formField]="archiveForm.on" />
            </cdls-field>
            <div class="modal__footer">
              <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
              <button cdlsButton type="submit">Continuer</button>
            </div>
          </form>
        } @else {
          <div class="stack" #confirmBlock tabindex="-1">
            <cdls-alert tone="warning">
              <p><strong>Confirmez l’archivage.</strong></p>
              <ul>
                <li>
                  @if (t.kind === 'student') { Le compte de {{ t.name }} est archivé }
                  @else { {{ plural(t.count, 'compte est archivé', 'comptes sont archivés') }} ({{ t.label }}) }
                  : plus de connexion possible, consultation seule.
                </li>
                <li>L’inscription en classe se termine le {{ dayText() }}.</li>
                <li>Les notes, absences et bulletins sont conservés.</li>
                <li>Une demande de changement de section en attente est close.</li>
              </ul>
              <p class="t-body-s">Vous pourrez restaurer un compte depuis « Modifier » si besoin.</p>
            </cdls-alert>
            @if (failure()) {
              <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
            }
            <div class="modal__footer">
              <button cdlsButton variant="secondary" type="button" [disabled]="busy()" (click)="confirming.set(false)">Retour</button>
              <button cdlsButton variant="danger" type="button" [disabled]="busy()" (click)="confirm()">
                {{ busy() ? 'Archivage…' : confirmLabel() }}
              </button>
            </div>
          </div>
        }
      }
    </cdls-modal>
  `,
  styles: `
    [tabindex='-1']:focus {
      outline: none;
    }
    ul {
      padding-left: var(--space-6);
      margin-block: var(--space-2);
    }
  `,
})
export class ArchiveModal {
  readonly open = model(false);
  readonly target = input<ArchiveTarget | null>(null);
  /** The number of accounts archived. */
  readonly archived = output<number>();

  readonly #api = inject(ApiClient);
  readonly #injector = inject(Injector);
  private readonly confirmBlock = viewChild<ElementRef<HTMLElement>>('confirmBlock');

  protected readonly plural = plural;
  protected readonly outcomes = OUTCOMES;
  protected readonly outcome = signal<string>('graduated');
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly model = signal({ on: todayIso() });
  protected readonly archiveForm = form(this.model, (p) => {
    required(p.on, { message: 'Choisissez la date.' });
    validate(p.on, ({ value }) => (value() && !isCalendarDay(value()) ? { kind: 'day', message: 'Saisissez une date valide.' } : undefined));
  });
  protected readonly dayError = computed(() => shownError(this.archiveForm.on()));
  protected readonly dayText = computed(() => formatDay(this.model().on));

  protected readonly title = computed(() => (this.target()?.kind === 'class' ? 'Archiver une classe' : 'Diplômé ou parti'));
  protected readonly confirmLabel = computed(() => {
    const t = this.target();
    return t?.kind === 'class' ? `Archiver ${plural(t.count, 'élève', 'élèves')}` : 'Archiver le compte';
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.confirming.set(false);
        this.failure.set(null);
        this.outcome.set('graduated');
        this.archiveForm().reset({ on: todayIso() });
      });
    });
  }

  protected onContinue(event: Event): void {
    event.preventDefault();
    void submit(this.archiveForm, async () => {
      this.confirming.set(true);
      // The form is replaced by the confirmation: keep the focus inside the dialog, on the new content.
      afterNextRender(() => this.confirmBlock()?.nativeElement.focus(), { injector: this.#injector });
    });
  }

  protected async confirm(): Promise<void> {
    const t = this.target();
    if (!t) return;
    this.busy.set(true);
    this.failure.set(null);
    try {
      const outcome: ArchiveOutcome = this.outcome() === 'left' ? 'left' : 'graduated';
      const result = await this.#api.users.archive({
        ...(t.kind === 'student' ? { studentIds: [t.studentId] } : { classId: t.classId }),
        outcome,
        on: this.model().on,
      });
      this.archived.emit(result.archived);
      this.open.set(false);
    } catch (error) {
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
