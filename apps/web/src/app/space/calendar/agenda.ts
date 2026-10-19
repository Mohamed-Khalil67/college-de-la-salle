import { Component, computed, input, output, signal } from '@angular/core';
import { matiereName } from '../../school';
import {
  addDays,
  byDay,
  type CalendarEvent,
  EVENT_KINDS,
  type EventKind,
  eventsForTarget,
  kindInfo,
  longDay,
  monthGrid,
  monthTitle,
  type Occurrence,
  occurrences,
  shiftMonth,
  shortDay,
  TARGET_OPTIONS,
  timeRange,
  todayIso,
  weekDays,
} from '@cdls/shared';
import { KIND_STYLES, SPACE_STYLES } from '../space-styles';

type View = 'week' | 'month';

const RANGE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * The calendar at the heart of both spaces: a week view (default; one column per day, stacked on phones)
 * and a month view. Hovering or focusing an event previews it; clicking opens it (`open`). With
 * `editable`, teachers also filter by class and add an event on a given day (`add`).
 */
@Component({
  selector: 'space-agenda',
  template: `
    <section class="grid gap-4" aria-labelledby="agenda-title" data-testid="agenda">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-outline-dark nav" (click)="go(-1)" [attr.aria-label]="view() === 'week' ? 'Semaine précédente' : 'Mois précédent'" data-testid="cal-prev">←</button>
          <h2 id="agenda-title" class="m-0 min-w-56 text-center text-xl first-letter:uppercase" aria-live="polite" data-testid="cal-title">{{ title() }}</h2>
          <button type="button" class="btn btn-outline-dark nav" (click)="go(1)" [attr.aria-label]="view() === 'week' ? 'Semaine suivante' : 'Mois suivant'" data-testid="cal-next">→</button>
          <button type="button" class="btn btn-outline-dark" (click)="goToday()" data-testid="cal-today">Aujourd’hui</button>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          @if (editable()) {
            <label class="flex items-center gap-2">
              <span class="font-semibold">Classe</span>
              <select #filter data-testid="cal-filter" (change)="target.set(filter.value)">
                @for (t of targets; track t.value) {
                  <option [value]="t.value" [selected]="target() === t.value">{{ t.label }}</option>
                }
              </select>
            </label>
          }
          <div class="flex gap-1 rounded-full bg-navy-100 p-1" role="group" aria-label="Affichage">
            <button type="button" class="tab" [attr.aria-pressed]="view() === 'week'" (click)="view.set('week')" data-testid="view-week">Semaine</button>
            <button type="button" class="tab" [attr.aria-pressed]="view() === 'month'" (click)="view.set('month')" data-testid="view-month">Mois</button>
          </div>
        </div>
      </div>

      @if (subjects().length > 1) {
        <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrer par matière" data-testid="subject-filter">
          <button type="button" class="chip" [attr.aria-pressed]="!subject()" (click)="subject.set('')">Toutes les matières</button>
          @for (s of subjects(); track s) {
            <button type="button" class="chip" [attr.aria-pressed]="subject() === s" (click)="subject.set(subject() === s ? '' : s)">{{ subjectName(s) }}</button>
          }
        </div>
      }

      @if (view() === 'week') {
        <ol class="m-0 grid list-none gap-2 p-0 md:grid-cols-7" data-testid="week">
          @for (day of week(); track day) {
            <li class="day-col" [class.today]="day === today" [attr.data-day]="day" data-testid="cal-day">
              <div class="flex items-center justify-between gap-1 border-b border-line pb-1">
                <h3 class="m-0 text-sm font-semibold first-letter:uppercase" [attr.aria-label]="longDay(day)">{{ shortDay(day) }}</h3>
                @if (editable()) {
                  <button type="button" class="add" (click)="add.emit(day)" [attr.aria-label]="'Ajouter un événement le ' + longDay(day)" data-testid="cal-add-day">+</button>
                }
              </div>
              <ul class="m-0 grid list-none gap-1.5 p-0 pt-1.5">
                @for (o of byDayMap().get(day) ?? []; track o.key) {
                  <li class="occ">
                    <button type="button" class="event" [class]="'k-' + o.event.kind" [class.done]="isDone(o)" (click)="open.emit(o)" data-testid="cal-event">
                      <span class="block text-xs font-bold uppercase tracking-wide">{{ kindLabel(o.event.kind) }}@if (isDone(o)) { · fait }@if (isGraded(o)) { · noté }</span>
                      <span class="block text-xs">{{ timeRange(o.event) }}</span>
                      <span class="block font-semibold leading-snug" dir="auto" data-testid="cal-event-title">{{ o.event.title }}</span>
                      @if (o.event.place) {
                        <span class="block text-xs" dir="auto">{{ o.event.place }}</span>
                      }
                    </button>
                    <div class="preview" aria-hidden="true">
                      <p class="m-0 text-xs font-bold uppercase" [class]="'k-' + o.event.kind + ' rounded px-1.5 py-0.5 inline-block'">{{ kindLabel(o.event.kind) }}</p>
                      <p class="m-0 mt-1 font-semibold" dir="auto">{{ o.event.title }}</p>
                      <p class="m-0 text-sm">{{ longDay(o.day) }} · {{ timeRange(o.event) }}</p>
                      @if (o.event.place) { <p class="m-0 text-sm" dir="auto">{{ o.event.place }}</p> }
                      @if (o.event.subject) { <p class="m-0 text-sm">{{ subjectName(o.event.subject) }}</p> }
                      @if (o.event.description) { <p class="m-0 mt-1 line-clamp-3 text-sm text-muted" dir="auto">{{ o.event.description }}</p> }
                      <p class="m-0 mt-1 text-xs text-muted">Cliquez pour ouvrir</p>
                    </div>
                  </li>
                } @empty {
                  <li class="py-2 text-center text-sm text-muted" aria-label="Rien de prévu">—</li>
                }
              </ul>
            </li>
          }
        </ol>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-line bg-surface">
          <table class="w-full min-w-176 table-fixed border-collapse" data-testid="month">
            <caption class="visually-hidden">{{ title() }}</caption>
            <thead>
              <tr>
                @for (d of monthHead(); track d) {
                  <th scope="col" class="border-b border-line p-2 text-sm font-semibold text-muted">{{ d }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (w of month(); track w[0]!.day) {
                <tr>
                  @for (c of w; track c.day) {
                    <td class="h-28 border border-line p-1 align-top" [class.bg-page]="!c.inMonth" [class.today]="c.day === today" [attr.data-day]="c.day">
                      <div class="flex items-center justify-between">
                        <span class="px-1 text-sm" [class.font-bold]="c.inMonth" [class.text-muted]="!c.inMonth">{{ dayNumber(c.day) }}</span>
                        @if (editable()) {
                          <button type="button" class="add" (click)="add.emit(c.day)" [attr.aria-label]="'Ajouter un événement le ' + longDay(c.day)">+</button>
                        }
                      </div>
                      @for (o of (byDayMap().get(c.day) ?? []).slice(0, 3); track o.key) {
                        <button type="button" class="mini" [class]="'k-' + o.event.kind" (click)="open.emit(o)" [attr.aria-label]="kindLabel(o.event.kind) + ' : ' + o.event.title + ', ' + timeRange(o.event)" data-testid="cal-event">
                          {{ o.event.start }} {{ o.event.title }}
                        </button>
                      }
                      @if ((byDayMap().get(c.day)?.length ?? 0) > 3) {
                        <button type="button" class="link text-xs" (click)="showWeek(c.day)">+ {{ byDayMap().get(c.day)!.length - 3 }} autre(s)</button>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <ul class="m-0 flex list-none flex-wrap gap-2 p-0 text-xs" aria-label="Légende">
        @for (k of kinds; track k.id) {
          <li class="rounded-full border px-2.5 py-0.5 font-semibold" [class]="'k-' + k.id">{{ k.label }}</li>
        }
      </ul>
    </section>
  `,
  styles: [
    SPACE_STYLES,
    KIND_STYLES,
    `
      select { padding-block: 0.4rem; }
      .nav { padding-inline: 0.8rem; }
      .tab[aria-pressed='true'] { background: var(--navy-900); color: var(--cream); }
      .chip { padding: 0.3rem 0.8rem; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font: inherit; font-size: 0.875rem; font-weight: 600; color: var(--navy-700); cursor: pointer; }
      .chip[aria-pressed='true'] { background: var(--navy-900); border-color: var(--navy-900); color: var(--cream); }
      .day-col { min-block-size: 6rem; padding: 0.5rem; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
      .day-col.today { box-shadow: inset 0 0 0 2px var(--gold-ink); }
      td.today { box-shadow: inset 0 0 0 2px var(--gold-ink); }
      .add { inline-size: 1.75rem; block-size: 1.75rem; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font: inherit; font-weight: 700; color: var(--navy-700); cursor: pointer; }
      .add:hover { background: var(--navy-100); }
      .occ { position: relative; }
      .event { display: block; inline-size: 100%; text-align: start; padding: 0.4rem 0.5rem; border: 0; border-inline-start: 4px solid; border-radius: 8px; font: inherit; cursor: pointer; }
      .event:hover { filter: brightness(0.96); }
      .event.done { opacity: 0.7; text-decoration: line-through; }
      .mini { display: block; inline-size: 100%; margin-block-start: 2px; padding: 0 0.3rem; border: 0; border-inline-start: 3px solid; border-radius: 4px; font: inherit; font-size: 0.75rem; font-weight: 600; text-align: start; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
      .preview { display: none; position: absolute; z-index: 20; inset-block-start: calc(100% + 4px); inset-inline-start: 0; inline-size: max(100%, 16rem); padding: 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: #fff; box-shadow: 0 10px 25px rgb(10 25 47 / 0.15); pointer-events: none; }
      @media (hover: hover) and (min-width: 768px) {
        .occ:hover .preview, .occ:focus-within .preview { display: block; }
      }
    `,
  ],
})
export class Agenda {
  /** Already filtered to what the viewer may see (a student's page passes only their class's events). */
  readonly events = input.required<readonly CalendarEvent[]>();
  readonly editable = input(false);
  /** Student: ids of the homework marked as done, and of the events that have a grade. */
  readonly doneIds = input<readonly string[]>([]);
  readonly gradedIds = input<readonly string[]>([]);

  readonly open = output<Occurrence>();
  readonly add = output<string>();

  protected readonly today = todayIso();
  protected readonly kinds = EVENT_KINDS;
  protected readonly targets = TARGET_OPTIONS;

  protected readonly view = signal<View>('week');
  protected readonly anchor = signal(this.today);
  protected readonly subject = signal('');
  protected readonly target = signal('all');

  protected readonly week = computed(() => weekDays(this.anchor()));
  protected readonly month = computed(() => {
    const [y, m] = this.anchor().split('-').map(Number);
    return monthGrid(y!, m!);
  });
  protected readonly monthHead = computed(() => (this.month()[0] ?? []).map((c) => shortDay(c.day).split(' ')[0]!));

  protected readonly title = computed(() => {
    if (this.view() === 'month') {
      const [y, m] = this.anchor().split('-').map(Number);
      return monthTitle(y!, m!);
    }
    const days = this.week();
    return `Semaine du ${RANGE.format(new Date(`${days[0]}T12:00:00Z`))} au ${RANGE.format(new Date(`${days[6]}T12:00:00Z`))}`;
  });

  readonly #visible = computed(() => {
    const byTarget = this.editable() ? eventsForTarget(this.events(), this.target()) : this.events();
    return this.subject() ? byTarget.filter((e) => e.subject === this.subject()) : byTarget;
  });

  /** Subjects present in the events, for the filter chips. */
  protected readonly subjects = computed(() =>
    [...new Set(this.events().map((e) => e.subject).filter(Boolean))].sort((a, b) => matiereName(a).localeCompare(matiereName(b), 'fr')),
  );

  protected readonly byDayMap = computed(() => {
    const cells = this.view() === 'week' ? this.week() : this.month().flat().map((c) => c.day);
    return byDay(occurrences(this.#visible(), cells[0]!, cells.at(-1)!));
  });

  protected readonly kindLabel = (kind: EventKind) => kindInfo(kind).label;
  protected readonly timeRange = timeRange;
  protected readonly longDay = longDay;
  protected readonly shortDay = shortDay;
  protected readonly subjectName = matiereName;

  protected dayNumber(day: string): number {
    return Number(day.slice(8));
  }

  protected isDone(o: Occurrence): boolean {
    return o.event.kind === 'devoir' && this.doneIds().includes(o.event.id);
  }

  protected isGraded(o: Occurrence): boolean {
    return this.gradedIds().includes(o.event.id);
  }

  protected go(delta: number): void {
    if (this.view() === 'week') {
      this.anchor.update((d) => addDays(d, 7 * delta));
      return;
    }
    const [y, m] = this.anchor().split('-').map(Number);
    const next = shiftMonth(y!, m!, delta);
    this.anchor.set(`${next.year}-${String(next.month).padStart(2, '0')}-01`);
  }

  protected goToday(): void {
    this.anchor.set(this.today);
  }

  protected showWeek(day: string): void {
    this.anchor.set(day);
    this.view.set('week');
  }
}

