import { Component, computed, input } from '@angular/core';
import type { TimetableOccurrenceDto } from '@cdls/shared';
import { Badge } from '../ui';
import {
  changeLines,
  isStruck,
  rangeOf,
  sessionTitle,
  STATUS_LABELS,
  STATUS_TONES,
} from './timetable-format';

/**
 * One session of the timetable, read-only: time, subject, room and teacher. A cancelled session (or the
 * trace of a moved one) is struck through and says so in words; a changed one writes « avant / maintenant »
 * (never colour alone).
 */
@Component({
  selector: 'app-session-item',
  imports: [Badge],
  host: { class: 'session', '[class.session--struck]': 'struck()', '[class.session--changed]': 'changed()' },
  template: `
    <p class="session__time">{{ time() }}</p>
    <div class="session__body">
      <p class="session__title">
        <span class="session__name">{{ title() }}</span>
        @if (label()) {
          <cdls-badge [tone]="tone()">{{ label() }}</cdls-badge>
        }
      </p>
      <p class="session__meta">{{ meta() }}</p>
      @for (line of lines(); track $index) {
        <p class="session__change">{{ line }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 5.5rem 1fr;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--color-line);
      border-left: 3px solid var(--color-primary);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
    }
    :host(.session--changed) {
      border-left-color: var(--color-heritage);
    }
    .session__time {
      margin: 0;
      font-size: var(--text-body-s);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--color-heading);
    }
    .session__body {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .session__title,
    .session__meta,
    .session__change {
      margin: 0;
    }
    .session__title {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      font-weight: 600;
      color: var(--color-heading);
      overflow-wrap: anywhere;
    }
    .session__meta {
      font-size: var(--text-body-s);
      color: var(--color-muted);
    }
    .session__change {
      font-size: var(--text-body-s);
      color: var(--color-body);
    }
    :host(.session--struck) .session__time,
    :host(.session--struck) .session__name,
    :host(.session--struck) .session__meta {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
    }
    @media (max-width: 30rem) {
      :host {
        grid-template-columns: 1fr;
        gap: var(--space-1);
      }
    }
  `,
})
export class SessionItem {
  readonly session = input.required<TimetableOccurrenceDto>();
  /** Name the teacher (student and room views). */
  readonly showTeacher = input(true);
  /** Name the class (teacher and room views). */
  readonly showClass = input(false);

  protected readonly struck = computed(() => isStruck(this.session()));
  protected readonly changed = computed(() => this.session().status !== 'normal');
  protected readonly time = computed(() => rangeOf(this.session().status === 'moved_from' ? this.session().original : this.session().current));
  protected readonly title = computed(() => sessionTitle(this.session()));
  protected readonly label = computed(() => STATUS_LABELS[this.session().status]);
  protected readonly tone = computed(() => STATUS_TONES[this.session().status]);
  protected readonly lines = computed(() => changeLines(this.session()));
  protected readonly meta = computed(() => {
    const s = this.session();
    const place = s.status === 'moved_from' ? s.original : s.current;
    return [
      this.showClass() ? s.classLabel : '',
      s.division ? `groupe ${s.division}` : '',
      place.roomName ?? '',
      this.showTeacher() ? place.teacherName : '',
    ]
      .filter(Boolean)
      .join(', ');
  });
}
