import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MATIERES, matiereName } from '@site/content';
import {
  EVENT_KINDS,
  eventKindLabel,
  eventsForTarget,
  eventsOn,
  isClockTime,
  monthGrid,
  monthTitle,
  shiftMonth,
  type CalendarEvent,
  type EventKind,
} from '../calendar.model';
import { formatDay, frenchError, isCalendarDay, LIMITS, TARGET_OPTIONS, targetLabel, todayIso } from '../space.model';
import { SpaceService } from '../space.service';
import { SPACE_STYLES } from './space.styles';

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const FULL_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * A month calendar of exams, activities and meetings. Read-only for students (the page passes only the
 * events that concern them); with `editable`, teachers filter by class and add, correct or delete events.
 */
@Component({
  selector: 'space-calendar',
  imports: [FormField],
  template: `
    <div class="grid gap-4" data-testid="calendar">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-outline-dark" (click)="go(-1)" aria-label="Mois précédent" data-testid="cal-prev">←</button>
          <h3 class="m-0 min-w-44 text-center text-xl capitalize" aria-live="polite" data-testid="cal-title">{{ title() }}</h3>
          <button type="button" class="btn btn-outline-dark" (click)="go(1)" aria-label="Mois suivant" data-testid="cal-next">→</button>
          <button type="button" class="btn btn-outline-dark" (click)="goToday()" data-testid="cal-today">Aujourd’hui</button>
        </div>
        @if (editable()) {
          <div class="flex items-center gap-2">
            <label for="cal-filter" class="font-semibold">Afficher</label>
            <select id="cal-filter" data-testid="cal-filter" (change)="filter.set($any($event.target).value)">
              @for (t of targets; track t.value) {
                <option [value]="t.value" [selected]="filter() === t.value">{{ t.label }}</option>
              }
            </select>
          </div>
        }
      </div>

      <ul class="m-0 flex list-none flex-wrap gap-2 p-0 text-sm" aria-label="Légende">
        @for (k of kinds; track k.id) {
          <li class="rounded-full px-3 py-1 font-semibold" [class]="chipClass(k.id)">{{ k.label }}</li>
        }
      </ul>

      <div class="overflow-x-auto rounded-xl border border-line bg-surface">
        <table class="w-full min-w-176 table-fixed border-collapse">
          <caption class="visually-hidden">Calendrier de {{ title() }}</caption>
          <thead>
            <tr>
              @for (d of weekdays; track d) {
                <th scope="col" class="border-b border-line p-2 text-sm font-semibold text-muted">{{ d }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (week of weeks(); track week[0].day) {
              <tr>
                @for (cell of week; track cell.day) {
                  <td class="h-28 border border-line p-1 align-top" [class.bg-page]="!cell.inMonth" data-testid="cal-cell">
                    <button
                      type="button"
                      class="day"
                      [class.today]="cell.day === today"
                      [class.out]="!cell.inMonth"
                      [attr.aria-pressed]="selected() === cell.day"
                      [attr.aria-label]="dayLabel(cell.day)"
                      [attr.data-day]="cell.day"
                      (click)="pick(cell.day)"
                    >{{ dayNumber(cell.day) }}</button>
                    @for (e of eventsByDay().get(cell.day)?.slice(0, 2) ?? []; track e.id) {
                      <p class="m-0 mt-0.5 truncate rounded px-1 text-xs font-semibold" [class]="chipClass(e.kind)" dir="auto" [attr.title]="e.title">
                        <span class="visually-hidden">{{ kindLabel(e.kind) }} : </span>{{ e.title }}
                      </p>
                    }
                    @if ((eventsByDay().get(cell.day)?.length ?? 0) > 2) {
                      <p class="m-0 mt-0.5 text-xs text-muted">+ {{ eventsByDay().get(cell.day)!.length - 2 }} autre(s)</p>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      <section class="grid gap-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="cal-day-title" data-testid="cal-day">
        <h4 id="cal-day-title" class="m-0 text-lg capitalize">{{ longDay(selected()) }}</h4>
        @if (dayEvents().length) {
          <ul class="m-0 grid list-none gap-3 p-0">
            @for (e of dayEvents(); track e.id) {
              <li class="grid gap-1 border-t border-line pt-3" data-testid="cal-event">
                <p class="m-0 flex flex-wrap items-center gap-2">
                  <span class="rounded-full px-3 py-0.5 text-sm font-semibold" [class]="chipClass(e.kind)">{{ kindLabel(e.kind) }}</span>
                  <span class="text-sm text-muted">{{ e.time || 'Toute la journée' }}</span>
                </p>
                <p class="m-0 text-lg font-semibold" dir="auto" data-testid="cal-event-title">{{ e.title }}</p>
                <p class="m-0 text-sm text-muted">
                  {{ audience(e.target) }}@if (e.subject) { · {{ subjectName(e.subject) }} } · <bdi dir="auto">{{ e.authorName }}</bdi>
                </p>
                @if (e.note) {
                  <p class="m-0 whitespace-pre-line" dir="auto">{{ e.note }}</p>
                }
                @if (editable()) {
                  <div class="flex gap-3">
                    <button type="button" class="btn btn-outline-dark" (click)="edit(e)" [attr.aria-label]="'Modifier ' + e.title" data-testid="cal-edit">Modifier</button>
                    <button type="button" class="btn btn-outline-dark" (click)="remove(e.id)" [attr.aria-label]="'Supprimer ' + e.title" data-testid="cal-delete">Supprimer</button>
                  </div>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="m-0 text-muted" data-testid="cal-empty">Rien de prévu ce jour-là.</p>
        }
      </section>

      @if (editable()) {
        <form class="grid gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onSave($event)" aria-label="Événement" data-testid="cal-form">
          <h4 class="m-0 text-lg">{{ editingId() ? 'Modifier l’événement' : 'Ajouter un événement' }} — <span class="capitalize">{{ longDay(selected()) }}</span></h4>
          <fieldset class="m-0 grid gap-2 border-0 p-0">
            <legend class="mb-1 p-0 font-semibold">Type</legend>
            <div class="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Type d’événement">
              @for (k of kinds; track k.id) {
                <button type="button" role="radio" class="choice" [attr.aria-checked]="model().kind === k.id" [attr.data-testid]="'kind-' + k.id" (click)="setKind(k.id)">{{ k.label }}</button>
              }
            </div>
          </fieldset>
          <div class="grid gap-1">
            <label for="ev-title" class="font-semibold">Titre</label>
            <input id="ev-title" type="text" [formField]="eventForm.title" [attr.aria-invalid]="attempted() && eventForm.title().invalid()" />
            <p class="err" role="alert">{{ attempted() ? (eventForm.title().errors()[0]?.message ?? '') : '' }}</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="grid gap-1">
              <label for="ev-date" class="font-semibold">Date</label>
              <input id="ev-date" type="date" [formField]="eventForm.date" data-testid="ev-date" />
            </div>
            <div class="grid gap-1">
              <label for="ev-time" class="font-semibold">Heure (facultatif)</label>
              <input id="ev-time" type="time" [formField]="eventForm.time" />
            </div>
            <div class="grid gap-1">
              <label for="ev-target" class="font-semibold">Pour</label>
              <select id="ev-target" [formField]="eventForm.target" data-testid="ev-target">
                @for (t of targets; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </div>
            <div class="grid gap-1">
              <label for="ev-subject" class="font-semibold">Matière</label>
              <select id="ev-subject" [formField]="eventForm.subject">
                <option value="">— Aucune —</option>
                @for (m of matieres; track m.id) {
                  <option [value]="m.id">{{ m.name }}</option>
                }
              </select>
            </div>
          </div>
          <div class="grid gap-1">
            <label for="ev-note" class="font-semibold">Détails (salle, programme…)</label>
            <textarea id="ev-note" [formField]="eventForm.note"></textarea>
          </div>
          @if (message(); as m) {
            <p class="m-0 rounded-lg px-3 py-2" [class]="ok() ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'" role="alert" data-testid="form-message">{{ m }}</p>
          }
          <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="cal-save">{{ editingId() ? 'Enregistrer' : 'Ajouter au calendrier' }}</button>
            @if (editingId()) {
              <button type="button" class="btn btn-outline-dark" (click)="cancel()">Annuler</button>
            }
          </div>
        </form>
      }
    </div>
  `,
  styles: [
    SPACE_STYLES,
    `
      .day { inline-size: 2rem; block-size: 2rem; border-radius: 999px; border: 0; background: transparent; font: inherit; font-weight: 600; color: var(--navy-900); cursor: pointer; }
      .day.out { color: var(--muted); font-weight: 400; }
      .day.today { box-shadow: inset 0 0 0 2px var(--gold-ink); }
      .day[aria-pressed='true'] { background: var(--navy-900); color: var(--cream); }
    `,
  ],
})
export class Calendar {
  readonly events = input.required<readonly CalendarEvent[]>();
  readonly editable = input(false);

  readonly #space = inject(SpaceService);
  protected readonly today = todayIso();
  protected readonly weekdays = WEEKDAYS;
  protected readonly kinds = EVENT_KINDS;
  protected readonly targets = TARGET_OPTIONS;
  protected readonly matieres = MATIERES;

  readonly #now = this.today.split('-').map(Number);
  protected readonly year = signal(this.#now[0]!);
  protected readonly month = signal(this.#now[1]!);
  protected readonly selected = signal(this.today);
  protected readonly filter = signal('all');

  protected readonly title = computed(() => monthTitle(this.year(), this.month()));
  protected readonly weeks = computed(() => monthGrid(this.year(), this.month()));

  readonly #visible = computed(() => (this.editable() ? eventsForTarget(this.events(), this.filter()) : this.events()));
  protected readonly eventsByDay = computed(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const e of this.#visible()) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
    for (const [day, list] of byDay) byDay.set(day, eventsOn(list, day));
    return byDay;
  });
  protected readonly dayEvents = computed(() => this.eventsByDay().get(this.selected()) ?? []);

  /* ---------------------------------------------------------------- the editing form */
  protected readonly editingId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly ok = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly attempted = signal(false);
  protected readonly model = linkedSignal(() => ({
    kind: 'exam' as EventKind,
    title: '',
    date: this.today,
    time: '',
    target: 'all',
    subject: '',
    note: '',
  }));
  protected readonly eventForm = form(this.model, (p) => {
    required(p.title, { message: 'Saisissez un titre.' });
    maxLength(p.title, LIMITS.title, { message: 'Titre trop long (120 caractères maximum).' });
    maxLength(p.note, LIMITS.comment, { message: 'Détails trop longs.' });
  });

  protected kindLabel = eventKindLabel;

  protected chipClass(kind: EventKind): string {
    return kind === 'exam' ? 'bg-warn-soft text-warn' : kind === 'activity' ? 'bg-ok-soft text-ok' : 'bg-navy-100 text-navy-700';
  }

  protected dayNumber(day: string): number {
    return Number(day.slice(8));
  }

  protected dayLabel(day: string): string {
    const n = this.eventsByDay().get(day)?.length ?? 0;
    return `${this.longDay(day)}${n ? `, ${n} événement${n > 1 ? 's' : ''}` : ''}`;
  }

  protected longDay(day: string): string {
    return FULL_DAY.format(new Date(`${day}T12:00:00Z`));
  }

  protected audience(target: string): string {
    return targetLabel(target);
  }

  protected subjectName(id: string): string {
    return matiereName(id);
  }

  protected go(delta: number): void {
    const next = shiftMonth(this.year(), this.month(), delta);
    this.year.set(next.year);
    this.month.set(next.month);
  }

  protected goToday(): void {
    this.year.set(this.#now[0]!);
    this.month.set(this.#now[1]!);
    this.selected.set(this.today);
  }

  protected pick(day: string): void {
    this.selected.set(day);
    if (!this.editingId()) this.model.update((m) => ({ ...m, date: day }));
  }

  protected setKind(kind: EventKind): void {
    this.model.update((m) => ({ ...m, kind }));
  }

  protected edit(e: CalendarEvent): void {
    this.editingId.set(e.id);
    this.model.set({ kind: e.kind, title: e.title, date: e.date, time: e.time, target: e.target, subject: e.subject, note: e.note });
    this.message.set(null);
  }

  protected cancel(): void {
    this.editingId.set(null);
    this.model.update((m) => ({ ...m, title: '', date: this.selected(), time: '', subject: '', note: '' }));
  }

  protected async remove(id: string): Promise<void> {
    await this.#space.deleteEvent(id).catch(() => undefined);
    if (this.editingId() === id) this.cancel();
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    const m = this.model();
    if (this.eventForm().invalid()) return;
    if (!isCalendarDay(m.date)) return this.#say('Choisissez une date.', false);
    if (!isClockTime(m.time)) return this.#say('Heure invalide.', false);
    this.busy.set(true);
    this.message.set(null);
    try {
      const existing = this.editingId();
      await this.#space.saveEvent({ kind: m.kind, title: m.title, date: m.date, time: m.time, target: m.target, subject: m.subject, note: m.note }, existing ?? undefined);
      this.attempted.set(false);
      this.selected.set(m.date);
      this.cancel();
      this.#say(existing ? 'Événement modifié.' : `Ajouté au ${formatDay(m.date)}.`, true);
    } catch (error) {
      this.#say(frenchError(error), false);
    } finally {
      this.busy.set(false);
    }
  }

  #say(text: string, ok: boolean): void {
    this.ok.set(ok);
    this.message.set(text);
  }
}
