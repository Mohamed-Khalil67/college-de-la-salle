import { Component, computed, effect, inject, input, linkedSignal, model, output, resource, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import {
  type AcknowledgedWarning,
  exceptionProblems,
  type SlotExceptionInput,
  type SlotScope,
  SLOT_SCOPE_LABELS,
  slotProblems,
  type TimetableBlockedError,
  type TimetableOccurrenceDto,
  type TimetableSlotInput,
  type TimetableWarningCode,
  type TimetableWriteResult,
  WEEK_PARITIES,
  WEEKDAY_LABELS,
  SCHOOL_WEEKDAYS,
} from '@cdls/shared';
import { ApiClient, apiMessage } from '../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../ui';
import { BlockedNotice } from './blocked-notice';
import { FreeRooms } from './free-rooms';
import { blockedOf, TimetableApi } from './timetable-api';
import { sessionSummary } from './timetable-format';

export type SessionAction = 'cancel' | 'move' | 'room' | 'substitute' | 'edit' | 'end';

export interface DialogPrefill {
  readonly date?: string;
  readonly startTime?: string;
  readonly endTime?: string;
}

interface ChangeModel {
  newDate: string;
  newStart: string;
  newEnd: string;
  roomId: string;
  teacherId: string;
  reason: string;
  weekday: string;
  startTime: string;
  endTime: string;
  weekParity: string;
  division: string;
}

let nextId = 0;

/**
 * « Cette séance / Celle-ci et les suivantes / Toute la série »: changes one session of the timetable
 * (cancel, move, other room, substitute) or the whole series. A teacher has the first scope only, for
 * their own sessions; the administration has all three. A refused save shows the clashes (room, teacher,
 * class) with free rooms to pick from, and the warnings to accept with a reason each.
 */
@Component({
  selector: 'app-session-dialog',
  imports: [Alert, BlockedNotice, Button, Field, FieldControl, FormField, FreeRooms, Modal],
  template: `
    <cdls-modal title="Modifier la séance" [(open)]="open" [dismissible]="!busy()">
      @if (session(); as s) {
        <form class="stack stack--sm" novalidate (submit)="submit($event)">
          <p class="t-body-s">{{ summary() }}</p>

          <fieldset class="choice">
            <legend>Quelles séances modifier ?</legend>
            @for (option of scopes; track option.value) {
              <label class="choice__item">
                <input
                  type="radio"
                  [name]="uid + '-scope'"
                  [value]="option.value"
                  [checked]="scope() === option.value"
                  [disabled]="option.value !== 'this' && !staff()"
                  [attr.aria-describedby]="option.value !== 'this' && !staff() ? uid + '-staff' : null"
                  (change)="setScope(option.value)"
                />
                <span>{{ option.label }}</span>
              </label>
            }
            @if (!staff()) {
              <p class="t-body-s t-muted" [id]="uid + '-staff'">
                Changer une série entière est réservé à l’administration : demandez-lui de le faire.
              </p>
            }
          </fieldset>

          <fieldset class="choice">
            <legend>Que faire ?</legend>
            @for (option of actions(); track option.value) {
              <label class="choice__item">
                <input
                  type="radio"
                  [name]="uid + '-action'"
                  [value]="option.value"
                  [checked]="action() === option.value"
                  (change)="setAction(option.value)"
                />
                <span>{{ option.label }}</span>
              </label>
            }
          </fieldset>

          @switch (action()) {
            @case ('move') {
              <div class="grid-2 grid-2--tight">
                <cdls-field label="Nouveau jour">
                  <input cdlsControl type="date" [formField]="changeForm.newDate" />
                </cdls-field>
                <span></span>
                <cdls-field label="Début">
                  <input cdlsControl type="time" [formField]="changeForm.newStart" />
                </cdls-field>
                <cdls-field label="Fin">
                  <input cdlsControl type="time" [formField]="changeForm.newEnd" />
                </cdls-field>
              </div>
            }
            @case ('room') {
              <cdls-field label="Nouvelle salle" helper="Choisissez une salle libre ci-dessous, ou dans la liste.">
                <select cdlsControl [formField]="changeForm.roomId">
                  <option value="">Choisir…</option>
                  @for (room of rooms(); track room.id) {
                    <option [value]="room.id">{{ room.name }}</option>
                  }
                </select>
              </cdls-field>
              <app-free-rooms
                [date]="s.current.date"
                [startTime]="s.current.startTime"
                [endTime]="s.current.endTime"
                [classId]="s.classId"
                [ignoreSlotId]="s.slotId"
                [selected]="model().roomId || null"
                (pick)="chooseRoom($event)"
              />
            }
            @case ('substitute') {
              <cdls-field label="Enseignant qui remplace">
                <select cdlsControl [formField]="changeForm.teacherId">
                  <option value="">Choisir…</option>
                  @for (teacher of teachers(); track teacher.id) {
                    <option [value]="teacher.id">{{ teacher.name }}</option>
                  }
                </select>
              </cdls-field>
            }
            @case ('edit') {
              <div class="grid-2 grid-2--tight">
                <cdls-field label="Jour">
                  <select cdlsControl [formField]="changeForm.weekday">
                    @for (wd of weekdays; track wd.value) {
                      <option [value]="wd.value">{{ wd.label }}</option>
                    }
                  </select>
                </cdls-field>
                <cdls-field label="Salle">
                  <select cdlsControl [formField]="changeForm.roomId">
                    <option value="">Aucune salle</option>
                    @for (room of rooms(); track room.id) {
                      <option [value]="room.id">{{ room.name }}</option>
                    }
                  </select>
                </cdls-field>
                <cdls-field label="Début">
                  <input cdlsControl type="time" [formField]="changeForm.startTime" />
                </cdls-field>
                <cdls-field label="Fin">
                  <input cdlsControl type="time" [formField]="changeForm.endTime" />
                </cdls-field>
                <cdls-field label="Rythme">
                  <select cdlsControl [formField]="changeForm.weekParity">
                    <option value="">Chaque semaine</option>
                    @for (p of parities; track p) {
                      <option [value]="p">Une semaine sur deux (semaine {{ p }})</option>
                    }
                  </select>
                </cdls-field>
                <cdls-field label="Division des groupes" helper="Vide : toute la classe.">
                  <input cdlsControl type="text" autocomplete="off" [formField]="changeForm.division" />
                </cdls-field>
              </div>
            }
            @case ('end') {
              <p class="t-body-s">
                {{
                  scope() === 'all'
                    ? 'La série s’arrête aujourd’hui. Les séances déjà passées restent dans l’emploi du temps.'
                    : 'La série s’arrête la veille de cette séance. Les séances déjà passées restent dans l’emploi du temps.'
                }}
              </p>
            }
          }

          @if (action() === 'cancel' || action() === 'move' || action() === 'room' || action() === 'substitute') {
            <cdls-field label="Motif" helper="Facultatif : les élèves le voient.">
              <input cdlsControl type="text" autocomplete="off" [formField]="changeForm.reason" />
            </cdls-field>
          }

          @if (failure()) {
            <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
          }

          <app-blocked-notice [conflicts]="conflicts()" [warnings]="warnings()" [(reasons)]="reasons" />

          <div class="modal__footer">
            <button cdlsButton variant="secondary" type="button" [disabled]="busy()" (click)="open.set(false)">Fermer</button>
            <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : submitLabel() }}</button>
          </div>
        </form>
      }
    </cdls-modal>
  `,
  styles: `
    .choice {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
      display: grid;
      gap: var(--space-2);
    }
    .choice legend {
      padding: 0;
      margin-bottom: var(--space-2);
      font-weight: 600;
      color: var(--color-heading);
    }
    .choice__item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 2.75rem;
    }
    .choice__item input {
      width: 1.25rem;
      height: 1.25rem;
      accent-color: var(--color-primary);
    }
    .choice__item input:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
  `,
})
export class SessionDialog {
  readonly open = model(false);
  readonly session = input<TimetableOccurrenceDto | null>(null);
  /** The administration (admin, coordinator): all three scopes and every kind of change. */
  readonly staff = input(false);
  /** What to offer first (the fixes of the « Conflits » panel). */
  readonly preset = input<SessionAction | null>(null);
  readonly prefill = input<DialogPrefill | null>(null);
  readonly saved = output<TimetableWriteResult>();
  /** A refused save: the parent keeps it for its « Conflits » panel. */
  readonly blocked = output<TimetableBlockedError>();

  protected readonly uid = `session-dialog-${++nextId}`;
  protected readonly scopes = (['this', 'following', 'all'] as const).map((value) => ({ value, label: SLOT_SCOPE_LABELS[value] }));
  protected readonly weekdays = SCHOOL_WEEKDAYS.map((value) => ({ value: String(value), label: WEEKDAY_LABELS[value]! }));
  protected readonly parities = WEEK_PARITIES;

  readonly #api = inject(TimetableApi);
  readonly #client = inject(ApiClient);

  protected readonly scope = signal<SlotScope>('this');
  protected readonly action = signal<SessionAction>('cancel');
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly conflicts = signal<TimetableBlockedError['conflicts']>([]);
  protected readonly warnings = signal<TimetableBlockedError['warnings']>([]);
  protected readonly reasons = signal<Partial<Record<TimetableWarningCode, string>>>({});

  protected readonly summary = computed(() => {
    const s = this.session();
    return s ? sessionSummary(s, true) : '';
  });

  protected readonly rooms = computed(() => (this.#rooms.hasValue() ? this.#rooms.value().filter((r) => r.active) : []));
  readonly #rooms = resource({ params: () => (this.open() ? true : undefined), loader: () => this.#api.rooms() });

  /** Every teacher, for a replacement (from the teaching assignments). */
  readonly #teachers = resource({
    params: () => (this.open() && this.staff() ? true : undefined),
    loader: () => this.#client.school.assignments(),
  });
  protected readonly teachers = computed(() => {
    if (!this.#teachers.hasValue()) return [];
    const map = new Map(this.#teachers.value().map((a) => [a.teacherId, a.teacherName]));
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  });

  /** The slot's own fields, for « modifier la série ». */
  readonly #slot = resource({
    params: () => {
      const s = this.session();
      return this.open() && this.staff() && s && this.scope() !== 'this' ? s.slotId : undefined;
    },
    loader: ({ params }) => this.#api.slot(params),
  });

  protected readonly actions = computed<{ value: SessionAction; label: string }[]>(() => {
    if (this.scope() !== 'this')
      return [
        { value: 'edit', label: 'Modifier la série (jour, heure, salle, rythme…)' },
        { value: 'end', label: 'Mettre fin à la série' },
      ];
    const list: { value: SessionAction; label: string }[] = [
      { value: 'cancel', label: 'Annuler la séance' },
      { value: 'move', label: 'Déplacer…' },
      { value: 'room', label: 'Changer de salle' },
    ];
    if (this.staff()) list.push({ value: 'substitute', label: 'Remplacer l’enseignant' });
    return list;
  });

  protected readonly model = linkedSignal<ChangeModel>(() => {
    const s = this.session();
    const slot = this.#slot.hasValue() ? this.#slot.value() : null;
    const pre = this.prefill();
    return {
      newDate: pre?.date ?? s?.current.date ?? '',
      newStart: pre?.startTime ?? s?.current.startTime ?? '',
      newEnd: pre?.endTime ?? s?.current.endTime ?? '',
      roomId: slot ? (slot.roomId ?? '') : '',
      teacherId: '',
      reason: '',
      weekday: String(slot?.weekday ?? 0),
      startTime: slot?.startTime ?? s?.original.startTime ?? '',
      endTime: slot?.endTime ?? s?.original.endTime ?? '',
      weekParity: slot?.weekParity ?? '',
      division: slot?.division ?? '',
    };
  });
  protected readonly changeForm = form(this.model);

  protected readonly submitLabel = computed(() => (this.warnings().length ? 'Enregistrer avec ces avertissements' : 'Enregistrer'));

  constructor() {
    // Each time the dialog opens on a session: scope this, the preset (or cancel), nothing left over.
    effect(() => {
      const isOpen = this.open();
      const s = this.session();
      const preset = this.preset();
      if (!isOpen || !s) return;
      untracked(() => {
        this.scope.set('this');
        this.action.set(preset ?? 'cancel');
        this.failure.set(null);
        this.conflicts.set([]);
        this.warnings.set([]);
        this.reasons.set({});
      });
    });
  }

  protected setScope(scope: SlotScope): void {
    this.scope.set(scope);
    this.action.set(scope === 'this' ? 'cancel' : 'edit');
    this.clearVerdict();
  }

  protected setAction(action: SessionAction): void {
    this.action.set(action);
    this.clearVerdict();
  }

  protected chooseRoom(id: string): void {
    this.model.update((m) => ({ ...m, roomId: id }));
    this.clearVerdict();
  }

  private clearVerdict(): void {
    this.failure.set(null);
    this.conflicts.set([]);
    this.warnings.set([]);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const s = this.session();
    if (!s || this.busy()) return;
    this.failure.set(null);
    const acknowledged = this.acknowledged();
    this.busy.set(true);
    try {
      const result = await this.send(s, acknowledged);
      if (result) {
        this.open.set(false);
        this.saved.emit(result);
      }
    } catch (error) {
      const blocked = blockedOf(error);
      if (blocked) {
        this.conflicts.set(blocked.conflicts);
        this.warnings.set(blocked.warnings);
        if (blocked.conflicts.length) this.failure.set(null);
        this.blocked.emit(blocked);
      } else {
        this.failure.set(apiMessage(error));
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** The warnings the person accepted: those shown, with a reason typed. */
  private acknowledged(): AcknowledgedWarning[] {
    const reasons = this.reasons();
    return this.warnings()
      .map((w) => ({ code: w.code, reason: (reasons[w.code] ?? '').trim() }))
      .filter((a) => a.reason.length > 0);
  }

  private async send(s: TimetableOccurrenceDto, acknowledgedWarnings: AcknowledgedWarning[]): Promise<TimetableWriteResult | null> {
    const m = this.model();
    const action = this.action();
    const scope = this.scope();
    if (scope === 'this') {
      const exception = this.exceptionOf(action, m, s);
      if (!exception) return null;
      const problems = exceptionProblems(exception);
      if (problems.length) {
        this.failure.set(problems[0]!);
        return null;
      }
      return this.#api.addException(s.slotId, { ...exception, date: s.originalDate, acknowledgedWarnings });
    }
    if (action === 'end') return this.#api.deleteSlot(s.slotId, scope, s.originalDate);
    const slot = this.#slot.hasValue() ? this.#slot.value() : null;
    if (!slot) {
      this.failure.set('La série n’est pas encore chargée : réessayez dans un instant.');
      return null;
    }
    const changes = this.changesOf(m, slot);
    if (!Object.keys(changes).length) {
      this.failure.set('Rien n’a changé : modifiez au moins un champ.');
      return null;
    }
    const problems = slotProblems({ ...slot, ...changes });
    if (problems.length) {
      this.failure.set(problems[0]!);
      return null;
    }
    return this.#api.updateSlot(s.slotId, { scope, date: scope === 'following' ? s.originalDate : undefined, changes, acknowledgedWarnings });
  }

  private exceptionOf(action: SessionAction, m: ChangeModel, s: TimetableOccurrenceDto): SlotExceptionInput | null {
    const reason = m.reason.trim();
    switch (action) {
      case 'cancel':
        return { kind: 'cancelled', reason };
      case 'move': {
        const sameDay = m.newDate === s.current.date;
        const sameTime = m.newStart === s.current.startTime && m.newEnd === s.current.endTime;
        if (sameDay && sameTime) {
          this.failure.set('Choisissez un autre jour ou une autre heure pour déplacer la séance.');
          return null;
        }
        return {
          kind: 'moved',
          newDate: sameDay ? null : m.newDate,
          newStart: sameTime ? null : m.newStart || null,
          newEnd: sameTime ? null : m.newEnd || null,
          reason,
        };
      }
      case 'room':
        if (!m.roomId) {
          this.failure.set('Choisissez la nouvelle salle.');
          return null;
        }
        return { kind: 'room_change', newRoomId: m.roomId, reason };
      case 'substitute':
        if (!m.teacherId) {
          this.failure.set('Choisissez l’enseignant qui remplace.');
          return null;
        }
        return { kind: 'substitute', newTeacherId: m.teacherId, reason };
      default:
        return null;
    }
  }

  /** Only the fields of the series that differ from what it has now. */
  private changesOf(m: ChangeModel, slot: Required<Pick<TimetableSlotInput, 'weekday' | 'startTime' | 'endTime' | 'roomId' | 'weekParity' | 'division'>>): Partial<TimetableSlotInput> {
    const changes: { -readonly [K in keyof TimetableSlotInput]?: TimetableSlotInput[K] } = {};
    if (Number(m.weekday) !== slot.weekday) changes.weekday = Number(m.weekday);
    if (m.startTime !== slot.startTime) changes.startTime = m.startTime;
    if (m.endTime !== slot.endTime) changes.endTime = m.endTime;
    if ((m.roomId || null) !== slot.roomId) changes.roomId = m.roomId || null;
    if ((m.weekParity || null) !== slot.weekParity) changes.weekParity = (m.weekParity || null) as 'A' | 'B' | null;
    if ((m.division.trim() || null) !== slot.division) changes.division = m.division.trim() || null;
    return changes;
  }
}
