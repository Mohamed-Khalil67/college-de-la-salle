import { Component, computed, effect, inject, input, linkedSignal, model, output, resource, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import {
  type AcknowledgedWarning,
  type ClassDto,
  type CreateTimetableSlotRequest,
  type SchoolYearDto,
  SCHOOL_WEEKDAYS,
  SECTION_LABELS,
  schoolToday,
  slotProblems,
  type TimetableBlockedError,
  type TimetableWarningCode,
  type TimetableWriteResult,
  WEEK_PARITIES,
  WEEKDAY_LABELS,
} from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { BlockedNotice } from '../../timetable/blocked-notice';
import { GroupSelect } from '../../timetable/group-select';
import { FreeRooms } from '../../timetable/free-rooms';
import { blockedOf, TimetableApi } from '../../timetable/timetable-api';

export interface NewSlotDefaults {
  readonly classId?: string;
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
}

/** A new series starts today (or when the year starts, if later): the past is never built. */
function startOf(year: SchoolYearDto | undefined): string {
  const today = schoolToday();
  return year && year.startsOn > today ? year.startsOn : today;
}

const NO_TEACHERS: readonly never[] = [];

interface NewSlotModel {
  classId: string;
  classSubjectId: string;
  teacherId: string;
  roomId: string;
  activityTypeId: string;
  weekday: string;
  startTime: string;
  endTime: string;
  weekParity: string;
  division: string;
  groupId: string;
  validFrom: string;
  validTo: string;
}

/** « Ajouter une séance »: a weekly slot for a class (subject, teacher, room, day and hours, rhythm). */
@Component({
  selector: 'app-new-slot-dialog',
  imports: [Alert, BlockedNotice, Button, Field, FieldControl, FormField, FreeRooms, GroupSelect, Modal],
  template: `
    <cdls-modal title="Ajouter une séance" [(open)]="open" [dismissible]="!busy()">
      <form class="stack stack--sm" novalidate (submit)="submit($event)">
        <cdls-field label="Classe">
          <select cdlsControl [formField]="slotForm.classId">
            <option value="">Choisir…</option>
            @for (c of classes(); track c.id) {
              <option [value]="c.id">{{ className(c) }}</option>
            }
          </select>
        </cdls-field>
        <cdls-field label="Matière" helper="Les matières de la classe, avec leur enseignant.">
          <select cdlsControl [formField]="slotForm.classSubjectId">
            <option value="">Choisir…</option>
            @for (s of subjects(); track s.id) {
              <option [value]="s.id">{{ s.subjectName }}</option>
            }
          </select>
        </cdls-field>
        <div class="grid-2 grid-2--tight">
          <cdls-field label="Enseignant">
            <select cdlsControl [formField]="slotForm.teacherId">
              <option value="">Choisir…</option>
              @for (t of teachers(); track t.teacherId) {
                <option [value]="t.teacherId">{{ t.teacherName }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field label="Type">
            <select cdlsControl [formField]="slotForm.activityTypeId">
              @for (t of types(); track t.id) {
                <option [value]="t.id">{{ t.label }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field label="Jour">
            <select cdlsControl [formField]="slotForm.weekday">
              @for (wd of weekdays; track wd.value) {
                <option [value]="wd.value">{{ wd.label }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field label="Salle">
            <select cdlsControl [formField]="slotForm.roomId">
              <option value="">Aucune salle</option>
              @for (room of rooms(); track room.id) {
                <option [value]="room.id">{{ room.name }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field label="Début">
            <input cdlsControl type="time" [formField]="slotForm.startTime" />
          </cdls-field>
          <cdls-field label="Fin">
            <input cdlsControl type="time" [formField]="slotForm.endTime" />
          </cdls-field>
          <cdls-field label="Rythme">
            <select cdlsControl [formField]="slotForm.weekParity">
              <option value="">Chaque semaine</option>
              @for (p of parities; track p) {
                <option [value]="p">Une semaine sur deux (semaine {{ p }})</option>
              }
            </select>
          </cdls-field>
          <app-group-select [classId]="model().classId" [value]="model().groupId" (valueChange)="chooseGroup($event)" />
          @if (!model().groupId) {
            <cdls-field label="Division des groupes" helper="Vide : toute la classe. Pour une séance de groupe, choisissez plutôt le groupe.">
              <input cdlsControl type="text" autocomplete="off" [formField]="slotForm.division" />
            </cdls-field>
          }
          <cdls-field label="À partir du">
            <input cdlsControl type="date" [formField]="slotForm.validFrom" />
          </cdls-field>
          <cdls-field label="Jusqu’au" helper="Dernier jour, inclus. Les vacances sont sautées.">
            <input cdlsControl type="date" [formField]="slotForm.validTo" />
          </cdls-field>
        </div>

        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        <app-blocked-notice [conflicts]="conflicts()" [warnings]="warnings()" [(reasons)]="reasons" />
        @if (roomClash()) {
          <app-free-rooms
            [date]="roomClash()!"
            [startTime]="model().startTime"
            [endTime]="model().endTime"
            [classId]="model().classId || null"
            [selected]="model().roomId || null"
            (pick)="chooseRoom($event)"
          />
        }

        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" [disabled]="busy()" (click)="open.set(false)">Fermer</button>
          <button cdlsButton type="submit" [disabled]="busy()">
            {{ busy() ? 'Enregistrement…' : warnings().length ? 'Enregistrer avec ces avertissements' : 'Ajouter la séance' }}
          </button>
        </div>
      </form>
    </cdls-modal>
  `,
})
export class NewSlotDialog {
  readonly open = model(false);
  readonly defaults = input.required<NewSlotDefaults>();
  readonly classes = input.required<readonly ClassDto[]>();
  readonly years = input.required<readonly SchoolYearDto[]>();
  readonly saved = output<TimetableWriteResult>();
  readonly blocked = output<TimetableBlockedError>();

  protected readonly weekdays = SCHOOL_WEEKDAYS.map((value) => ({ value: String(value), label: WEEKDAY_LABELS[value]! }));
  protected readonly parities = WEEK_PARITIES;

  readonly #client = inject(ApiClient);
  readonly #api = inject(TimetableApi);

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly conflicts = signal<TimetableBlockedError['conflicts']>([]);
  protected readonly warnings = signal<TimetableBlockedError['warnings']>([]);
  protected readonly reasons = signal<Partial<Record<TimetableWarningCode, string>>>({});
  /** The first day of a room clash, to suggest free rooms for it. */
  protected readonly roomClash = computed(() => this.conflicts().find((c) => c.kind === 'room')?.date ?? null);

  readonly #classId = computed(() => this.model().classId);
  readonly #subjects = resource({
    params: () => this.#classId() || undefined,
    loader: ({ params }) => this.#client.school.classSubjects(params),
  });
  protected readonly subjects = computed(() => (this.#subjects.hasValue() ? this.#subjects.value() : []));
  readonly #classSubjectId = computed(() => this.model().classSubjectId);
  protected readonly teachers = computed(
    () => this.subjects().find((s) => s.id === this.#classSubjectId())?.teachers ?? NO_TEACHERS,
  );

  readonly #types = resource({ params: () => (this.open() ? true : undefined), loader: () => this.#client.school.activityTypes() });
  /** Types a weekly slot can have: repeatable, not homework, school-wide. */
  protected readonly types = computed(() =>
    this.#types.hasValue() ? this.#types.value().filter((t) => t.repeatable && !t.homework && !t.ownerTeacherId) : [],
  );
  readonly #rooms = resource({ params: () => (this.open() ? true : undefined), loader: () => this.#api.rooms() });
  protected readonly rooms = computed(() => (this.#rooms.hasValue() ? this.#rooms.value().filter((r) => r.active) : []));

  protected readonly model = linkedSignal<NewSlotModel>(() => {
    const d = this.defaults();
    const classId = d.classId ?? '';
    const year = this.yearOf(classId);
    return {
      classId,
      classSubjectId: '',
      teacherId: '',
      roomId: '',
      activityTypeId: '',
      weekday: String(d.weekday),
      startTime: d.startTime,
      endTime: d.endTime,
      weekParity: '',
      division: '',
      groupId: '',
      validFrom: startOf(year),
      validTo: year?.endsOn ?? '',
    };
  });
  protected readonly slotForm = form(this.model);

  constructor() {
    // A new class has its own subjects and school year.
    effect(() => {
      const classId = this.#classId();
      untracked(() => {
        const year = this.yearOf(classId);
        this.model.update((m) => ({
          ...m,
          classSubjectId: '',
          teacherId: '',
          groupId: '',
          validFrom: year ? startOf(year) : m.validFrom,
          validTo: year?.endsOn ?? m.validTo,
        }));
      });
    });
    // The first teacher of the subject, and the first type, until the person chooses.
    effect(() => {
      const teachers = this.teachers();
      const types = this.types();
      untracked(() =>
        this.model.update((m) => ({
          ...m,
          teacherId: teachers.some((t) => t.teacherId === m.teacherId) ? m.teacherId : (teachers[0]?.teacherId ?? ''),
          activityTypeId: types.some((t) => t.id === m.activityTypeId) ? m.activityTypeId : (types[0]?.id ?? ''),
        })),
      );
    });
    effect(() => {
      if (this.open())
        untracked(() => {
          this.failure.set(null);
          this.conflicts.set([]);
          this.warnings.set([]);
          this.reasons.set({});
        });
    });
  }

  private yearOf(classId: string): SchoolYearDto | undefined {
    const c = this.classes().find((x) => x.id === classId);
    return this.years().find((y) => y.id === c?.schoolYearId) ?? this.years().find((y) => y.isCurrent);
  }

  protected className(c: ClassDto): string {
    return `${c.label} (${SECTION_LABELS[c.sectionCode]})`;
  }

  protected chooseGroup(id: string): void {
    this.model.update((m) => ({ ...m, groupId: id }));
  }

  protected chooseRoom(id: string): void {
    this.model.update((m) => ({ ...m, roomId: id }));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const m = this.model();
    const request = this.requestOf(m);
    const problem =
      !m.classId
        ? 'Choisissez la classe.'
        : !m.classSubjectId
          ? 'Choisissez la matière.'
          : !m.teacherId
            ? 'Choisissez l’enseignant.'
            : !m.activityTypeId
              ? 'Choisissez le type de séance.'
              : slotProblems(request)[0];
    if (problem) {
      this.failure.set(problem);
      return;
    }
    this.failure.set(null);
    const reasons = this.reasons();
    const acknowledgedWarnings: AcknowledgedWarning[] = this.warnings()
      .map((w) => ({ code: w.code, reason: (reasons[w.code] ?? '').trim() }))
      .filter((a) => a.reason.length > 0);
    this.busy.set(true);
    try {
      const result = await this.#api.createSlot({ ...request, acknowledgedWarnings });
      this.open.set(false);
      this.saved.emit(result);
    } catch (error) {
      const blocked = blockedOf(error);
      if (blocked) {
        this.conflicts.set(blocked.conflicts);
        this.warnings.set(blocked.warnings);
        this.blocked.emit(blocked);
      } else {
        this.failure.set(apiMessage(error));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private requestOf(m: NewSlotModel): CreateTimetableSlotRequest {
    return {
      classSubjectId: m.classSubjectId,
      teacherId: m.teacherId,
      roomId: m.roomId || null,
      activityTypeId: m.activityTypeId,
      weekday: Number(m.weekday),
      startTime: m.startTime,
      endTime: m.endTime,
      validFrom: m.validFrom,
      validTo: m.validTo,
      weekParity: (m.weekParity || null) as 'A' | 'B' | null,
      // With a group the division is the group's: the API derives it.
      division: m.groupId ? null : m.division.trim() || null,
      groupId: m.groupId || null,
    };
  }
}
