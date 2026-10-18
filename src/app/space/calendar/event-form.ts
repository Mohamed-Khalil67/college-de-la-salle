import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MATIERES } from '../../school';
import { EVENT_KINDS, EVENT_LIMITS, isClockTime, kindInfo, longDay, type Attachment, type CalendarEvent, type EventKind } from '../calendar.model';
import { frenchError, isCalendarDay, isHttpsUrl, parseNumber, TARGET_OPTIONS, todayIso } from '../space.model';
import { SpaceService } from '../space.service';
import { KIND_STYLES, SPACE_STYLES } from '../space-styles';

interface EventModel {
  kind: EventKind;
  title: string;
  subject: string;
  target: string;
  date: string;
  start: string;
  end: string;
  weekly: boolean;
  repeatUntil: string;
  place: string;
  description: string;
  coefficient: string;
}

const EMPTY: EventModel = {
  kind: 'cours',
  title: '',
  subject: '',
  target: 'all',
  date: '',
  start: '',
  end: '',
  weekly: false,
  repeatUntil: '',
  place: '',
  description: '',
  coefficient: '1',
};

/**
 * Teachers add or edit a calendar event: category, subject, class, when (with weekly repetition for
 * timetable slots), where, details, documents and videos (links), and a coefficient for graded events.
 */
@Component({
  selector: 'space-event-form',
  imports: [FormField],
  template: `
    <dialog #dialog class="dialog" aria-labelledby="ef-title" data-testid="event-form">
      <form class="grid gap-4 p-6" novalidate (submit)="onSave($event)">
        <div class="flex items-start justify-between gap-4">
          <h2 id="ef-title" class="m-0 text-2xl">{{ editingId() ? 'Modifier l’événement' : 'Nouvel événement' }}</h2>
          <button type="button" class="close" (click)="close()" aria-label="Fermer">✕</button>
        </div>

        <fieldset class="m-0 grid gap-2 border-0 p-0">
          <legend class="mb-1 p-0 font-semibold">Catégorie</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Catégorie">
            @for (k of kinds; track k.id) {
              <button type="button" role="radio" class="kind" [class]="'k-' + k.id" [attr.aria-checked]="model().kind === k.id" (click)="setKind(k.id)" [attr.data-testid]="'kind-' + k.id">{{ k.label }}</button>
            }
          </div>
        </fieldset>

        <div class="grid gap-1">
          <label for="ef-title-input" class="font-semibold">Titre</label>
          <input id="ef-title-input" type="text" [formField]="eventForm.title" [attr.aria-invalid]="attempted() && eventForm.title().invalid()" />
          <p class="err" role="alert">{{ attempted() ? (eventForm.title().errors()[0]?.message ?? '') : '' }}</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-1">
            <label for="ef-subject" class="font-semibold">Matière</label>
            <select id="ef-subject" [formField]="eventForm.subject" data-testid="ef-subject">
              <option value="">— Aucune —</option>
              @for (m of matieres; track m.id) {
                <option [value]="m.id">{{ m.name }}</option>
              }
            </select>
          </div>
          <div class="grid gap-1">
            <label for="ef-target" class="font-semibold">Pour</label>
            <select id="ef-target" [formField]="eventForm.target" data-testid="ef-target">
              @for (t of targets; track t.value) {
                <option [value]="t.value">{{ t.label }}</option>
              }
            </select>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <div class="grid gap-1">
            <label for="ef-date" class="font-semibold">{{ model().kind === 'devoir' ? 'À rendre le' : 'Date' }}</label>
            <input id="ef-date" type="date" [formField]="eventForm.date" data-testid="ef-date" />
          </div>
          <div class="grid gap-1">
            <label for="ef-start" class="font-semibold">Début (facultatif)</label>
            <input id="ef-start" type="time" [formField]="eventForm.start" data-testid="ef-start" />
          </div>
          <div class="grid gap-1">
            <label for="ef-end" class="font-semibold">Fin (facultatif)</label>
            <input id="ef-end" type="time" [formField]="eventForm.end" data-testid="ef-end" />
          </div>
        </div>

        @if (repeatable()) {
          <div class="grid gap-2 rounded-lg bg-page p-3">
            <label class="flex items-center gap-2 font-semibold">
              <input type="checkbox" [formField]="eventForm.weekly" data-testid="ef-weekly" />
              Chaque semaine (emploi du temps)
            </label>
            @if (model().weekly) {
              <div class="grid gap-1 sm:max-w-xs">
                <label for="ef-until" class="font-semibold">Jusqu’au</label>
                <input id="ef-until" type="date" [formField]="eventForm.repeatUntil" data-testid="ef-until" />
              </div>
            }
          </div>
        }

        <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div class="grid gap-1">
            <label for="ef-place" class="font-semibold">Lieu (salle, labo…)</label>
            <input id="ef-place" type="text" [formField]="eventForm.place" data-testid="ef-place" />
          </div>
          @if (gradable()) {
            <div class="grid gap-1">
              <label for="ef-coef" class="font-semibold">Coefficient</label>
              <input id="ef-coef" type="text" inputmode="decimal" [formField]="eventForm.coefficient" data-testid="ef-coef" />
            </div>
          }
        </div>

        <div class="grid gap-1">
          <label for="ef-description" class="font-semibold">Détails (programme, consignes…)</label>
          <textarea id="ef-description" [formField]="eventForm.description" data-testid="ef-description"></textarea>
        </div>

        <fieldset class="m-0 grid gap-2 border-0 p-0" data-testid="ef-attachments">
          <legend class="mb-1 p-0 font-semibold">Documents et vidéos (liens https)</legend>
          <p class="m-0 text-sm text-muted">Cours en PDF sur un drive, vidéo YouTube ou Google Drive d’explication… Les vidéos se lisent directement dans la fiche.</p>
          @for (a of attachments(); track $index; let i = $index) {
            <div class="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input #label type="text" [value]="a.label" (input)="setAttachment(i, 'label', label.value)" [attr.aria-label]="'Nom du document ' + (i + 1)" placeholder="Nom (ex. Cours chapitre 3)" data-testid="ef-att-label" />
              <input #url type="url" [value]="a.url" (input)="setAttachment(i, 'url', url.value)" [attr.aria-label]="'Lien du document ' + (i + 1)" placeholder="https://" data-testid="ef-att-url" />
              <button type="button" class="link" (click)="removeAttachment(i)" [attr.aria-label]="'Retirer le document ' + (i + 1)">Retirer</button>
            </div>
          }
          @if (attachments().length < maxAttachments) {
            <button type="button" class="btn btn-outline-dark justify-self-start" (click)="addAttachment()" data-testid="ef-att-add">+ Ajouter un lien</button>
          }
        </fieldset>

        @if (message(); as m) {
          <p class="m-0 rounded-lg bg-warn-soft px-3 py-2 text-warn" role="alert" data-testid="ef-message">{{ m }}</p>
        }
        <div class="flex flex-wrap gap-3 border-t border-line pt-4">
          <button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="ef-save">{{ editingId() ? 'Enregistrer' : 'Ajouter au calendrier' }}</button>
          <button type="button" class="btn btn-outline-dark" (click)="close()">Annuler</button>
        </div>
      </form>
    </dialog>
  `,
  styles: [
    SPACE_STYLES,
    KIND_STYLES,
    `
      .dialog { inline-size: min(44rem, calc(100vw - 2rem)); max-block-size: calc(100dvh - 2rem); padding: 0; border: 0; border-radius: 16px; background: var(--surface); color: inherit; box-shadow: 0 20px 50px rgb(10 25 47 / 0.3); }
      .dialog::backdrop { background: rgb(10 25 47 / 0.55); }
      .close { inline-size: 2.25rem; block-size: 2.25rem; flex: none; border-radius: 999px; border: 1px solid var(--border); background: transparent; font: inherit; cursor: pointer; }
      .kind { padding: 0.4rem 0.8rem; border-radius: 999px; border: 1px solid transparent; font: inherit; font-weight: 600; cursor: pointer; opacity: 0.75; }
      .kind[aria-checked='true'] { opacity: 1; border-color: currentColor; box-shadow: inset 0 0 0 1px currentColor; }
      input[type='checkbox'] { inline-size: 1.15rem; block-size: 1.15rem; padding: 0; }
    `,
  ],
})
export class EventForm {
  readonly #space = inject(SpaceService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly kinds = EVENT_KINDS;
  protected readonly matieres = MATIERES;
  protected readonly targets = TARGET_OPTIONS;
  protected readonly maxAttachments = EVENT_LIMITS.attachments;

  protected readonly editingId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly attempted = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly attachments = signal<Attachment[]>([]);

  protected readonly model = signal<EventModel>({ ...EMPTY });
  protected readonly eventForm = form(this.model, (p) => {
    required(p.title, { message: 'Saisissez un titre.' });
    maxLength(p.title, EVENT_LIMITS.title, { message: 'Titre trop long (120 caractères maximum).' });
    maxLength(p.place, EVENT_LIMITS.place, { message: 'Lieu trop long.' });
    maxLength(p.description, EVENT_LIMITS.description, { message: 'Détails trop longs.' });
  });

  protected readonly repeatable = computed(() => kindInfo(this.model().kind).repeatable);
  protected readonly gradable = computed(() => kindInfo(this.model().kind).gradable);

  /** New event (on `day`, today by default), or edit an existing one. */
  open(event?: CalendarEvent | null, day?: string): void {
    this.attempted.set(false);
    this.message.set(null);
    if (event) {
      this.editingId.set(event.id);
      this.model.set({
        kind: event.kind,
        title: event.title,
        subject: event.subject,
        target: event.target,
        date: event.date,
        start: event.start,
        end: event.end,
        weekly: !!event.repeatUntil,
        repeatUntil: event.repeatUntil,
        place: event.place,
        description: event.description,
        coefficient: String(event.coefficient),
      });
      this.attachments.set(event.attachments.map((a) => ({ ...a })));
    } else {
      this.editingId.set(null);
      // Keeps the category, subject and class of the previous entry: a teacher often enters a series.
      this.model.update((m) => ({ ...EMPTY, kind: m.kind, subject: m.subject, target: m.target, date: day ?? todayIso() }));
      this.attachments.set([]);
    }
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected setKind(kind: EventKind): void {
    this.model.update((m) => ({ ...m, kind, weekly: kindInfo(kind).repeatable && m.weekly }));
  }

  protected addAttachment(): void {
    this.attachments.update((list) => [...list, { label: '', url: '' }]);
  }

  protected removeAttachment(index: number): void {
    this.attachments.update((list) => list.filter((_, i) => i !== index));
  }

  protected setAttachment(index: number, field: keyof Attachment, value: string): void {
    this.attachments.update((list) => list.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.eventForm().invalid()) return;
    const m = this.model();
    const problem = this.#problem(m);
    if (problem) {
      this.message.set(problem);
      return;
    }
    const attachments = this.attachments().filter((a) => a.url.trim());
    const weekly = this.repeatable() && m.weekly;
    this.busy.set(true);
    this.message.set(null);
    try {
      await this.#space.saveEvent(
        {
          kind: m.kind,
          title: m.title,
          subject: m.subject,
          target: m.target,
          date: m.date,
          start: m.start,
          end: m.start ? m.end : '',
          repeatUntil: weekly ? m.repeatUntil : '',
          place: m.place,
          description: m.description,
          attachments,
          coefficient: this.gradable() ? parseNumber(m.coefficient) : 1,
        },
        this.editingId() ?? undefined,
      );
      this.close();
    } catch (error) {
      this.message.set(frenchError(error));
    } finally {
      this.busy.set(false);
    }
  }

  #problem(m: EventModel): string | null {
    if (!isCalendarDay(m.date)) return 'Choisissez la date.';
    if (!isClockTime(m.start) || !isClockTime(m.end)) return 'Heure invalide.';
    if (m.end && !m.start) return 'Indiquez l’heure de début.';
    if (m.end && m.end <= m.start) return 'L’heure de fin doit être après l’heure de début.';
    if (this.repeatable() && m.weekly && (!isCalendarDay(m.repeatUntil) || m.repeatUntil < m.date)) {
      return `Choisissez jusqu’à quand l’événement se répète (après le ${longDay(m.date)}).`;
    }
    const coefficient = parseNumber(m.coefficient);
    if (this.gradable() && (Number.isNaN(coefficient) || coefficient <= 0 || coefficient > 20)) return 'Le coefficient doit être un nombre entre 0,5 et 20.';
    for (const a of this.attachments()) {
      if (a.url.trim() && !isHttpsUrl(a.url)) return `Le lien « ${a.label || a.url} » doit commencer par https://.`;
      if (a.label.length > EVENT_LIMITS.label) return 'Nom de document trop long.';
    }
    return null;
  }
}
