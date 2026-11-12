import { afterNextRender, Component, computed, DestroyRef, inject, input, resource, signal } from '@angular/core';
import { type CalendarDayDto, schoolTimeNow, type TimetableOccurrenceDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock, snapshotOf } from '../../../shared/components/home-block';
import { Badge } from '../../../shared/ui';
import { blockState, bothOf, type Snapshot } from '../../../shared/utils/block-state';
import { clock } from '../../../shared/utils/format';
import { TimetableApi } from '../../timetable/timetable-api';
import { isStruck, sessionTitle, STATUS_LABELS, STATUS_TONES } from '../../timetable/timetable-format';
import { nowView, placeLine } from './now-next';

/**
 * « Maintenant », the highlighted block: the class in progress or the next one (subject, room, teacher,
 * end time), or a calm word when the day is over, on a holiday or at the weekend; then today's sessions
 * in a row. The clock (Cairo time) moves every 30 seconds, in the browser only.
 */
@Component({
  selector: 'app-now-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Maintenant"
      headingId="bloc-maintenant"
      [state]="s"
      link="emploi-du-temps"
      linkLabel="Emploi du temps de la semaine"
      loadingLabel="Chargement de la journée…"
      [wide]="true"
      tone="inverse"
    >
      @if (s.status === 'ready') {
        @let view = s.data;
        <div class="now">
          <p class="now__lead">{{ view.lead }}</p>
          @switch (view.state.kind) {
            @case ('quiet') {
              <p class="now__quiet">{{ view.quiet }}</p>
            }
            @default {
              @if (focus(); as session) {
                <p class="now__subject">
                  {{ title(session) }}
                  @if (label(session)) {
                    <cdls-badge [tone]="tone(session)">{{ label(session) }}</cdls-badge>
                  }
                </p>
                <p class="now__place">{{ place(session) }}</p>
              }
            }
          }
        </div>
        @if (view.strip.length) {
          <div class="day">
            <h3 class="day__title" id="bloc-maintenant-jour">Aujourd’hui</h3>
            <ol class="day__list" role="list" aria-labelledby="bloc-maintenant-jour">
              @for (item of view.strip; track item.session.key) {
                <li
                  class="day__item"
                  [class.day__item--past]="item.phase === 'past'"
                  [class.day__item--current]="item.phase === 'current' && !struck(item.session)"
                  [class.day__item--struck]="struck(item.session)"
                >
                  <span class="day__time">{{ start(item.session) }}</span>
                  <span class="day__name">{{ title(item.session) }}</span>
                  @if (item.session.current.roomName; as room) {
                    <span class="day__meta">{{ room }}</span>
                  }
                  @if (label(item.session)) {
                    <cdls-badge [tone]="tone(item.session)">{{ label(item.session) }}</cdls-badge>
                  }
                  @if (item.phase === 'current' && !struck(item.session)) {
                    <span class="day__now">En cours</span>
                  } @else if (item.phase === 'past') {
                    <span class="visually-hidden">, terminé</span>
                  }
                </li>
              }
            </ol>
          </div>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .now {
      display: grid;
      gap: var(--space-2);
    }
    .now p {
      margin: 0;
    }
    .now__lead {
      color: var(--color-accent);
      font-size: var(--text-label-m);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .now__subject {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-3);
      font-family: var(--font-display);
      font-size: var(--text-h1);
      line-height: var(--text-h1--line-height);
      font-weight: 600;
      color: var(--color-on-inverse);
      overflow-wrap: anywhere;
    }
    .now__subject cdls-badge {
      font-family: var(--font-sans);
    }
    .now__place,
    .now__quiet {
      color: var(--color-on-inverse);
      font-size: var(--text-body-l);
    }
    .day {
      display: grid;
      gap: var(--space-3);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-navy-700);
    }
    .day__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-on-inverse);
    }
    .day__list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* Each session is a light tile on the navy block: badges and text keep their usual contrast. */
    .day__item {
      display: grid;
      align-content: start;
      justify-items: start;
      gap: var(--space-1);
      padding: var(--space-3);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-sm);
      background: var(--color-page);
      color: var(--color-body);
    }
    .day__time {
      font-size: var(--text-body-s);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--color-heading);
    }
    .day__name {
      font-weight: 600;
      color: var(--color-heading);
      overflow-wrap: anywhere;
    }
    .day__meta {
      font-size: var(--text-body-s);
      color: var(--color-muted);
    }
    /* Past: quieter tile, text still at AA contrast (no opacity). */
    .day__item--past {
      background: var(--color-subtle);
      border-color: var(--color-subtle);
    }
    .day__item--past .day__time,
    .day__item--past .day__name {
      color: var(--color-muted);
      font-weight: 500;
    }
    /* Current: outlined in gold, and says « En cours » (never colour alone). */
    .day__item--current {
      background: var(--color-surface);
      border-color: var(--color-surface);
      outline: 3px solid var(--color-accent);
      outline-offset: 0;
    }
    .day__now {
      font-size: var(--text-label-s);
      font-weight: 600;
      color: var(--color-heading);
    }
    .day__item--struck .day__time,
    .day__item--struck .day__name,
    .day__item--struck .day__meta {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
    }
  `,
})
export class NowBlock {
  /** Today in Cairo, `YYYY-MM-DD`. */
  readonly today = input.required<string>();

  readonly #timetable = inject(TimetableApi);
  readonly #api = inject(ApiClient);
  readonly #now = signal(schoolTimeNow());

  readonly #sessions = resource({
    params: () => ({ from: this.today(), to: this.today() }),
    loader: ({ params }) => this.#timetable.occurrences(params),
  });
  /** Holidays and days without classes; if they cannot be read, the block still shows the sessions. */
  readonly #days = resource({
    params: () => ({ from: this.today(), to: this.today() }),
    loader: ({ params }) => this.#api.school.calendarDays(params),
  });

  protected readonly state = computed(() => {
    const days = snapshotOf(this.#days);
    const calendar: Snapshot<readonly CalendarDayDto[]> = days.error ? { error: undefined, value: [] } : days;
    return blockState(bothOf(snapshotOf(this.#sessions), calendar), ([sessions, closed]) =>
      nowView(sessions, closed, this.today(), this.#now()),
    );
  });

  /** The class shown big: the one in progress, else the next one. */
  protected readonly focus = computed(() => {
    const s = this.state();
    if (s.status !== 'ready') return null;
    const state = s.data.state;
    return state.kind === 'quiet' ? null : state.session;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const timer = setInterval(() => this.#now.set(schoolTimeNow()), 30_000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected title(session: TimetableOccurrenceDto): string {
    return sessionTitle(session);
  }
  protected place(session: TimetableOccurrenceDto): string {
    return placeLine(session);
  }
  protected start(session: TimetableOccurrenceDto): string {
    return clock(session.status === 'moved_from' ? session.original.startTime : session.current.startTime);
  }
  protected label(session: TimetableOccurrenceDto): string {
    return STATUS_LABELS[session.status];
  }
  protected tone(session: TimetableOccurrenceDto) {
    return STATUS_TONES[session.status];
  }
  protected struck(session: TimetableOccurrenceDto): boolean {
    return isStruck(session);
  }
}
