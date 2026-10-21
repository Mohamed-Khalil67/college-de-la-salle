import { Component, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import {
  minutesOf,
  SECTION_LABELS,
  shiftTime,
  todayIso,
  type ClassDto,
  type TimetableBlockedError,
  type TimetableOccurrenceDto,
  type TimetableWriteResult,
} from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, EmptyState, Icon, Modal, Segmented, type SegmentOption } from '../../ui';
import { dayTitle } from '../../eleve/shared/format';
import { LoadState } from '../../eleve/shared/load-state';
import { shiftWeek, weekLabel } from '../../eleve/shared/week';
import { SessionDialog, type DialogPrefill, type SessionAction } from '../../timetable/session-dialog';
import { SessionItem } from '../../timetable/session-item';
import { TimetableApi } from '../../timetable/timetable-api';
import { gridRows, rangeOf, schoolDays, weekWindow } from '../../timetable/timetable-format';
import { ConflictsPanel, type PanelFix, type RoomFix } from './conflicts-panel';
import { NewSlotDialog, type NewSlotDefaults } from './new-slot-dialog';
import { type CellRef, type DropRef, type GridView, WeekGrid } from './week-grid';

const VIEWS: readonly SegmentOption[] = [
  { value: 'class', label: 'Par classe' },
  { value: 'teacher', label: 'Par enseignant' },
  { value: 'room', label: 'Par salle' },
];

const ENTITY_LABEL: Readonly<Record<GridView, string>> = { class: 'Classe', teacher: 'Enseignant', room: 'Salle' };

/**
 * The administration's week editor: the timetable of a class, a teacher or a room as an ARIA grid. Every
 * action works from the keyboard (a cell opens its dialog: change, « Déplacer… », other room, cancel, add),
 * conflicts show in the « Conflits (n) » panel with one-click fixes, and warnings are announced.
 */
@Component({
  selector: 'app-timetable-editor-page',
  imports: [
    Alert,
    Button,
    ConflictsPanel,
    EmptyState,
    Icon,
    LoadState,
    Modal,
    NewSlotDialog,
    Segmented,
    SessionDialog,
    SessionItem,
    WeekGrid,
  ],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Emploi du temps</h1>
        <p class="t-muted" aria-live="polite">{{ label() }}</p>
      </div>
      <div class="page__actions">
        <button cdlsButton variant="secondary" size="sm" type="button" (click)="move(-1)">
          <cdls-icon name="chevron-left" />Semaine précédente
        </button>
        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="day.set(today)">Cette semaine</button>
        <button cdlsButton variant="secondary" size="sm" type="button" (click)="move(1)">
          Semaine suivante<cdls-icon name="chevron-right" />
        </button>
        <button cdlsButton size="sm" type="button" (click)="add(null)"><cdls-icon name="plus" />Ajouter une séance</button>
      </div>
    </div>

    <div class="tt-controls">
      <cdls-segmented legend="Afficher l’emploi du temps" [options]="views" [value]="view()" (valueChange)="setView($event)" />
      <div class="tt-entity">
        <label class="field__label" for="tt-entity">{{ entityLabel() }}</label>
        <select id="tt-entity" class="field__control" [value]="entityId()" (change)="entityId.set($any($event.target).value)">
          @for (o of options(); track o.value) {
            <option [value]="o.value" [selected]="o.value === entityId()">{{ o.label }}</option>
          }
        </select>
      </div>
    </div>

    <div class="visually-hidden" role="status" aria-live="polite">{{ announcement() }}</div>
    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }
    @if (failure()) {
      <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
    }

    <app-load-state [ref]="week" label="Chargement de la semaine…" />
    @if (!entityId()) {
      <cdls-empty-state
        title="Rien à afficher"
        description="Créez d’abord des classes, des enseignants et des salles : l’emploi du temps se construit à partir d’eux."
        icon="calendar"
      />
    } @else if (week.hasValue()) {
      <div class="tt-layout">
        <app-week-grid
          [days]="days()"
          [rows]="rows()"
          [sessions]="sessions()"
          [view]="view()"
          [warned]="warned()"
          [today]="today"
          [label]="gridLabel()"
          (activate)="openCell($event)"
          (dropped)="dropSession($event)"
        />
        <app-conflicts-panel
          [conflicts]="attempt()?.conflicts ?? []"
          [warnings]="storedWarnings()"
          [locate]="locate"
          (fix)="fix($event)"
          (applyRoom)="applyRoom($event)"
        />
      </div>
    }

    <cdls-modal [title]="cellTitle()" [(open)]="cellOpen">
      @if (cell(); as c) {
        @if (c.sessions.length) {
          <ul class="cell-list" role="list">
            @for (s of c.sessions; track s.key) {
              <li class="cell-item">
                <app-session-item [session]="s" [showTeacher]="view() !== 'teacher'" [showClass]="view() !== 'class'" />
                @if (s.canChange) {
                  <div class="cell-item__actions">
                    <button cdlsButton variant="secondary" size="sm" type="button" (click)="act(s, null)">Modifier…</button>
                    <button cdlsButton variant="secondary" size="sm" type="button" (click)="act(s, 'move')">Déplacer…</button>
                    <button cdlsButton variant="secondary" size="sm" type="button" (click)="act(s, 'room')">Changer de salle</button>
                    <button cdlsButton variant="secondary" size="sm" type="button" (click)="act(s, 'cancel')">Annuler la séance…</button>
                    @if (s.exceptionId) {
                      <button cdlsButton variant="tertiary" size="sm" type="button" (click)="restore(s)">Rétablir</button>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        } @else {
          <p>Aucune séance sur ce créneau.</p>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="cellOpen.set(false)">Fermer</button>
          <button cdlsButton type="button" (click)="add(c)">Ajouter une séance ici</button>
        </div>
      }
    </cdls-modal>

    <app-session-dialog
      [(open)]="sessionOpen"
      [session]="selected()"
      [staff]="true"
      [preset]="preset()"
      [prefill]="prefill()"
      (saved)="saved($event)"
      (blocked)="attempt.set($event)"
    />
    <app-new-slot-dialog
      [(open)]="newOpen"
      [defaults]="newDefaults()"
      [classes]="classes()"
      [years]="years()"
      (saved)="saved($event)"
      (blocked)="attempt.set($event)"
    />
  `,
  styles: `
    .tt-controls {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      align-items: end;
      margin-bottom: var(--space-4);
    }
    .tt-entity {
      display: grid;
      gap: var(--space-1);
      min-width: 16rem;
    }
    .tt-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    @media (min-width: 80rem) {
      .tt-layout {
        grid-template-columns: minmax(0, 1fr) 20rem;
      }
    }
    .cell-list {
      display: grid;
      gap: var(--space-4);
      margin: 0 0 var(--space-4);
      padding: 0;
      list-style: none;
    }
    .cell-item {
      display: grid;
      gap: var(--space-2);
    }
    .cell-item__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class TimetableEditorPage {
  readonly #client = inject(ApiClient);
  readonly #api = inject(TimetableApi);

  protected readonly views = VIEWS;
  protected readonly today = todayIso();
  protected readonly day = signal(this.today);
  protected readonly label = computed(() => weekLabel(this.day()));
  protected readonly view = signal<GridView>('class');
  protected readonly entityId = signal('');
  protected readonly entityLabel = computed(() => ENTITY_LABEL[this.view()]);

  /* What the selectors offer */
  readonly #years = resource({ loader: () => this.#client.school.years() });
  protected readonly years = computed(() => (this.#years.hasValue() ? this.#years.value() : []));
  readonly #classes = resource({
    params: () => this.years().find((y) => y.isCurrent)?.id,
    loader: ({ params }) => this.#client.school.classes({ schoolYearId: params }),
  });
  protected readonly classes = computed<readonly ClassDto[]>(() => (this.#classes.hasValue() ? this.#classes.value() : []));
  readonly #assignments = resource({ loader: () => this.#client.school.assignments() });
  readonly #rooms = resource({ loader: () => this.#api.rooms() });

  protected readonly options = computed<{ value: string; label: string }[]>(() => {
    switch (this.view()) {
      case 'class':
        return this.classes().map((c) => ({ value: c.id, label: `${c.label} (${SECTION_LABELS[c.sectionCode]})` }));
      case 'teacher': {
        const map = new Map((this.#assignments.hasValue() ? this.#assignments.value() : []).map((a) => [a.teacherId, a.teacherName]));
        return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      }
      case 'room':
        return (this.#rooms.hasValue() ? this.#rooms.value() : []).map((r) => ({ value: r.id, label: r.name }));
    }
  });

  /* The week */
  readonly #query = computed(() => {
    const id = this.entityId();
    if (!id) return undefined;
    const key = { class: 'classId', teacher: 'teacherId', room: 'roomId' }[this.view()];
    return { ...weekWindow(this.day()), [key]: id };
  });
  protected readonly week = resource({ params: () => this.#query(), loader: ({ params }) => this.#api.occurrences(params) });
  readonly #warnings = resource({ params: () => this.#query(), loader: ({ params }) => this.#api.warnings(params) });
  protected readonly sessions = computed(() => (this.week.hasValue() ? this.week.value() : []));
  protected readonly storedWarnings = computed(() => (this.#warnings.hasValue() ? this.#warnings.value() : []));
  protected readonly warned = computed(() => new Set(this.storedWarnings().map((w) => w.slotId)));
  protected readonly days = computed(() => schoolDays(this.day()));
  protected readonly rows = computed(() => gridRows(this.sessions()));
  protected readonly gridLabel = computed(
    () => `Emploi du temps, ${this.entityLabel().toLowerCase()} ${this.options().find((o) => o.value === this.entityId())?.label ?? ''}, ${this.label().toLowerCase()}`,
  );

  /** The clashes of the last refused save, until the next save goes through. */
  protected readonly attempt = signal<TimetableBlockedError | null>(null);
  protected readonly notice = signal('');
  protected readonly failure = signal<string | null>(null);
  protected readonly announcement = computed(() => {
    const n = (this.attempt()?.conflicts.length ?? 0) + this.storedWarnings().length;
    return n ? `Conflits : ${n} à examiner.` : 'Aucun conflit.';
  });

  /* Dialogs */
  protected readonly cell = signal<CellRef | null>(null);
  protected readonly cellOpen = signal(false);
  protected readonly cellTitle = computed(() => {
    const c = this.cell();
    return c ? `${dayTitle(c.day)}, ${rangeOf({ startTime: c.band.start, endTime: c.band.end })}` : 'Créneau';
  });
  protected readonly selected = signal<TimetableOccurrenceDto | null>(null);
  protected readonly sessionOpen = signal(false);
  protected readonly preset = signal<SessionAction | null>(null);
  protected readonly prefill = signal<DialogPrefill | null>(null);
  protected readonly newOpen = signal(false);
  protected readonly newDefaults = signal<NewSlotDefaults>({ weekday: 0, startTime: '08:00', endTime: '09:00' });

  constructor() {
    // The first class (or teacher, or room) until the person chooses.
    effect(() => {
      const options = this.options();
      untracked(() => {
        if (!options.some((o) => o.value === this.entityId())) this.entityId.set(options[0]?.value ?? '');
      });
    });
    // Another week or another entity: the old refusal no longer applies.
    effect(() => {
      this.#query();
      untracked(() => this.attempt.set(null));
    });
  }

  protected setView(value: string | null): void {
    if (value === 'class' || value === 'teacher' || value === 'room') {
      this.view.set(value);
      this.entityId.set('');
    }
  }

  protected move(weeks: number): void {
    this.day.update((d) => shiftWeek(d, weeks));
  }

  protected openCell(cell: CellRef): void {
    this.cell.set(cell);
    this.cellOpen.set(true);
  }

  /** Closes the cell's dialog, then opens the next one (so focus returns to the cell between the two). */
  #then(open: () => void): void {
    this.cellOpen.set(false);
    setTimeout(open, 0);
  }

  protected act(session: TimetableOccurrenceDto, preset: SessionAction | null): void {
    this.#then(() => this.edit(session, preset, null));
  }

  protected edit(session: TimetableOccurrenceDto, preset: SessionAction | null, prefill: DialogPrefill | null): void {
    this.notice.set('');
    this.failure.set(null);
    this.selected.set(session);
    this.preset.set(preset);
    this.prefill.set(prefill);
    this.sessionOpen.set(true);
  }

  protected add(cell: CellRef | null): void {
    const wd = cell ? new Date(`${cell.day}T12:00:00Z`).getUTCDay() : 0;
    this.newDefaults.set({
      classId: this.view() === 'class' ? this.entityId() : undefined,
      weekday: wd,
      startTime: cell?.band.start ?? '08:00',
      endTime: cell?.band.end ?? '09:00',
    });
    this.notice.set('');
    this.#then(() => this.newOpen.set(true));
  }

  /** A session dropped on another cell: open « Déplacer… » there (the form stays the way to confirm). */
  protected dropSession(drop: DropRef): void {
    const s = drop.session;
    if (!s.canChange) return;
    const length = minutesOf(s.current.endTime) - minutesOf(s.current.startTime);
    this.edit(s, 'move', { date: drop.day, startTime: drop.band.start, endTime: shiftTime(drop.band.start, length) });
  }

  protected saved(result: TimetableWriteResult): void {
    this.attempt.set(null);
    this.notice.set(
      result.warnings.length
        ? 'Enregistré, avec des avertissements acceptés : leurs motifs sont gardés dans le journal.'
        : 'Modification enregistrée.',
    );
    this.week.reload();
    this.#warnings.reload();
  }

  protected async restore(session: TimetableOccurrenceDto): Promise<void> {
    if (!session.exceptionId) return;
    this.cellOpen.set(false);
    try {
      await this.#api.removeException(session.exceptionId);
      this.notice.set('La séance est rétablie comme prévu dans l’emploi du temps.');
      this.week.reload();
      this.#warnings.reload();
    } catch (error) {
      this.failure.set(apiMessage(error));
    }
  }

  /* Fixes of the « Conflits » panel */

  /** Finds the session behind an issue: on the displayed week, or by asking for its class on that day. */
  protected readonly locate = async (slotId: string, date: string): Promise<TimetableOccurrenceDto | null> => {
    const local = this.sessions().find((s) => s.slotId === slotId && s.status !== 'moved_from' && (s.originalDate === date || s.current.date === date));
    if (local) return local;
    try {
      const slot = await this.#api.slot(slotId);
      const list = await this.#api.occurrences({ classId: slot.classId, from: date, to: date });
      return list.find((s) => s.slotId === slotId && s.status !== 'moved_from') ?? null;
    } catch {
      return null;
    }
  };

  protected async fix(fix: PanelFix): Promise<void> {
    const session = await this.locate(fix.slotId, fix.date);
    if (!session) {
      this.failure.set('Cette séance est introuvable : elle a peut-être déjà changé. Actualisez la semaine.');
      return;
    }
    this.edit(session, fix.kind === 'move' ? 'move' : 'cancel', null);
  }

  protected async applyRoom(fix: RoomFix): Promise<void> {
    this.notice.set('');
    this.failure.set(null);
    try {
      const result = await this.#api.addException(fix.session.slotId, {
        date: fix.session.originalDate,
        kind: 'room_change',
        newRoomId: fix.roomId,
        reason: 'Salle changée depuis le panneau des conflits',
      });
      this.saved(result);
    } catch (error) {
      const message = apiMessage(error);
      // A refusal because of a warning or a clash: open the dialog, which can explain and accept it.
      this.edit(fix.session, 'room', null);
      this.failure.set(message);
    }
  }
}
