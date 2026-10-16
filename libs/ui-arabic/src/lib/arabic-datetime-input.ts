import { Component, computed, input, model, output } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  type DateTimeParts,
  daysInMonth,
  describeLocalDateTime,
  hourOptions,
  joinLocalDateTime,
  minuteOptions,
  monthOptions,
  numberOptions,
  splitLocalDateTime,
} from './arabic-datetime';

let nextId = 0;

/**
 * Date-and-time picker rendered entirely in Arabic: day, month name, year, hour (ص/م) and minute,
 * each a native accessible `<select>`, plus a written-out preview of the chosen moment.
 *
 * Replaces `<input type="datetime-local">`, whose picker follows the browser's UI language and
 * shows Latin digits even on an Arabic page. The value is still a `datetime-local` string, so the
 * form model and validators are unchanged.
 */
@Component({
  selector: 'exam-datetime-input',
  template: `
    <div class="row" role="group" [attr.aria-labelledby]="labelId() || null" (focusout)="onFocusOut($event)">
      <label class="part">
        <span class="visually-hidden">اليوم</span>
        <select [disabled]="disabled()" [value]="parts().day" (change)="set('day', $event)">
          @for (o of days(); track o.value) {
            <option [value]="o.value" [selected]="o.value === parts().day">{{ o.label }}</option>
          }
        </select>
      </label>
      <label class="part grow">
        <span class="visually-hidden">الشهر</span>
        <select [disabled]="disabled()" (change)="set('month', $event)">
          @for (o of months; track o.value) {
            <option [value]="o.value" [selected]="o.value === parts().month">{{ o.label }}</option>
          }
        </select>
      </label>
      <label class="part">
        <span class="visually-hidden">السنة</span>
        <select [disabled]="disabled()" (change)="set('year', $event)">
          @for (o of years(); track o.value) {
            <option [value]="o.value" [selected]="o.value === parts().year">{{ o.label }}</option>
          }
        </select>
      </label>
      <span class="sep" aria-hidden="true">الساعة</span>
      <label class="part">
        <span class="visually-hidden">الساعة</span>
        <select [disabled]="disabled()" (change)="set('hour', $event)">
          @for (o of hours; track o.value) {
            <option [value]="o.value" [selected]="o.value === parts().hour">{{ o.label }}</option>
          }
        </select>
      </label>
      <label class="part">
        <span class="visually-hidden">الدقيقة</span>
        <select [disabled]="disabled()" (change)="set('minute', $event)">
          @for (o of minutes(); track o.value) {
            <option [value]="o.value" [selected]="o.value === parts().minute">{{ o.label }}</option>
          }
        </select>
      </label>
    </div>
    <p class="preview" [id]="previewId" aria-live="polite">{{ preview() }}</p>
  `,
  styles: `
    :host { display: block; }
    .row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
    .part { display: block; font-weight: 400; }
    .part select { padding-inline: 0.5rem; }
    .grow { flex: 1 1 7rem; }
    .grow select { inline-size: 100%; }
    .sep { color: var(--muted); font-size: 0.9rem; padding-inline: 0.25rem; }
    .preview { margin: 0.3rem 0 0; font-size: 0.9rem; color: var(--accent-strong); }
  `,
})
export class ArabicDateTimeInput implements FormValueControl<string> {
  readonly value = model('');
  readonly disabled = input(false);
  readonly touch = output<void>();
  /** id of the visible `<label>` that names this group. */
  readonly labelId = input('');

  protected readonly previewId = `dt-preview-${nextId++}`;
  protected readonly months = monthOptions();
  protected readonly hours = hourOptions();

  protected readonly parts = computed<DateTimeParts>(() => {
    const now = new Date();
    return (
      splitLocalDateTime(this.value()) ?? {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: 0,
      }
    );
  });
  protected readonly days = computed(() =>
    numberOptions(1, daysInMonth(this.parts().year, this.parts().month)),
  );
  protected readonly years = computed(() => {
    const thisYear = new Date().getFullYear();
    const from = Math.min(thisYear, this.parts().year);
    return numberOptions(from, Math.max(thisYear + 3, this.parts().year));
  });
  protected readonly minutes = computed(() => minuteOptions(this.parts().minute));
  protected readonly preview = computed(() => describeLocalDateTime(this.value()));

  protected set(part: keyof DateTimeParts, event: Event): void {
    const next = { ...this.parts(), [part]: Number((event.target as HTMLSelectElement).value) };
    this.value.set(joinLocalDateTime(next));
  }

  /** Touched once focus leaves the whole group, not when moving between its selects. */
  protected onFocusOut(event: FocusEvent): void {
    const group = event.currentTarget as HTMLElement;
    if (!group.contains(event.relatedTarget as Node | null)) this.touch.emit();
  }
}
