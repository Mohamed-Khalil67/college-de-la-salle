import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import {
  type TimetableConflictDto,
  type TimetableSuggestionDto,
  TIMETABLE_WARNING_LABELS,
  type TimetableWarningCode,
  type TimetableWarningDto,
} from '@cdls/shared';
import { Alert, Field, FieldControl } from '../../shared/ui';
import { splitSuggestions } from './suggestions';

let nextId = 0;

/**
 * Why a save was refused: the hard conflicts (room, teacher, class: the save cannot go through) with the
 * free places the API found, as one-click choices that save again; and the warnings (it can go through,
 * with a reason for each). Conflicts are announced at once (alert) and focus moves to the choices, so a
 * keyboard user lands on them; warnings sit in a polite status region.
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
        @if (!suggestions().length) {
          <p class="t-body-s">
            Choisissez une autre salle ou un autre horaire, ou libérez la place en changeant l’autre
            séance.
          </p>
        }
      </cdls-alert>
      @if (suggestions().length) {
        <section
          class="ways"
          [attr.aria-labelledby]="uid + '-title'"
          [attr.aria-busy]="busy() ? 'true' : null"
        >
          <h3 #title class="ways__title" tabindex="-1" [id]="uid + '-title'">
            Choisir une place libre
          </h3>
          <p class="t-body-s t-muted ways__hint">
            Un clic enregistre avec ce changement ; le reste ne bouge pas.
          </p>
          @if (split().rooms.length) {
            <p class="ways__label" [id]="uid + '-rooms'">Une autre salle, au même moment</p>
            <ul class="ways__list" role="list" [attr.aria-labelledby]="uid + '-rooms'">
              @for (s of split().rooms; track s.roomId) {
                <li>
                  <button
                    type="button"
                    class="btn btn--secondary btn--sm"
                    [attr.aria-disabled]="busy() ? 'true' : null"
                    (click)="choose(s)"
                  >
                    {{ s.roomName }}
                    @if (s.capacity !== null) {
                      <span class="ways__meta">{{ s.capacity }} places</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
          @if (split().times.length) {
            <p class="ways__label" [id]="uid + '-times'">{{ timesLabel() }}</p>
            <ul class="ways__list" role="list" [attr.aria-labelledby]="uid + '-times'">
              @for (s of split().times; track s.label) {
                <li>
                  <button
                    type="button"
                    class="btn btn--secondary btn--sm"
                    [attr.aria-disabled]="busy() ? 'true' : null"
                    (click)="choose(s)"
                  >
                    {{ s.label }}
                  </button>
                </li>
              }
            </ul>
          }
        </section>
      }
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
    .ways {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-left: 3px solid var(--color-primary);
      background: var(--color-surface);
    }
    .ways__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-heading);
    }
    .ways__title:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .ways__hint {
      margin: 0;
    }
    .ways__label {
      margin: var(--space-2) 0 0;
      font-weight: 600;
      color: var(--color-body);
    }
    .ways__list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ways__meta {
      font-weight: 400;
      color: var(--color-muted);
    }
    .ways__list [aria-disabled='true'] {
      cursor: progress;
      opacity: 0.6;
    }
    @media (pointer: coarse) {
      .ways__list .btn {
        min-height: 2.75rem;
      }
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
  /** Free places for the refused write (rooms, then times), from the 409 or POST /timetable/check. */
  readonly suggestions = input<readonly TimetableSuggestionDto[]>([]);
  /** A save is running: the choices wait for it. */
  readonly busy = input(false);
  /** The reason typed for each warning, by code. */
  readonly reasons = model<Partial<Record<TimetableWarningCode, string>>>({});
  /** The person picked a free place: the parent fills it in and saves again. */
  readonly apply = output<TimetableSuggestionDto>();

  protected readonly uid = `blocked-notice-${++nextId}`;
  protected readonly split = computed(() => splitSuggestions(this.suggestions()));
  protected readonly timesLabel = computed(() =>
    this.split().times[0]?.target === 'series'
      ? 'Un autre moment de la semaine, chaque semaine'
      : 'Un autre moment, la même semaine',
  );
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // New choices after a refused save: focus goes to them (the alert above is read out as well).
    afterRenderEffect(() => {
      const title = this.title();
      if (title && this.suggestions().length) untracked(() => title.nativeElement.focus());
    });
    // A choice that now needs warnings accepted: its button is gone, so focus goes to the first reason
    // instead of falling back to the top of the dialog.
    afterRenderEffect(() => {
      if (!this.warnings().length || this.suggestions().length) return;
      untracked(() => {
        const host = this.#host.nativeElement;
        const active = host.ownerDocument.activeElement;
        const lost = !active || active === host.ownerDocument.body || !active.isConnected;
        if (lost || host.contains(active)) host.querySelector<HTMLInputElement>('.warning input')?.focus();
      });
    });
  }

  /** Ignored while a save runs (the button stays focusable, so focus is not lost). */
  protected choose(suggestion: TimetableSuggestionDto): void {
    if (!this.busy()) this.apply.emit(suggestion);
  }

  protected label(code: TimetableWarningCode): string {
    return TIMETABLE_WARNING_LABELS[code];
  }

  protected setReason(code: TimetableWarningCode, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.reasons.update((r) => ({ ...r, [code]: value }));
  }
}
