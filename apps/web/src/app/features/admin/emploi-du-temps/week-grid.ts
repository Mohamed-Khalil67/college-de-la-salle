import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import type { TimetableOccurrenceDto } from '@cdls/shared';
import { dayTitle } from '../../../shared/utils/format';
import { Icon } from '../../../shared/ui';
import {
  isStruck,
  rangeOf,
  sessionSummary,
  sessionTitle,
  shortDate,
  STATUS_LABELS,
  type TimeBand,
} from '../../timetable/timetable-format';
import { type GridPosition, nextPosition } from './grid-nav';

export type GridView = 'class' | 'teacher' | 'room';

export interface CellRef {
  readonly day: string;
  readonly band: TimeBand;
  readonly sessions: readonly TimetableOccurrenceDto[];
}

export interface DropRef {
  readonly session: TimetableOccurrenceDto;
  readonly day: string;
  readonly band: TimeBand;
}

/**
 * The week editor's grid (ARIA grid pattern): days across, hours down, one tab stop with the arrow keys,
 * Home, End, PageUp and PageDown moving between cells, Enter or Space opening the cell. Every action also
 * works without dragging: the cell's dialog has « Déplacer… ». A session that changed says so in words,
 * a cancelled one is struck through, a warning has a text badge: colour is never the only cue.
 */
@Component({
  selector: 'app-week-grid',
  imports: [Icon],
  template: `
    <div class="grid-scroll">
      <div
        role="grid"
        class="week-grid"
        [attr.aria-label]="label()"
        [attr.aria-rowcount]="rows().length + 1"
        [attr.aria-colcount]="days().length + 1"
        (keydown)="onKey($event)"
      >
        <div role="row" class="week-grid__row">
          <div role="columnheader" class="week-grid__head">Horaire</div>
          @for (day of days(); track day) {
            <div role="columnheader" class="week-grid__head" [class.week-grid__head--today]="day === today()">
              {{ short(day) }}
            </div>
          }
        </div>
        @for (band of rows(); track band.start; let r = $index) {
          <div role="row" class="week-grid__row">
            <div role="rowheader" class="week-grid__time">{{ range(band) }}</div>
            @for (day of days(); track day; let c = $index) {
              <div
                role="gridcell"
                class="week-grid__cell"
                [attr.data-pos]="r + '-' + c"
                [attr.tabindex]="isActive(r, c) ? 0 : -1"
                [attr.aria-label]="cellLabel(day, band)"
                (click)="open(r, c, day, band)"
                (focus)="active.set({ row: r, col: c })"
                (dragover)="$event.preventDefault()"
                (drop)="drop($event, day, band)"
              >
                @for (s of cell(day, band); track s.key) {
                  <div
                    class="cs"
                    [class.cs--struck]="struck(s)"
                    [class.cs--changed]="s.status !== 'normal'"
                    [attr.draggable]="s.status === 'cancelled' || s.status === 'moved_from' ? null : 'true'"
                    (dragstart)="dragStart($event, s)"
                  >
                    <span class="cs__name">{{ title(s) }}</span>
                    <span class="cs__meta">{{ meta(s) }}</span>
                    @if (statusLabel(s)) {
                      <span class="cs__tag">{{ statusLabel(s) }}</span>
                    }
                    @if (warned().has(s.slotId)) {
                      <span class="cs__tag cs__tag--warn"><cdls-icon name="alert" />Avertissement</span>
                    }
                  </div>
                }
                @if (!cell(day, band).length) {
                  <span class="week-grid__free">Libre</span>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .grid-scroll {
      overflow-x: auto;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .week-grid {
      display: grid;
      min-width: 52rem;
    }
    .week-grid__row {
      display: grid;
      grid-template-columns: 8.5rem repeat(5, minmax(0, 1fr));
    }
    .week-grid__head {
      padding: var(--space-3);
      background: var(--color-subtle);
      color: var(--color-heading);
      font-size: var(--text-label-s);
      font-weight: 600;
      border-bottom: 1px solid var(--color-line);
    }
    .week-grid__head--today {
      box-shadow: inset 0 -3px 0 var(--color-primary);
    }
    .week-grid__time {
      padding: var(--space-3);
      font-size: var(--text-body-s);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--color-heading);
      border-bottom: 1px solid var(--color-line);
      background: var(--color-subtle);
    }
    .week-grid__cell {
      display: grid;
      gap: var(--space-1);
      align-content: start;
      min-height: 4.5rem;
      padding: var(--space-2);
      border-bottom: 1px solid var(--color-line);
      border-left: 1px solid var(--color-line);
      cursor: pointer;
    }
    .week-grid__cell:hover {
      background: var(--color-subtle);
    }
    .week-grid__cell:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
      background: var(--color-subtle);
    }
    .week-grid__free {
      font-size: var(--text-body-s);
      color: var(--color-muted);
    }
    .cs {
      display: grid;
      gap: 1px;
      padding: var(--space-1) var(--space-2);
      border-left: 3px solid var(--color-primary);
      border-radius: var(--radius-sm);
      background: var(--color-info-tint);
      font-size: var(--text-body-s);
      color: var(--color-heading);
    }
    .cs--changed {
      border-left-color: var(--color-heritage);
    }
    .cs__name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .cs__meta {
      color: var(--color-body);
    }
    .cs--struck .cs__name,
    .cs--struck .cs__meta {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
    }
    .cs__tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-label-s);
      font-weight: 600;
      color: var(--color-heading);
    }
    .cs__tag--warn {
      color: var(--color-heading);
    }
  `,
})
export class WeekGrid {
  readonly days = input.required<readonly string[]>();
  readonly rows = input.required<readonly TimeBand[]>();
  readonly sessions = input.required<readonly TimetableOccurrenceDto[]>();
  readonly view = input<GridView>('class');
  /** Slots with a warning: their sessions get a text badge. */
  readonly warned = input<ReadonlySet<string>>(new Set());
  readonly label = input('Emploi du temps de la semaine');
  readonly today = input('');
  readonly activate = output<CellRef>();
  readonly dropped = output<DropRef>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly active = signal<GridPosition>({ row: 0, col: 0 });
  readonly #dragged = signal<TimetableOccurrenceDto | null>(null);

  protected readonly byCell = computed(() => {
    const map = new Map<string, TimetableOccurrenceDto[]>();
    for (const s of this.sessions()) {
      const key = `${s.current.date}|${s.current.startTime}`;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  });

  protected isActive(row: number, col: number): boolean {
    const a = this.active();
    return a.row === row && a.col === col;
  }
  protected cell(day: string, band: TimeBand): readonly TimetableOccurrenceDto[] {
    return this.byCell().get(`${day}|${band.start}`) ?? [];
  }
  protected short(day: string): string {
    return shortDate(day);
  }
  protected range(band: TimeBand): string {
    return rangeOf({ startTime: band.start, endTime: band.end });
  }
  protected title(s: TimetableOccurrenceDto): string {
    return sessionTitle(s);
  }
  protected struck(s: TimetableOccurrenceDto): boolean {
    return isStruck(s);
  }
  protected statusLabel(s: TimetableOccurrenceDto): string {
    return s.status === 'moved_from' && s.movedTo ? `Déplacée au ${shortDate(s.movedTo.date)}` : STATUS_LABELS[s.status];
  }
  /** What the grid says about a session, by what the view already tells (class, teacher or room). */
  protected meta(s: TimetableOccurrenceDto): string {
    const c = s.current;
    const parts =
      this.view() === 'class'
        ? [c.roomName, c.teacherName]
        : this.view() === 'teacher'
          ? [s.classLabel, c.roomName]
          : [s.classLabel, c.teacherName];
    return parts.filter(Boolean).join(', ');
  }
  protected cellLabel(day: string, band: TimeBand): string {
    const list = this.cell(day, band);
    const where = `${dayTitle(day)}, ${this.range(band)}`;
    if (!list.length) return `${where} : libre`;
    return `${where} : ${list.map((s) => sessionSummary(s, this.view() !== 'class').split(', ').slice(1).join(', ')).join(' ; ')}`;
  }

  protected open(row: number, col: number, day: string, band: TimeBand): void {
    this.active.set({ row, col });
    this.activate.emit({ day, band, sessions: this.cell(day, band) });
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') !== 'gridcell') return;
    const at = this.active();
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const day = this.days()[at.col]!;
      const band = this.rows()[at.row]!;
      this.activate.emit({ day, band, sessions: this.cell(day, band) });
      return;
    }
    const next = nextPosition(at, event.key, this.rows().length, this.days().length, event.ctrlKey);
    if (!next) return;
    event.preventDefault();
    this.active.set(next);
    this.#host.nativeElement.querySelector<HTMLElement>(`[data-pos="${next.row}-${next.col}"]`)?.focus();
  }

  protected dragStart(event: DragEvent, s: TimetableOccurrenceDto): void {
    this.#dragged.set(s);
    event.dataTransfer?.setData('text/plain', s.key);
  }

  protected drop(event: DragEvent, day: string, band: TimeBand): void {
    event.preventDefault();
    const s = this.#dragged();
    this.#dragged.set(null);
    if (s) this.dropped.emit({ session: s, day, band });
  }
}
