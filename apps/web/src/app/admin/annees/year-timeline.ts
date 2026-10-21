import { Component, computed, input, output } from '@angular/core';
import type { SchoolYearDto, SectionDto } from '@cdls/shared';
import { formatRange } from '../shared/admin-format';
import { barGeometry, monthTicks } from '../shared/day-math';
import { entriesOfSection, LANES, placeInRows, type Lane, type PlacedEntry, type TimelineEntry } from './year-plan';

interface LaneView {
  readonly id: Lane;
  readonly label: string;
  readonly rows: number;
  readonly bars: readonly BarView[];
}

interface BarView {
  readonly entry: TimelineEntry;
  readonly left: number;
  readonly width: number;
  readonly row: number;
  readonly aria: string;
}

interface SectionView {
  readonly section: SectionDto;
  readonly lanes: readonly LaneView[];
}

const ROW_REM = 2.5;

/**
 * The year on a horizontal timeline: for each section, a lane of periods, a lane of holidays and a lane of
 * exam weeks. Every bar is a button that opens it in the form below. Bars carry their name; colour and
 * pattern only tell the lanes apart, and the table under the timeline lists the same entries as text.
 */
@Component({
  selector: 'app-year-timeline',
  template: `
    <div
      class="timeline"
      role="region"
      tabindex="0"
      [attr.aria-label]="'Calendrier annuel ' + year().label + ', à faire défiler horizontalement'"
    >
      <div class="timeline__inner">
        <div class="timeline__months" aria-hidden="true">
          @for (month of months(); track month.day) {
            <span class="timeline__month" [style.left.%]="month.left" [style.width.%]="month.width">{{ month.label }}</span>
          }
        </div>
        @for (block of blocks(); track block.section.id) {
          <section class="tl-section" [attr.aria-labelledby]="'tl-' + block.section.id">
            <h3 class="t-h3" [id]="'tl-' + block.section.id">{{ block.section.label }}</h3>
            @for (lane of block.lanes; track lane.id) {
              <div class="tl-lane" role="group" [attr.aria-label]="lane.label + ', ' + block.section.label">
                <p class="tl-lane__label">{{ lane.label }}</p>
                <div class="tl-track" [style.height.rem]="lane.rows * rowRem">
                  @for (month of months(); track month.day) {
                    <span class="tl-grid" aria-hidden="true" [style.left.%]="month.left"></span>
                  }
                  @for (bar of lane.bars; track bar.entry.key) {
                    <button
                      type="button"
                      class="tl-bar"
                      [class]="'tl-bar tl-bar--' + lane.id"
                      [class.tl-bar--locked]="bar.entry.locked"
                      [class.tl-bar--selected]="bar.entry.key === selectedKey()"
                      [attr.aria-current]="bar.entry.key === selectedKey() ? 'true' : null"
                      [attr.aria-label]="bar.aria"
                      [style.left.%]="bar.left"
                      [style.width.%]="bar.width"
                      [style.top.rem]="bar.row * rowRem"
                      (click)="select.emit(bar.entry)"
                    >
                      @if (bar.entry.locked) {
                        <svg class="tl-bar__lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                        </svg>
                      }
                      <span class="tl-bar__text">{{ bar.entry.label }}</span>
                    </button>
                  }
                </div>
              </div>
            }
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .timeline {
      overflow-x: auto;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .timeline:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .timeline__inner {
      min-width: 60rem;
      padding: var(--space-4) var(--space-6) var(--space-6);
      display: grid;
      gap: var(--space-4);
    }
    .timeline__months {
      position: relative;
      height: 1.5rem;
      color: var(--color-muted);
      font-size: var(--text-label-s);
    }
    .timeline__month {
      position: absolute;
      top: 0;
      overflow: hidden;
      padding-inline-start: var(--space-1);
      white-space: nowrap;
    }
    .tl-section {
      display: grid;
      gap: var(--space-2);
    }
    .tl-lane__label {
      margin-bottom: var(--space-1);
      color: var(--color-muted);
      font-size: var(--text-label-s);
    }
    .tl-track {
      position: relative;
      border-block: 1px solid var(--color-line);
      background: var(--color-page);
    }
    .tl-grid {
      position: absolute;
      top: 0;
      bottom: 0;
      border-inline-start: 1px solid var(--color-line);
    }
    .tl-bar {
      position: absolute;
      display: flex;
      align-items: center;
      gap: var(--space-1);
      height: 2.25rem;
      min-width: 1.5rem;
      margin-block: 0.125rem;
      padding: 0 var(--space-2);
      overflow: hidden;
      border: 2px solid var(--bar-solid);
      border-radius: var(--radius-sm);
      background: var(--bar-tint);
      color: var(--color-body);
      font: inherit;
      font-size: var(--text-label-s);
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
    }
    .tl-bar__text {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tl-bar:hover {
      background: var(--color-surface);
    }
    .tl-bar:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
      z-index: 2;
    }
    .tl-bar--selected {
      box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-primary);
      z-index: 1;
    }
    .tl-bar--periods {
      --bar-solid: var(--color-navy-700);
      --bar-tint: var(--color-navy-100);
    }
    .tl-bar--closures {
      --bar-solid: var(--color-gold-700);
      --bar-tint: repeating-linear-gradient(135deg, var(--color-gold-100) 0 6px, var(--color-surface) 6px 12px);
      border-style: dashed;
    }
    .tl-bar--exams {
      --bar-solid: var(--color-brick-700);
      --bar-tint: var(--color-brick-100);
      border-style: dotted;
    }
    .tl-bar--locked {
      border-style: double;
      border-width: 4px;
    }
    .tl-bar__lock {
      flex: none;
      width: 1rem;
      height: 1rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class YearTimeline {
  readonly year = input.required<SchoolYearDto>();
  readonly sections = input.required<readonly SectionDto[]>();
  readonly entries = input.required<readonly TimelineEntry[]>();
  /** Class id → section id, to place the days aimed at some classes. */
  readonly sectionOfClass = input<ReadonlyMap<string, string>>(new Map());
  readonly selectedKey = input<string | null>(null);
  readonly select = output<TimelineEntry>();

  protected readonly rowRem = ROW_REM;
  protected readonly months = computed(() => monthTicks(this.year().startsOn, this.year().endsOn));
  protected readonly blocks = computed<SectionView[]>(() => {
    const year = this.year();
    return this.sections().map((section) => {
      const own = entriesOfSection(this.entries(), section.id, this.sectionOfClass());
      return {
        section,
        lanes: LANES.map((lane) => {
          const { placed, rows } = placeInRows(own.filter((e) => e.lane === lane.id));
          return {
            id: lane.id,
            label: lane.label,
            rows,
            bars: placed.map((p) => this.#bar(p, year)),
          };
        }),
      };
    });
  });

  #bar(placed: PlacedEntry, year: SchoolYearDto): BarView {
    const { entry } = placed;
    const geometry = barGeometry(entry.startsOn, entry.endsOn, year.startsOn, year.endsOn);
    const scope = entry.sectionId === null && !entry.classIds.length ? ', toute l’école' : '';
    const lock = entry.locked ? ', clôturée, verrouillée' : '';
    return {
      entry,
      left: geometry.left,
      width: Math.max(geometry.width, 0.6),
      row: placed.row,
      aria: `${entry.kindLabel} : ${entry.label}, ${formatRange(entry.startsOn, entry.endsOn)}${scope}${lock}. Modifier.`,
    };
  }
}
