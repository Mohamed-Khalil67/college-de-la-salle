import { Component, computed, input } from '@angular/core';
import { formatClock, formatCount } from '@exam/ui-arabic';

/**
 * Presentational countdown: a round gold medallion whose ring drains as time passes. Pure
 * function of its inputs; knows nothing about time sources. Digits come from the central Arabic
 * formatter, which wraps the clock in an LTR isolate so "٠٤:٥٧" never renders as "٥٧:٠٤".
 */
@Component({
  selector: 'exam-countdown',
  template: `
    <div
      class="ring"
      [class.warn]="warn()"
      [class.critical]="critical()"
      [style.--p]="percent()"
      role="progressbar"
      aria-label="نسبة الوقت المتبقّي"
      [attr.aria-valuenow]="percent()"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="medallion">
        <span class="label">الوقت المتبقّي</span>
        <span class="clock" role="timer" aria-live="off" data-testid="clock">{{ display() }}</span>
      </div>
    </div>
    <!-- Screen readers hear one announcement per minute, not every tick. -->
    <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
  `,
  styles: `
    :host { display: block; }
    .ring {
      --ring: var(--accent);
      inline-size: 7.5rem; block-size: 7.5rem; border-radius: 50%; padding: 5px;
      /* Starts at the top and drains toward the reading start. */
      background: conic-gradient(var(--ring) calc(var(--p) * 1%), var(--gold-soft) 0);
      transition: background 250ms linear;
    }
    .medallion {
      inline-size: 100%; block-size: 100%; border-radius: 50%;
      display: grid; place-content: center; text-align: center;
      background: var(--surface); border: 1.5px solid var(--gold);
    }
    .label { font-size: 0.75rem; color: var(--muted); }
    .clock { font: 600 1.6rem/1.3 var(--font-ui); font-variant-numeric: tabular-nums; color: var(--terracotta-strong); }
    .warn { --ring: var(--warn); }
    .critical { --ring: var(--danger); }
    .critical .clock { color: var(--danger); }
  `,
})
export class Countdown {
  readonly remainingMs = input.required<number>();
  readonly totalMs = input.required<number>();

  protected readonly display = computed(() => formatClock(this.remainingMs()));
  protected readonly percent = computed(() =>
    this.totalMs() > 0 ? Math.round((this.remainingMs() / this.totalMs()) * 100) : 0,
  );
  protected readonly warn = computed(() => this.remainingMs() <= 60_000);
  protected readonly critical = computed(() => this.remainingMs() <= 15_000);
  protected readonly announcement = computed(() => {
    if (this.remainingMs() <= 15_000) return 'تبقّى أقلّ من خمس عشرة ثانية';
    return `تبقّى ${formatCount(Math.ceil(this.remainingMs() / 60_000), 'minute')}`;
  });
}
