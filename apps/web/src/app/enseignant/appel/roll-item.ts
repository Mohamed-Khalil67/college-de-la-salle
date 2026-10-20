import { Component, computed, input, model } from '@angular/core';
import { type AttendanceStatus, ATTENDANCE_STATUSES, type StudentSummaryDto } from '@cdls/shared';
import { Avatar, Segmented, type SegmentOption } from '../../ui';
import { ATTENDANCE_LABELS } from '../../eleve/shared/format';

const OPTIONS: readonly SegmentOption[] = ATTENDANCE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_LABELS[s] }));

/** One student of the roll: name, status (present, absent, late, excused) and a note. */
@Component({
  selector: 'li[app-roll-item]',
  imports: [Avatar, Segmented],
  host: { class: 'roll__item' },
  template: `
    <span class="person"><cdls-avatar [name]="name()" />{{ name() }}</span>
    <cdls-segmented class="roll__status" [legend]="'Présence de ' + name()" [options]="options" [value]="status()" (valueChange)="setStatus($event)" />
    <div class="roll__note">
      <label class="visually-hidden" [for]="'remarque-' + student().id">Remarque pour {{ name() }}</label>
      <input
        class="field__control field__control--sm"
        [id]="'remarque-' + student().id"
        placeholder="Remarque"
        maxlength="500"
        [value]="note()"
        (input)="note.set($any($event.target).value)"
      />
    </div>
  `,
})
export class RollItem {
  readonly student = input.required<StudentSummaryDto>();
  readonly status = model<AttendanceStatus>('present');
  readonly note = model('');

  protected readonly options = OPTIONS;
  protected readonly name = computed(() => `${this.student().firstName} ${this.student().lastName}`);

  protected setStatus(value: string | null): void {
    if (value && (ATTENDANCE_STATUSES as readonly string[]).includes(value)) this.status.set(value as AttendanceStatus);
  }
}
