import { Component, computed, effect, inject, input, linkedSignal, output, resource, signal, untracked } from '@angular/core';
import { form, FormField, maxLength, required, submit, validate } from '@angular/forms/signals';
import { daysBetween, EVENT_LIMITS, type EventDto, type TeachingAssignmentDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl } from '../../ui';
import { assignmentLabel, defaultActivityType, emptyEventModel, type EventFormModel, modelFromEvent, sortAssignments, timeProblem, toEventInput } from '../shared/teacher';

/** First error of a field once it was touched (or a submit was tried). */
function shownError(state: { touched(): boolean; errors(): readonly { message?: string }[] }): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

/** Create or edit a calendar event (Signal Forms). Used inside the agenda's modal. */
@Component({
  selector: 'app-event-form',
  imports: [FormField, Alert, Button, Field, FieldControl],
  template: `
    <form class="stack stack--sm" novalidate (submit)="onSubmit($event)">
      @if (failure()) {
        <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
      }
      <cdls-field label="Type">
        <select cdlsControl [formField]="eventForm.activityTypeId">
          @for (k of choices(); track k.id) {
            <option [value]="k.id">{{ k.label }}</option>
          }
        </select>
      </cdls-field>
      <cdls-field label="Titre" [error]="err().title">
        <input cdlsControl type="text" autocomplete="off" [formField]="eventForm.title" />
      </cdls-field>
      <cdls-field label="Classe et matière" [error]="err().assignment">
        <select cdlsControl [formField]="eventForm.assignmentId">
          <option value="">Choisir…</option>
          @for (a of sorted(); track a.id) {
            <option [value]="a.id">{{ label(a) }}</option>
          }
        </select>
      </cdls-field>
      <cdls-field label="Date" [error]="err().date">
        <input cdlsControl type="date" [formField]="eventForm.date" />
      </cdls-field>
      <div class="grid-2 grid-2--tight">
        <cdls-field label="Début" helper="Vide : toute la journée.">
          <input cdlsControl type="time" [formField]="eventForm.startTime" />
        </cdls-field>
        <cdls-field label="Fin" [error]="err().endTime">
          <input cdlsControl type="time" [formField]="eventForm.endTime" />
        </cdls-field>
      </div>
      @if (repeatable()) {
        <label class="check">
          <input type="checkbox" [formField]="eventForm.weekly" />
          <span>Chaque semaine (un créneau d’emploi du temps)</span>
        </label>
        @if (model().weekly) {
          <cdls-field label="Jusqu’au" helper="Dernier jour de la répétition, inclus." [error]="err().repeatUntil">
            <input cdlsControl type="date" [formField]="eventForm.repeatUntil" />
          </cdls-field>
        }
      }
      @if (gradable()) {
        <cdls-field label="Coefficient" helper="Poids de l’évaluation dans la moyenne de la matière, de 0,5 à 20." [error]="err().coefficient">
          <input cdlsControl type="number" inputmode="decimal" [formField]="eventForm.coefficient" />
        </cdls-field>
      }
      <cdls-field label="Lieu" helper="Facultatif, par exemple « Salle 12 »." [error]="err().place">
        <input cdlsControl type="text" [formField]="eventForm.place" />
      </cdls-field>
      <cdls-field label="Description" helper="Facultatif : consignes, chapitres à réviser…" [error]="err().description">
        <textarea cdlsControl rows="3" [formField]="eventForm.description"></textarea>
      </cdls-field>
      <div class="modal__footer">
        <button cdlsButton variant="secondary" type="button" (click)="cancelled.emit()">Annuler</button>
        <button cdlsButton type="submit">{{ busy() ? 'Enregistrement…' : event() ? 'Enregistrer' : 'Créer l’événement' }}</button>
      </div>
    </form>
  `,
})
export class EventForm {
  readonly event = input<EventDto | null>(null);
  readonly assignments = input.required<readonly TeachingAssignmentDto[]>();
  /** Default date for a new event. */
  readonly day = input.required<string>();
  readonly saved = output<EventDto>();
  readonly cancelled = output<void>();

  readonly #api = inject(ApiClient);
  /** The school's activity types plus the teacher's own. */
  readonly #types = resource({ loader: () => this.#api.school.activityTypes(true) });
  protected readonly types = computed(() => (this.#types.hasValue() ? this.#types.value() : []));
  /** What the select offers: active types, plus the archived one the edited event still has. */
  protected readonly choices = computed(() => this.types().filter((t) => !t.archived || t.id === this.event()?.activityTypeId));
  protected readonly sorted = computed(() => sortAssignments(this.assignments()));

  protected readonly model = linkedSignal<EventFormModel>(() => {
    const e = this.event();
    const list = this.sorted();
    return e ? modelFromEvent(e, list) : emptyEventModel(this.day(), list.length === 1 ? list[0]!.id : '');
  });
  protected readonly eventForm = form(this.model, (p) => {
    required(p.title, { message: 'Donnez un titre, par exemple « Contrôle n° 3 : fonctions affines ».' });
    maxLength(p.title, EVENT_LIMITS.title, { message: `Le titre ne doit pas dépasser ${EVENT_LIMITS.title} caractères.` });
    required(p.assignmentId, { message: 'Choisissez la classe et la matière.' });
    required(p.date, { message: 'Choisissez la date.' });
    validate(p.endTime, ({ value, valueOf }) => {
      const message = timeProblem(valueOf(p.startTime), value());
      return message ? { kind: 'time', message } : undefined;
    });
    validate(p.repeatUntil, ({ value, valueOf }) => {
      if (!valueOf(p.weekly) || !this.#flags(valueOf(p.activityTypeId)).repeatable) return undefined;
      const until = value();
      if (!until) return { kind: 'required', message: 'Indiquez jusqu’à quand l’événement se répète.' };
      if (until < valueOf(p.date)) return { kind: 'order', message: 'La répétition doit finir après le premier jour.' };
      if (daysBetween(valueOf(p.date), until) > 366) return { kind: 'range', message: 'La répétition est limitée à un an.' };
      return undefined;
    });
    validate(p.coefficient, ({ value, valueOf }) => {
      if (!this.#flags(valueOf(p.activityTypeId)).gradable) return undefined;
      const c = value();
      return Number.isFinite(c) && c > 0 && c <= 20 ? undefined : { kind: 'range', message: 'Saisissez un coefficient entre 0,5 et 20.' };
    });
    maxLength(p.place, EVENT_LIMITS.place, { message: `Le lieu ne doit pas dépasser ${EVENT_LIMITS.place} caractères.` });
    maxLength(p.description, EVENT_LIMITS.description, {
      message: `La description ne doit pas dépasser ${EVENT_LIMITS.description} caractères.`,
    });
  });

  protected readonly repeatable = computed(() => this.#flags(this.model().activityTypeId).repeatable);
  protected readonly gradable = computed(() => this.#flags(this.model().activityTypeId).gradable);
  protected readonly err = computed(() => ({
    title: shownError(this.eventForm.title()),
    assignment: shownError(this.eventForm.assignmentId()),
    date: shownError(this.eventForm.date()),
    endTime: shownError(this.eventForm.endTime()),
    repeatUntil: shownError(this.eventForm.repeatUntil()),
    coefficient: shownError(this.eventForm.coefficient()),
    place: shownError(this.eventForm.place()),
    description: shownError(this.eventForm.description()),
  }));

  constructor() {
    // A new event starts with the plain weekly type, once the types have arrived (without resetting what was typed).
    effect(() => {
      const fallback = defaultActivityType(this.choices())?.id;
      untracked(() => {
        if (fallback && !this.event() && !this.model().activityTypeId) this.model.update((m) => ({ ...m, activityTypeId: fallback }));
      });
    });
  }

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  #flags(id: string): { repeatable: boolean; gradable: boolean } {
    return this.types().find((t) => t.id === id) ?? { repeatable: false, gradable: false };
  }

  protected label(a: TeachingAssignmentDto): string {
    return assignmentLabel(a);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    void submit(this.eventForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const body = toEventInput(this.model(), this.assignments(), this.types());
        const current = this.event();
        this.saved.emit(current ? await this.#api.calendar.update(current.id, body) : await this.#api.calendar.create(body));
      } catch (error) {
        this.failure.set(`L’événement n’a pas été enregistré. ${apiMessage(error)}`);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
