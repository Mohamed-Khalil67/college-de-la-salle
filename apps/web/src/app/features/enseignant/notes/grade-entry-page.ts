import { Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addDays, type EventDto, todayIso } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { Button, EmptyState } from '../../../shared/ui';
import { dayTitle, kindLabel, mark } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';
import { teacherAssignments } from '../../../shared/data/teacher-data';
import { GradeGrid } from './grade-grid';

/** Grade entry: pick a class, then one of its gradable evaluations, then fill the grid. */
@Component({
  selector: 'app-grade-entry-page',
  imports: [RouterLink, Button, EmptyState, LoadState, GradeGrid],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Saisie des notes</h1>
        <p class="t-muted">{{ subtitle() }}</p>
      </div>
    </div>

    <app-load-state [ref]="assignments" label="Chargement de vos classes…" />
    @if (assignments.hasValue()) {
      @if (classes().length) {
        <div class="filters picker">
          <div class="field">
            <label class="field__label" for="notes-classe">Classe</label>
            <select class="field__control" id="notes-classe" (change)="classId.set($any($event.target).value)">
              @for (c of classes(); track c.id) {
                <option [value]="c.id" [selected]="c.id === classId()">{{ c.label }}</option>
              }
            </select>
          </div>
          @if (evaluations().length) {
            <div class="field">
              <label class="field__label" for="notes-evaluation">Évaluation</label>
              <select class="field__control" id="notes-evaluation" (change)="eventId.set($any($event.target).value)">
                @for (e of evaluations(); track e.id) {
                  <option [value]="e.id" [selected]="e.id === eventId()">{{ optionLabel(e) }}</option>
                }
              </select>
            </div>
          }
        </div>

        <app-load-state [ref]="events" label="Chargement des évaluations…" />
        @if (events.hasValue()) {
          @if (selected(); as event) {
            <h2 class="t-h2 grid-title">{{ event.title }}</h2>
            <p class="t-muted grid-meta">{{ meta(event) }}</p>
            <app-grade-grid [event]="event" [context]="context()" [className]="className()" />
          } @else {
            <cdls-empty-state icon="file-text" title="Aucune évaluation à noter" description="Créez d’abord un examen, un contrôle, un devoir ou un TP pour cette classe dans l’agenda, puis revenez saisir les notes.">
              <a cdlsButton variant="secondary" routerLink="../agenda">Ouvrir l’agenda</a>
            </cdls-empty-state>
          }
        }
      } @else {
        <cdls-empty-state icon="users" title="Aucune classe" description="Vous n’êtes affecté à aucune classe cette année." />
      }
    }
  `,
  styles: `
    .picker {
      grid-template-columns: repeat(auto-fit, minmax(14rem, 22rem));
      margin-bottom: var(--space-6);
    }
    .grid-meta {
      margin-bottom: var(--space-4);
    }
  `,
})
export class GradeEntryPage {
  /** ?classe=<id> from « Mes classes ». */
  readonly classe = input<string>();
  /** ?evaluation=<event id> */
  readonly evaluation = input<string>();

  readonly #api = inject(ApiClient);
  readonly #today = todayIso();
  protected readonly assignments = teacherAssignments();

  protected readonly classes = computed(() => {
    const list = this.assignments.hasValue() ? this.assignments.value() : [];
    return [...new Map(list.map((a) => [a.classId, a.classLabel]))]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  });
  protected readonly classId = linkedSignal(() => {
    const wanted = this.classe();
    return this.classes().find((c) => c.id === wanted)?.id ?? this.classes()[0]?.id ?? '';
  });
  protected readonly className = computed(() => this.classes().find((c) => c.id === this.classId())?.label ?? 'la classe');
  readonly #subjects = computed(() => {
    const list = this.assignments.hasValue() ? this.assignments.value() : [];
    return new Set(list.filter((a) => a.classId === this.classId()).map((a) => a.subjectId));
  });

  /** The last six months and the coming week (the API serves 186 days at most). */
  protected readonly events = resource({
    params: () => (this.classId() ? { from: addDays(this.#today, -178), to: addDays(this.#today, 7), classId: this.classId() } : undefined),
    loader: ({ params }) => this.#api.calendar.events(params),
  });
  /** Gradable events of this class in the teacher's subjects, newest first. */
  protected readonly evaluations = computed(() =>
    (this.events.hasValue() ? this.events.value() : [])
      .filter((e) => e.type.gradable && e.classId === this.classId() && !!e.subjectId && this.#subjects().has(e.subjectId))
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  protected readonly eventId = linkedSignal(() => {
    const wanted = this.evaluation();
    const list = this.evaluations();
    const past = list.find((e) => e.date <= this.#today);
    return list.find((e) => e.id === wanted)?.id ?? past?.id ?? list[0]?.id ?? '';
  });
  protected readonly selected = computed(() => this.evaluations().find((e) => e.id === this.eventId()) ?? null);
  /** Up to four other evaluations of the same subject, oldest first. */
  protected readonly context = computed(() => {
    const s = this.selected();
    if (!s) return [];
    return this.evaluations()
      .filter((e) => e.id !== s.id && e.subjectId === s.subjectId)
      .slice(0, 4)
      .reverse();
  });

  protected readonly subtitle = computed(() =>
    this.selected() ? `${this.className()}, ${kindLabel(this.selected()!.type).toLowerCase()}` : 'Choisissez une classe puis une évaluation.',
  );

  protected optionLabel(e: EventDto): string {
    const who = e.target.whole ? '' : ` (${e.target.groups.map((g) => g.label).join(', ') || 'élèves nommés'})`;
    return `${dayTitle(e.date)} : ${e.title}${who}`;
  }
  protected meta(e: EventDto): string {
    return `${kindLabel(e.type)} du ${dayTitle(e.date).toLowerCase()}, coefficient ${mark(e.coefficient)}`;
  }
}
