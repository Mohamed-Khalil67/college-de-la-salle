import { Component, DOCUMENT, computed, inject, resource, signal } from '@angular/core';
import { type EventDto, type OccurrenceDto, todayIso } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { Alert, Button, Icon, Modal } from '../../../shared/ui';
import { EventDetails } from '../../../shared/components/event-details';
import { LoadState } from '../../../shared/components/load-state';
import { WeekView } from '../../../shared/components/week-view';
import { shiftWeek, weekLabel, weekRange } from '../../../shared/utils/week';
import { teacherAssignments } from '../../../shared/data/teacher-data';
import { EventForm } from './event-form';

/** The teacher's week: events of their classes plus school-wide ones; create, edit and delete their own. */
@Component({
  selector: 'app-agenda-page',
  imports: [Alert, Button, Icon, Modal, EventDetails, LoadState, WeekView, EventForm],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1" id="agenda-title" tabindex="-1">Agenda</h1>
        <p class="t-muted" aria-live="polite">{{ label() }}</p>
      </div>
      <div class="page__actions">
        <button cdlsButton variant="secondary" size="sm" type="button" (click)="move(-1)"><cdls-icon name="chevron-left" />Semaine précédente</button>
        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="day.set(today)">Cette semaine</button>
        <button cdlsButton variant="secondary" size="sm" type="button" (click)="move(1)">Semaine suivante<cdls-icon name="chevron-right" /></button>
        <button cdlsButton size="sm" type="button" (click)="create()"><cdls-icon name="plus" />Nouvel événement</button>
      </div>
    </div>

    <div class="field field--inline agenda-filter">
      <label class="field__label" for="agenda-classe">Afficher</label>
      <select class="field__control" id="agenda-classe" (change)="classId.set($any($event.target).value)">
        <option value="">Toutes mes classes</option>
        @for (c of classOptions(); track c.id) {
          <option [value]="c.id" [selected]="c.id === classId()">{{ c.label }}</option>
        }
      </select>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }
    <app-load-state [ref]="week" label="Chargement de la semaine…" />
    @if (week.hasValue()) {
      <app-week-view [day]="day()" [occurrences]="visible()" [today]="today" (open)="show($event)" />
    }

    <app-event-details [occurrence]="selected()" [(open)]="detailsOpen">
      @if (mine()) {
        <button cdlsButton variant="danger" type="button" (click)="askDelete()">Supprimer</button>
        <button cdlsButton variant="secondary" type="button" (click)="edit()"><cdls-icon name="edit" />Modifier</button>
      }
    </app-event-details>

    <cdls-modal [title]="editing() ? 'Modifier l’événement' : 'Nouvel événement'" [(open)]="formOpen">
      @if (formOpen() && assignments.hasValue()) {
        <app-event-form [event]="editing()" [assignments]="assignments.value()" [day]="formDay()" (saved)="onSaved($event)" (cancelled)="formOpen.set(false)" />
      }
    </cdls-modal>

    <cdls-modal title="Supprimer l’événement ?" [(open)]="deleteOpen" (closed)="afterDelete()">
      <div class="stack stack--sm">
        <p>« {{ selected()?.event?.title }} » disparaîtra de l’agenda des élèves{{ selected()?.event?.repeatUntil ? ', pour toutes les semaines' : '' }}.</p>
        @if (deleteError()) {
          <cdls-alert tone="danger">{{ deleteError() }}</cdls-alert>
        }
      </div>
      <div class="modal__footer">
        <button cdlsButton variant="secondary" type="button" (click)="deleteOpen.set(false)">Annuler</button>
        <button cdlsButton variant="danger" type="button" (click)="remove()">{{ deleting() ? 'Suppression…' : 'Supprimer' }}</button>
      </div>
    </cdls-modal>
  `,
  styles: `
    .agenda-filter {
      max-width: 22rem;
      margin-bottom: var(--space-6);
    }
  `,
})
export class AgendaPage {
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #document = inject(DOCUMENT);
  #deleted = false;
  protected readonly today = todayIso();
  protected readonly day = signal(this.today);
  protected readonly classId = signal('');
  protected readonly label = computed(() => weekLabel(this.day()));
  protected readonly isThisWeek = computed(() => weekRange(this.day()).from === weekRange(this.today).from);

  protected readonly assignments = teacherAssignments();
  protected readonly classOptions = computed(() => {
    const list = this.assignments.hasValue() ? this.assignments.value() : [];
    const unique = new Map(list.map((a) => [a.classId, a.classLabel]));
    return [...unique].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  });

  protected readonly week = resource({
    params: () => ({ ...weekRange(this.day()), classId: this.classId() || undefined }),
    loader: ({ params }) => this.#api.calendar.occurrences(params),
  });
  /** Without a class filter: the teacher's own events, their classes' events and school or section-wide ones. */
  protected readonly visible = computed(() => {
    const list = this.week.hasValue() ? this.week.value() : [];
    if (this.classId()) return list;
    const mine = new Set(this.classOptions().map((c) => c.id));
    const teacherId = this.#auth.user()?.teacherId;
    return list.filter((o) => o.event.authorId === teacherId || !o.event.classId || mine.has(o.event.classId));
  });

  protected readonly selected = signal<OccurrenceDto | null>(null);
  protected readonly detailsOpen = signal(false);
  protected readonly mine = computed(() => {
    const e = this.selected()?.event;
    return !!e && e.authorId === this.#auth.user()?.teacherId;
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<EventDto | null>(null);
  protected readonly formDay = signal(this.today);
  protected readonly notice = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected move(weeks: number): void {
    this.day.update((d) => shiftWeek(d, weeks));
  }

  protected show(item: OccurrenceDto): void {
    this.selected.set(item);
    this.detailsOpen.set(true);
  }

  protected create(): void {
    this.editing.set(null);
    this.formDay.set(this.day() < this.today && this.isThisWeek() ? this.today : this.day());
    this.formOpen.set(true);
  }

  protected edit(): void {
    const e = this.selected()?.event;
    if (!e) return;
    this.detailsOpen.set(false);
    this.editing.set(e);
    this.formOpen.set(true);
  }

  protected onSaved(event: EventDto): void {
    this.notice.set(`« ${event.title} » est enregistré dans l’agenda.`);
    this.formOpen.set(false);
    this.day.set(event.date);
    this.week.reload();
  }

  protected askDelete(): void {
    this.deleteError.set(null);
    this.detailsOpen.set(false);
    this.deleteOpen.set(true);
  }

  /** The deleted event's button is gone: focus moves to the page title instead. */
  protected afterDelete(): void {
    if (!this.#deleted) return;
    this.#deleted = false;
    // After the dialog has handed focus back to its (now removed) opener.
    this.#document.defaultView?.setTimeout(() => this.#document.getElementById('agenda-title')?.focus(), 0);
  }

  protected async remove(): Promise<void> {
    const e = this.selected()?.event;
    if (!e || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.#api.calendar.remove(e.id);
      this.#deleted = true;
      this.week.update((list) => list?.filter((o) => o.event.id !== e.id));
      this.deleteOpen.set(false);
      this.notice.set(`« ${e.title} » est supprimé de l’agenda.`);
    } catch (error) {
      this.deleteError.set(`L’événement n’a pas été supprimé. ${apiMessage(error)}`);
    } finally {
      this.deleting.set(false);
    }
  }
}
