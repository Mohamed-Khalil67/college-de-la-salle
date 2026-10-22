import { Component, input, model } from '@angular/core';
import {
  type TimetableConflictDto,
  TIMETABLE_WARNING_LABELS,
  type TimetableWarningCode,
  type TimetableWarningDto,
} from '@cdls/shared';
import { Alert, Field, FieldControl } from '../ui';

/**
 * Why a save was refused: the hard conflicts (room, teacher, class: the save cannot go through) and the
 * warnings (it can, with a reason for each). Conflicts are announced at once (alert); warnings sit in a
 * polite status region, so a screen reader hears them when they appear.
 */
@Component({
  selector: 'app-blocked-notice',
  imports: [Alert, Field, FieldControl],
  template: `
    @if (conflicts().length) {
      <cdls-alert tone="danger">
        <p class="t-body-s"><strong>Enregistrement impossible :</strong></p>
        <ul class="issues">
          @for (c of conflicts(); track $index) {
            <li>{{ c.message }}</li>
          }
        </ul>
        <p class="t-body-s">Choisissez une autre salle ou un autre horaire, ou libérez la place en changeant l’autre séance.</p>
      </cdls-alert>
    }
    <div role="status" aria-live="polite">
      @if (warnings().length) {
        <div class="warnings">
          <p class="t-body-s">
            <strong>{{ warnings().length === 1 ? 'Un avertissement' : warnings().length + ' avertissements' }}.</strong>
            Vous pouvez enregistrer en indiquant un motif pour chacun.
          </p>
          @for (w of warnings(); track w.code) {
            <div class="warning">
              <p class="warning__text">{{ label(w.code) }} : {{ w.message }}</p>
              <cdls-field [label]="'Motif : ' + label(w.code).toLowerCase()">
                <input
                  cdlsControl
                  type="text"
                  autocomplete="off"
                  maxlength="500"
                  [value]="reasons()[w.code] ?? ''"
                  (input)="setReason(w.code, $event)"
                />
              </cdls-field>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .issues {
      margin: var(--space-2) 0;
      padding-left: var(--space-5);
    }
    .warnings {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--color-warning);
      border-radius: var(--radius-sm);
      background: var(--color-warning-tint);
    }
    .warning {
      display: grid;
      gap: var(--space-2);
    }
    .warning__text {
      margin: 0;
    }
  `,
})
export class BlockedNotice {
  readonly conflicts = input<readonly TimetableConflictDto[]>([]);
  readonly warnings = input<readonly TimetableWarningDto[]>([]);
  /** The reason typed for each warning, by code. */
  readonly reasons = model<Partial<Record<TimetableWarningCode, string>>>({});

  protected label(code: TimetableWarningCode): string {
    return TIMETABLE_WARNING_LABELS[code];
  }

  protected setReason(code: TimetableWarningCode, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.reasons.update((r) => ({ ...r, [code]: value }));
  }
}
