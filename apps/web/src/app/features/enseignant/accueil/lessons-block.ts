import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CalendarDayDto, TimetableOccurrenceDto } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { Badge, Button } from '../../../shared/ui';
import { blockState, bothOf, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { clock } from '../../../shared/utils/format';
import { TimetableApi } from '../../timetable/timetable-api';
import { sessionTitle, STATUS_LABELS, STATUS_TONES } from '../../timetable/timetable-format';
import { type LessonItem, lessonsEmptyText, lessonsView } from './home-views';

/**
 * « Mes cours aujourd’hui », the highlighted block: each class of the day with its three actions (Appel,
 * Noter, Devoir); the one in progress is outlined and says « En cours »; a class already over is quieter.
 * Cancelled or moved-away classes are written out, struck through, without actions. The clock is Cairo time.
 */
@Component({
  selector: 'app-lessons-block',
  imports: [Badge, Button, HomeBlock, RouterLink],
  template: `
    @let s = state();
    <app-home-block
      heading="Mes cours aujourd’hui"
      headingId="bloc-cours"
      [state]="s"
      link="emploi-du-temps"
      linkLabel="Mon emploi du temps de la semaine"
      loadingLabel="Chargement de votre journée…"
      [emptyText]="emptyText()"
      [wide]="true"
      tone="inverse"
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <p class="lessons__lead">{{ s.data.lead }}</p>
        <ol class="lessons" role="list" aria-label="Vos cours d’aujourd’hui">
          @for (item of s.data.lessons; track item.session.key) {
            <li
              class="lesson"
              [class.lesson--past]="item.phase === 'past' && !item.struck"
              [class.lesson--live]="item.live"
              [class.lesson--struck]="item.struck"
            >
              <p class="lesson__time">{{ start(item) }}</p>
              <p class="lesson__name">
                {{ title(item.session) }}
                @if (label(item.session)) {
                  <cdls-badge [tone]="tone(item.session)">{{ label(item.session) }}</cdls-badge>
                }
              </p>
              <p class="lesson__meta">{{ meta(item.session) }}</p>
              @if (item.live) {
                <p class="lesson__now">En cours</p>
              } @else if (item.phase === 'past' && !item.struck) {
                <p class="lesson__over">Terminé</p>
              }
              @if (!item.struck) {
                <div class="lesson__actions">
                  <a cdlsButton variant="secondary" routerLink="appel" [queryParams]="{ classe: item.session.classId }"
                    >Appel<span class="visually-hidden"> {{ item.session.classLabel }}, {{ item.session.subjectName }}</span></a
                  >
                  <a
                    cdlsButton
                    variant="secondary"
                    routerLink="noter"
                    [queryParams]="{ classe: item.session.classId, matiere: item.session.subjectId }"
                    >Noter<span class="visually-hidden"> {{ item.session.classLabel }}, {{ item.session.subjectName }}</span></a
                  >
                  <a cdlsButton variant="secondary" routerLink="agenda"
                    >Devoir<span class="visually-hidden"> : ouvrir l’agenda</span></a
                  >
                </div>
              }
            </li>
          }
        </ol>
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .lessons__lead {
      margin: 0;
      color: var(--color-accent);
      font-size: var(--text-label-m);
      font-weight: 600;
    }
    .lessons {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* Each class is a light tile on the navy block: text and badges keep their usual contrast. */
    .lesson {
      display: grid;
      align-content: start;
      justify-items: start;
      gap: var(--space-1);
      padding: var(--space-4);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-sm);
      background: var(--color-page);
      color: var(--color-body);
      /* The gold focus ring of the navy block is 2.4:1 on a light tile: use the navy one here. */
      --color-focus: var(--color-navy-700);
    }
    .lesson p {
      margin: 0;
    }
    .lesson__time {
      font-size: var(--text-body-s);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--color-heading);
    }
    .lesson__name {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-2);
      font-weight: 600;
      color: var(--color-heading);
      overflow-wrap: anywhere;
    }
    .lesson__meta,
    .lesson__over {
      font-size: var(--text-body-s);
      color: var(--color-muted);
    }
    .lesson__now {
      font-size: var(--text-label-s);
      font-weight: 600;
      color: var(--color-heading);
    }
    .lesson__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
    .lesson--past {
      background: var(--color-subtle);
      border-color: var(--color-subtle);
    }
    .lesson--live {
      background: var(--color-surface);
      border-color: var(--color-surface);
      outline: 3px solid var(--color-accent);
      outline-offset: 0;
    }
    .lesson--struck .lesson__time,
    .lesson--struck .lesson__name,
    .lesson--struck .lesson__meta {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
    }
  `,
})
export class LessonsBlock {
  readonly #timetable = inject(TimetableApi);
  readonly #api = inject(ApiClient);
  readonly #auth = inject(AuthStore);
  readonly #clock = inject(SchoolClock);

  readonly #sessions = resource({
    params: () => {
      const teacherId = this.#auth.user()?.teacherId;
      return teacherId ? { teacherId, from: this.#clock.today(), to: this.#clock.today() } : undefined;
    },
    loader: ({ params }) => this.#timetable.occurrences(params),
  });
  /** Holidays and days without classes; if they cannot be read, the block still shows the sessions. */
  readonly #days = resource({
    params: () => ({ from: this.#clock.today(), to: this.#clock.today() }),
    loader: ({ params }) => this.#api.school.calendarDays(params),
  });

  readonly #calendar = computed<Snapshot<readonly CalendarDayDto[]>>(() => {
    const days = snapshotOf(this.#days);
    return days.error ? { error: undefined, value: [] } : days;
  });

  protected readonly state = computed(() =>
    blockState(bothOf(snapshotOf(this.#sessions), this.#calendar()), ([sessions]) =>
      lessonsView(sessions, this.#clock.today(), this.#clock.now()),
    ),
  );
  protected readonly emptyText = computed(() => lessonsEmptyText(this.#calendar().value ?? [], this.#clock.today()));

  /** Reloads only what failed, and not while it is already loading (two clicks fetch once). */
  protected reload(): void {
    if (this.#sessions.error() && !this.#sessions.isLoading()) this.#sessions.reload();
    if (this.#days.error() && !this.#days.isLoading()) this.#days.reload();
  }

  protected title(session: TimetableOccurrenceDto): string {
    return sessionTitle(session);
  }
  protected start(item: LessonItem): string {
    const values = item.session.status === 'moved_from' ? item.session.original : item.session.current;
    return `${clock(values.startTime)} – ${clock(values.endTime)}`;
  }
  protected meta(session: TimetableOccurrenceDto): string {
    return [session.classLabel, session.groupLabel ?? '', session.current.roomName ?? ''].filter(Boolean).join(', ');
  }
  protected label(session: TimetableOccurrenceDto): string {
    return STATUS_LABELS[session.status];
  }
  protected tone(session: TimetableOccurrenceDto) {
    return STATUS_TONES[session.status];
  }
}
