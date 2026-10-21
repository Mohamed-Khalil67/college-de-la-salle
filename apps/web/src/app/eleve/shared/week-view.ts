import { Component, computed, input, output } from '@angular/core';
import type { OccurrenceDto } from '@cdls/shared';
import { Badge } from '../../ui';
import { dayTitle, isAssessment, kindLabel, subjectName, timeSpan, whereOf } from './format';
import { weekColumns } from './week';

/**
 * A school week (Sunday to Thursday, plus weekend days that have events): one column per day on wide
 * screens, stacked days on phones. Each event is a button that opens its details.
 */
@Component({
  selector: 'app-week-view',
  imports: [Badge],
  template: `
    <div class="week">
      @for (column of columns(); track column.day) {
        <section class="card card--panel week__day" [class.week__day--today]="column.day === today()" [attr.aria-labelledby]="'jour-' + column.day">
          <h2 class="t-h3" [id]="'jour-' + column.day">
            {{ title(column.day) }}
            @if (column.day === today()) {
              <cdls-badge tone="info">Aujourd’hui</cdls-badge>
            }
          </h2>
          @if (column.items.length) {
            <ol class="week__list" role="list">
              @for (item of column.items; track item.key) {
                <li>
                  <button type="button" class="week__event" [class.week__event--exam]="exam(item)" (click)="open.emit(item)">
                    <span class="week__time">{{ time(item) }}</span>
                    <span class="week__title">{{ item.event.title }}</span>
                    <span class="list__meta">{{ meta(item) }}</span>
                  </button>
                </li>
              }
            </ol>
          } @else {
            <p class="t-body-s t-muted">Rien de prévu.</p>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .week {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    }
    .week__day {
      display: grid;
      gap: var(--space-3);
      align-content: start;
    }
    .week__day--today {
      border-color: var(--color-primary);
    }
    .week__list {
      display: grid;
      gap: var(--space-2);
    }
    .week__event {
      display: grid;
      gap: 2px;
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-line);
      border-left: 3px solid var(--color-primary);
      border-radius: var(--radius-sm);
      background: var(--color-page);
      color: var(--color-body);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .week__event:hover {
      background: var(--color-subtle);
    }
    .week__event:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .week__event--exam {
      border-left-color: var(--color-heritage);
    }
    .week__time {
      font-size: var(--text-body-s);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--color-heading);
    }
    .week__title {
      font-weight: 600;
      color: var(--color-heading);
      overflow-wrap: anywhere;
    }
  `,
})
export class WeekView {
  /** Any day of the week to show. */
  readonly day = input.required<string>();
  readonly occurrences = input.required<readonly OccurrenceDto[]>();
  readonly today = input('');
  readonly open = output<OccurrenceDto>();

  protected readonly columns = computed(() => weekColumns(this.day(), this.occurrences()));

  protected title(day: string): string {
    return dayTitle(day);
  }
  protected time(item: OccurrenceDto): string {
    return timeSpan(item.event.startTime, item.event.endTime);
  }
  protected exam(item: OccurrenceDto): boolean {
    return isAssessment(item.event.type);
  }
  protected meta(item: OccurrenceDto): string {
    const e = item.event;
    const subject = subjectName(e.subjectId);
    return [kindLabel(e.type), subject && subject !== e.title ? subject : '', whereOf(e)].filter(Boolean).join(', ');
  }
}
