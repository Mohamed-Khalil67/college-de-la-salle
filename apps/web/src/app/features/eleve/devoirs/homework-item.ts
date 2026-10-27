import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { type HomeworkDto, longDay } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Badge } from '../../../shared/ui';
import { dueBadge, subjectName } from '../../../shared/utils/format';

/**
 * One homework line with its « fait » checkbox. The box answers at once; the API call follows and the
 * box goes back (with a message) if it fails. `changed` reports the saved state to the list.
 */
@Component({
  selector: 'app-homework-item',
  imports: [Badge],
  host: { class: 'homework-item' },
  template: `
    <label class="check">
      <input type="checkbox" [checked]="done()" (change)="toggle($any($event.target))" />
      <span>
        <span class="d-block" [class.is-done]="done()">{{ item().event.title }}</span>
        <span class="list__meta">{{ meta() }}</span>
      </span>
    </label>
    @if (badge(); as b) {
      <cdls-badge [tone]="b.tone">{{ b.label }}</cdls-badge>
    }
    @if (failure()) {
      <p class="field__error homework-item__error" role="alert">{{ failure() }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-2) var(--space-4);
      width: 100%;
    }
    .homework-item__error {
      flex-basis: 100%;
    }
  `,
})
export class HomeworkItem {
  readonly item = input.required<HomeworkDto>();
  readonly today = input.required<string>();
  readonly changed = output<HomeworkDto>();

  readonly #api = inject(ApiClient);
  protected readonly done = linkedSignal(() => this.item().done);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly badge = computed(() => dueBadge(this.item().event.date, this.today(), this.done()));
  protected readonly meta = computed(() => {
    const e = this.item().event;
    const subject = subjectName(e.subjectId);
    const when = this.done() ? 'fait' : `pour ${longDay(e.date)}`;
    // Work for a group says so: « Groupe TP A ».
    const group = e.target.whole ? '' : e.target.groups.map((g) => g.label).join(', ');
    return [subject, when, group ? `groupe ${group}` : ''].filter(Boolean).join(', ');
  });

  protected async toggle(box: HTMLInputElement): Promise<void> {
    // The box stays enabled (disabling it would drop keyboard focus); a click while saving is undone.
    if (this.busy()) {
      box.checked = this.done();
      return;
    }
    const done = box.checked;
    this.done.set(done);
    this.busy.set(true);
    this.failure.set(null);
    try {
      if (done) {
        this.changed.emit(await this.#api.calendar.markDone(this.item().event.id));
      } else {
        await this.#api.calendar.markNotDone(this.item().event.id);
        this.changed.emit({ ...this.item(), done: false, doneAt: null });
      }
    } catch (error) {
      this.done.set(!done);
      this.failure.set(`Le devoir n’a pas pu être ${done ? 'coché' : 'décoché'}. ${apiMessage(error)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
