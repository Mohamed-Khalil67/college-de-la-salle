import { Component, computed, input } from '@angular/core';

/** Presentational countdown. Pure function of its inputs; knows nothing about time sources. */
@Component({
  selector: 'exam-countdown',
  template: `
    <div class="countdown" [class.warn]="warn()" [class.critical]="critical()">
      <span class="label">Time left</span>
      <span class="clock" role="timer" aria-live="off">{{ display() }}</span>
      <div
        class="bar"
        role="progressbar"
        aria-label="Time remaining"
        [attr.aria-valuenow]="percent()"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="fill" [style.width.%]="percent()"></div>
      </div>
      <!-- Screen readers get an announcement once per minute, not every tick. -->
      <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
    </div>
  `,
  styles: `
    .countdown { display: grid; gap: 0.25rem; min-width: 10rem; }
    .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .clock { font: 600 1.75rem/1 var(--mono); font-variant-numeric: tabular-nums; }
    .bar { height: 0.375rem; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
    .fill { height: 100%; background: var(--accent); transition: width 250ms linear; }
    .warn .fill { background: var(--warn); }
    .critical .clock { color: var(--danger); }
    .critical .fill { background: var(--danger); }
  `,
})
export class Countdown {
  readonly remainingMs = input.required<number>();
  readonly totalMs = input.required<number>();

  protected readonly display = computed(() => {
    const total = Math.ceil(this.remainingMs() / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
  protected readonly percent = computed(() =>
    this.totalMs() > 0 ? Math.round((this.remainingMs() / this.totalMs()) * 100) : 0,
  );
  protected readonly warn = computed(() => this.remainingMs() <= 60_000);
  protected readonly critical = computed(() => this.remainingMs() <= 15_000);
  protected readonly announcement = computed(() => {
    const minutes = Math.ceil(this.remainingMs() / 60_000);
    if (this.remainingMs() <= 15_000) return 'Less than 15 seconds remaining';
    return `${minutes} minute${minutes === 1 ? '' : 's'} remaining`;
  });
}
