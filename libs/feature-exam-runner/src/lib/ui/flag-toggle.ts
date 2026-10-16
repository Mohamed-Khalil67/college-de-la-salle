import { Component, input, output } from '@angular/core';

/** "Mark for review" toggle shown on every question. */
@Component({
  selector: 'exam-flag-toggle',
  template: `
    <button
      type="button"
      class="flag-toggle"
      [class.on]="flagged()"
      [attr.aria-pressed]="flagged()"
      [disabled]="disabled()"
      (click)="toggled.emit()"
    >
      <span aria-hidden="true">⚑</span>
      {{ flagged() ? 'مُعلَّم للمراجعة' : 'علِّم للمراجعة' }}
    </button>
  `,
  styles: `
    .flag-toggle { font-size: 0.85rem; padding-block: 0.2rem; padding-inline: 0.7rem; color: var(--muted); font-weight: 600; }
    .flag-toggle.on { color: var(--primary-strong); border-color: var(--primary); background: var(--primary-soft); }
  `,
})
export class FlagToggle {
  readonly flagged = input(false);
  readonly disabled = input(false);
  readonly toggled = output<void>();
}
