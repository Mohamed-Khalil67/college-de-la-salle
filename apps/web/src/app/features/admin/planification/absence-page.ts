import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import {
  ABSENCE_CHOICE_KINDS,
  ABSENCE_CHOICE_LABELS,
  type AbsenceChoiceKind,
  type AbsenceSessionDto,
  type AbsenceTeacherOption,
  type ApplyAbsenceResult,
  SLOT_EXCEPTION_LABELS,
  type TimetableConflictDto,
  type TimetableWarningCode,
  type TimetableWarningDto,
} from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { Alert, Badge, Button, EmptyState, Field, FieldControl } from '../../../shared/ui';
import { fieldValue, shownError } from '../../../shared/utils/forms';
import { dayTitle, plural, timeSpan } from '../../../shared/utils/format';
import { BlockedNotice } from '../../timetable/blocked-notice';
import { blockedOf } from '../../timetable/timetable-api';
import {
  acknowledgements,
  type AbsenceDecision,
  checkBeforeSave,
  choose,
  countChoices,
  type Decisions,
  decisionOf,
  decisionProblem,
  groupByDay,
  keyOf,
  offeredFor,
  periodProblem,
  refreshDecisions,
  replacedText,
  teacherNames,
  toChoices,
} from './absence-logic';

interface Request {
  readonly teacherId: string;
  readonly from: string;
  readonly to: string;
}

/**
 * « Professeur absent »: 1. the teacher and the days; 2. for each lesson, cancel it, give it to a free teacher
 * (the ones of the subject first) or turn it into a supervised study; 3. « Enregistrer et prévenir » saves all
 * the choices in one go and tells the students and the teachers concerned. The weekly timetable, the homework
 * and the tests are not touched. Only the admin and the planners reach it (the API checks it as well).
 */
@Component({
  selector: 'app-absence-page',
  imports: [
    Alert,
    Badge,
    BlockedNotice,
    Button,
    EmptyState,
    Field,
    FieldControl,
    FormField,
    RouterLink,
  ],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1" tabindex="-1" #heading>Professeur absent</h1>
        <p class="t-muted">
          Choisissez l’enseignant et les jours, puis décidez de chaque séance. Les élèves et les
          enseignants concernés sont prévenus à l’enregistrement.
        </p>
      </div>
      <div class="page__actions">
        <a cdlsButton variant="secondary" routerLink="/admin/planification"
          >Retour à la planification</a
        >
      </div>
    </div>

    @if (result(); as done) {
      <cdls-alert tone="success">
        <p>{{ doneText(done) }}</p>
        @if (done.warnings.length) {
          <p class="t-body-s">
            {{ plural(done.warnings.length, 'alerte acceptée', 'alertes acceptées') }}, avec le
            motif noté.
          </p>
        }
      </cdls-alert>
    }

    <section class="card card--panel absence__step" aria-labelledby="absence-etape-1">
      <h2 class="t-h3" id="absence-etape-1">1. Qui, et quand ?</h2>
      <form class="stack stack--sm" novalidate (submit)="lookUp($event)">
        <cdls-field label="Enseignant absent" [error]="err().teacherId">
          <select cdlsControl [formField]="periodForm.teacherId">
            <option value="">Choisir…</option>
            @for (t of teachers(); track t.id) {
              <option [value]="t.id">{{ t.name }}</option>
            }
          </select>
        </cdls-field>
        <div class="grid-2 grid-2--tight">
          <cdls-field label="Premier jour" [error]="err().from">
            <input cdlsControl type="date" [min]="today()" [formField]="periodForm.from" />
          </cdls-field>
          <cdls-field label="Dernier jour" [error]="err().to">
            <input cdlsControl type="date" [min]="periodModel().from" [formField]="periodForm.to" />
          </cdls-field>
        </div>
        <div>
          <button cdlsButton type="submit">Voir les séances</button>
        </div>
      </form>
    </section>

    @if (stale()) {
      <p class="t-body-s t-muted">
        Vous avez changé l’enseignant ou les jours : cliquez sur « Voir les séances » pour mettre la
        liste à jour.
      </p>
    }

    @if (request() && !stale()) {
      <section class="absence__step" aria-labelledby="absence-etape-2">
        <h2 class="t-h3" id="absence-etape-2" tabindex="-1" #lessonsHeading>
          2. Que faire de chaque séance ?
        </h2>
        @if (lessons.error()) {
          <cdls-alert tone="danger">{{ errorText() }}</cdls-alert>
          <div>
            <button cdlsButton variant="secondary" type="button" (click)="lessons.reload()">
              Réessayer
            </button>
          </div>
        } @else if (lessons.hasValue()) {
          @let preview = lessons.value();
          @if (!preview.sessions.length) {
            <cdls-empty-state
              icon="calendar"
              title="Aucune séance à traiter"
              [description]="
                preview.teacherName +
                ' n’a aucune séance du ' +
                longDay(preview.from) +
                ' au ' +
                longDay(preview.to) +
                ' (week-end, vacances ou emploi du temps vide).'
              "
            />
          } @else {
            <p class="t-body-s t-muted" role="status">
              {{ preview.teacherName }} :
              {{ plural(preview.sessions.length, 'séance', 'séances') }} du
              {{ longDay(preview.from) }} au {{ longDay(preview.to) }}.
            </p>
            @for (day of days(); track day.date) {
              <section class="absence__day" [attr.aria-labelledby]="'jour-' + day.date">
                <h3 class="t-label" [id]="'jour-' + day.date">{{ title(day.date) }}</h3>
                @for (s of day.sessions; track key(s)) {
                  @let d = decision(s);
                  <fieldset class="absence__lesson" [attr.data-key]="key(s)">
                    <legend class="absence__legend">
                      <span class="absence__time tabular">{{ span(s) }}</span>
                      {{ s.subjectName }}, {{ s.classLabel }}
                      @if (s.groupLabel) {
                        , {{ s.groupLabel }}
                      }
                      @if (s.roomName) {
                        <span class="t-muted"> · {{ s.roomName }}</span>
                      }
                      @if (s.currentKind) {
                        <cdls-badge tone="info">{{ currentLabel(s) }}</cdls-badge>
                      }
                    </legend>
                    <div class="absence__choices">
                      @for (kind of kinds; track kind) {
                        <label class="check">
                          <input
                            type="radio"
                            [name]="'choix-' + key(s)"
                            [value]="kind"
                            [checked]="d.kind === kind"
                            (change)="pick(s, kind)"
                          />
                          <span>{{ labels[kind] }}</span>
                        </label>
                      }
                    </div>
                    @if (d.kind === 'substitute' || d.kind === 'study') {
                      <div class="absence__who">
                        <cdls-field
                          [label]="
                            d.kind === 'substitute'
                              ? 'Enseignant qui remplace'
                              : 'Personne qui surveille'
                          "
                          [helper]="whoHelper(s, d)"
                          [error]="problem(s, d)"
                        >
                          <select
                            cdlsControl
                            [value]="d.teacherId"
                            (change)="setTeacher(s, $event)"
                          >
                            <option value="">Choisir…</option>
                            @if (sameSubject(s).length) {
                              <optgroup label="Même matière">
                                @for (t of sameSubject(s); track t.teacherId) {
                                  <option
                                    [value]="t.teacherId"
                                    [selected]="t.teacherId === d.teacherId"
                                  >
                                    {{ t.name }}
                                  </option>
                                }
                              </optgroup>
                            }
                            @if (others(s).length) {
                              <optgroup label="Autres enseignants libres">
                                @for (t of others(s); track t.teacherId) {
                                  <option
                                    [value]="t.teacherId"
                                    [selected]="t.teacherId === d.teacherId"
                                  >
                                    {{ t.name }}
                                  </option>
                                }
                              </optgroup>
                            }
                          </select>
                        </cdls-field>
                        @if (d.kind === 'study') {
                          <cdls-field label="Salle de l’étude" helper="Vide : la salle du cours.">
                            <select cdlsControl [value]="d.roomId" (change)="setRoom(s, $event)">
                              <option value="">
                                {{
                                  s.roomName
                                    ? 'Salle du cours (' + s.roomName + ')'
                                    : 'Salle du cours'
                                }}
                              </option>
                              @for (r of rooms(); track r.id) {
                                <option [value]="r.id" [selected]="r.id === d.roomId">
                                  {{ r.name }}
                                </option>
                              }
                            </select>
                          </cdls-field>
                        }
                      </div>
                    }
                  </fieldset>
                }
              </section>
            }

            <section class="card card--panel absence__step" aria-labelledby="absence-etape-3">
              <h2 class="t-h3" id="absence-etape-3">3. Enregistrer et prévenir</h2>
              <cdls-field
                label="Motif (facultatif)"
                helper="Les élèves le lisent dans leur notification."
              >
                <input
                  cdlsControl
                  type="text"
                  autocomplete="off"
                  maxlength="500"
                  [value]="reason()"
                  (input)="setReason($event)"
                />
              </cdls-field>
              <p class="t-body-s">{{ summary() }}</p>
              @if (failure()) {
                <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
              }
              @if (refreshed().length) {
                <cdls-alert tone="danger">
                  <p class="t-body-s" id="absence-refresh" tabindex="-1" #refreshNotice>
                    <strong>Rien n’a été enregistré : la disponibilité des enseignants a changé.</strong>
                  </p>
                  <ul class="issues">
                    @for (text of refreshed(); track $index) {
                      <li>{{ text }}</li>
                    }
                  </ul>
                  <p class="t-body-s">
                    La liste est à jour et vos autres choix sont gardés. Vérifiez, puis enregistrez de
                    nouveau.
                  </p>
                </cdls-alert>
              }
              @if (showMissing() && !check().ready) {
                <cdls-alert tone="danger">
                  <p>
                    @if (!hasDecision()) {
                      Choisissez ce qu’il advient d’au moins une séance.
                    } @else if (check().untreated.length) {
                      Il reste {{ plural(check().untreated.length, 'séance', 'séances') }} sans
                      choix. Annulez-la, remplacez-la ou transformez-la en étude surveillée.
                    } @else {
                      Complétez
                      {{ plural(check().incomplete.length, 'séance', 'séances') }} marquée(s)
                      ci-dessus.
                    }
                  </p>
                </cdls-alert>
              }
              <app-blocked-notice
                [conflicts]="conflicts()"
                [warnings]="warnings()"
                [busy]="busy()"
                [(reasons)]="reasons"
              />
              <div>
                <button
                  cdlsButton
                  type="button"
                  [attr.aria-busy]="busy() ? 'true' : null"
                  (click)="save()"
                >
                  {{ busy() ? 'Enregistrement…' : 'Enregistrer et prévenir' }}
                </button>
              </div>
            </section>
          }
        } @else {
          <p class="loading-line" role="status">Recherche des séances…</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-6);
    }
    .absence__step {
      display: grid;
      gap: var(--space-4);
      align-content: start;
    }
    .absence__day {
      display: grid;
      gap: var(--space-3);
    }
    .absence__day > h3 {
      margin: 0;
    }
    .absence__lesson {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: var(--space-4);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      min-width: 0;
    }
    .absence__legend {
      padding-inline: var(--space-1);
      font-weight: 600;
      color: var(--color-heading);
    }
    .absence__time {
      margin-inline-end: var(--space-2);
    }
    .absence__choices label {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
    }
    .absence__choices {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-6);
    }
    .absence__who {
      display: grid;
      gap: var(--space-3);
    }
    @media (min-width: 48rem) {
      .absence__who {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    p {
      margin: 0;
    }
    .issues {
      margin: var(--space-2) 0;
      padding-inline-start: var(--space-5);
    }
  `,
})
export class AbsencePage {
  readonly #api = inject(ApiClient);
  readonly #clock = inject(SchoolClock);
  protected readonly lessonsHeading = viewChild<ElementRef<HTMLElement>>('lessonsHeading');
  /** Focus moves to the lessons' heading once it is on the page: also at the first lookup, when it did not exist yet. */
  readonly #focusLessons = signal(false);

  protected readonly refreshNotice = viewChild<ElementRef<HTMLElement>>('refreshNotice');
  /** Focus moves to the message once it is on the page, after a refused save refreshed the lists. */
  readonly #focusNotice = signal(false);

  constructor() {
    afterRenderEffect(() => {
      const notice = this.refreshNotice();
      if (!this.#focusNotice() || !notice) return;
      untracked(() => {
        notice.nativeElement.focus();
        this.#focusNotice.set(false);
      });
    });
    afterRenderEffect(() => {
      const heading = this.lessonsHeading();
      if (!this.#focusLessons() || !heading) return;
      untracked(() => {
        heading.nativeElement.focus();
        this.#focusLessons.set(false);
      });
    });
  }

  protected readonly kinds = ABSENCE_CHOICE_KINDS;
  protected readonly labels = ABSENCE_CHOICE_LABELS;
  protected readonly plural = plural;
  protected readonly today = this.#clock.today;
  protected readonly longDay = (day: string) => dayTitle(day).toLowerCase();
  protected readonly title = dayTitle;
  protected readonly key = keyOf;
  protected readonly span = (s: AbsenceSessionDto) => timeSpan(s.startTime, s.endTime);

  /* Step 1: the teacher and the days (Signal Forms) */
  protected readonly periodModel = signal({
    teacherId: '',
    from: this.#clock.today(),
    to: this.#clock.today(),
  });
  protected readonly periodForm = form(this.periodModel, (p) => {
    validate(p.teacherId, ({ valueOf }) => this.#problemOn('teacherId', valueOf(p)));
    validate(p.from, ({ valueOf }) => this.#problemOn('from', valueOf(p)));
    validate(p.to, ({ valueOf }) => this.#problemOn('to', valueOf(p)));
  });
  protected readonly err = computed(() => ({
    teacherId: shownError(this.periodForm.teacherId()),
    from: shownError(this.periodForm.from()),
    to: shownError(this.periodForm.to()),
  }));

  readonly #teachersSource = resource({ loader: () => this.#api.planner.teachers() });
  protected readonly teachers = computed(() =>
    this.#teachersSource.hasValue()
      ? this.#teachersSource.value().map((t) => ({ id: t.teacherId, name: t.name }))
      : [],
  );
  readonly #roomsSource = resource({ loader: () => this.#api.school.rooms() });
  protected readonly rooms = computed(() =>
    this.#roomsSource.hasValue() ? this.#roomsSource.value().filter((r) => r.active) : [],
  );

  /* Step 2: the lessons and one decision each */
  protected readonly request = signal<Request | null>(null);
  /** The teacher or the days were changed after the lookup: the lessons shown are no longer the ones asked for. */
  protected readonly stale = computed(() => {
    const asked = this.request();
    const now = this.periodModel();
    return (
      !!asked &&
      (asked.teacherId !== now.teacherId || asked.from !== now.from || asked.to !== now.to)
    );
  });
  protected readonly lessons = resource({
    params: () => this.request() ?? undefined,
    loader: ({ params }) => this.#api.planner.absence(params),
  });
  protected readonly decisions = linkedSignal<unknown, Decisions>({
    source: () => (this.lessons.hasValue() ? this.lessons.value() : null),
    computation: () => ({}),
  });
  protected readonly sessions = computed(() =>
    this.lessons.hasValue() ? this.lessons.value().sessions : [],
  );
  protected readonly days = computed(() => groupByDay(this.sessions()));
  protected readonly check = computed(() => checkBeforeSave(this.sessions(), this.decisions()));
  protected readonly hasDecision = computed(() =>
    this.sessions().some((s) => decisionOf(this.decisions(), s).kind !== ''),
  );
  protected readonly summary = computed(() => {
    const c = countChoices(this.sessions(), this.decisions());
    const parts = [
      c.cancelled ? `${plural(c.cancelled, 'annulée')}` : '',
      c.substitute ? `${plural(c.substitute, 'remplacée')}` : '',
      c.study ? `${plural(c.study, 'en étude surveillée', 'en étude surveillée')}` : '',
    ].filter(Boolean);
    return parts.length ? `À enregistrer : ${parts.join(', ')}.` : 'Aucun choix pour l’instant.';
  });

  /* Step 3: save */
  protected readonly reason = signal('');
  protected readonly reasons = signal<Partial<Record<TimetableWarningCode, string>>>({});
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly conflicts = signal<readonly TimetableConflictDto[]>([]);
  protected readonly warnings = signal<readonly TimetableWarningDto[]>([]);
  protected readonly result = signal<ApplyAbsenceResult | null>(null);
  protected readonly showMissing = signal(false);
  /** After a refused save: what changed behind the planner's back (a covering teacher no longer free). */
  protected readonly refreshed = signal<readonly string[]>([]);

  #problemOn(field: 'teacherId' | 'from' | 'to', value: Request) {
    const problem = periodProblem(value, this.#clock.today());
    return problem?.field === field ? { kind: field, message: problem.message } : undefined;
  }

  protected errorText(): string {
    return apiMessage(
      this.lessons.error(),
      'Impossible de charger les séances. Réessayez dans un instant.',
    );
  }

  protected lookUp(event: Event): void {
    event.preventDefault();
    void submit(this.periodForm, async () => {
      this.result.set(null);
      this.#resetSave();
      this.request.set({ ...this.periodModel() });
      this.#focusLessons.set(true);
      return undefined;
    });
  }

  protected decision(s: AbsenceSessionDto): AbsenceDecision {
    return decisionOf(this.decisions(), s);
  }

  /** The free teachers still offered per lesson: never one that a lesson at the same time already holds. */
  readonly #offered = computed(() => {
    const sessions = this.sessions();
    const decisions = this.decisions();
    return new Map(sessions.map((s) => [keyOf(s), offeredFor(s, sessions, decisions)]));
  });

  protected offered(s: AbsenceSessionDto): readonly AbsenceTeacherOption[] {
    return this.#offered().get(keyOf(s)) ?? s.freeTeachers;
  }

  protected problem(s: AbsenceSessionDto, d: AbsenceDecision): string | null {
    return decisionProblem(s, d, this.offered(s));
  }

  protected sameSubject(s: AbsenceSessionDto) {
    return this.offered(s).filter((t) => t.sameSubject);
  }

  protected others(s: AbsenceSessionDto) {
    return this.offered(s).filter((t) => !t.sameSubject);
  }

  protected whoHelper(s: AbsenceSessionDto, d: AbsenceDecision): string {
    if (d.kind === 'substitute' && !this.sameSubject(s).length)
      return this.offered(s).length
        ? 'Aucun enseignant de la matière n’est libre : voici les autres enseignants libres.'
        : '';
    return 'Seuls les enseignants libres à ce moment sont proposés, et jamais le même pour deux séances en même temps.';
  }

  protected currentLabel(s: AbsenceSessionDto): string {
    return s.currentKind ? `Déjà : ${SLOT_EXCEPTION_LABELS[s.currentKind].toLowerCase()}` : '';
  }

  protected pick(s: AbsenceSessionDto, kind: AbsenceChoiceKind): void {
    this.#set(s, choose(s, kind, this.decision(s), this.offered(s)));
  }

  protected setTeacher(s: AbsenceSessionDto, event: Event): void {
    this.#set(s, { ...this.decision(s), teacherId: fieldValue(event) });
  }

  protected setRoom(s: AbsenceSessionDto, event: Event): void {
    this.#set(s, { ...this.decision(s), roomId: fieldValue(event) });
  }

  protected setReason(event: Event): void {
    this.reason.set(fieldValue(event));
  }

  #set(s: AbsenceSessionDto, d: AbsenceDecision): void {
    this.decisions.update((all) => ({ ...all, [keyOf(s)]: d }));
    this.#resetSave();
  }

  #resetSave(): void {
    this.refreshed.set([]);
    this.failure.set(null);
    this.conflicts.set([]);
    this.warnings.set([]);
  }

  protected doneText(r: ApplyAbsenceResult): string {
    const parts = [
      r.cancelled ? plural(r.cancelled, 'séance annulée', 'séances annulées') : '',
      r.substituted ? plural(r.substituted, 'séance remplacée', 'séances remplacées') : '',
      r.study ? plural(r.study, 'étude surveillée', 'études surveillées') : '',
    ].filter(Boolean);
    return `Enregistré : ${parts.join(', ')}. ${plural(r.notified, 'personne prévenue', 'personnes prévenues')}.`;
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    const request = this.request();
    const sessions = this.sessions();
    this.showMissing.set(true);
    if (!request || !this.check().ready) {
      this.#focusFirstOpen();
      return;
    }
    this.busy.set(true);
    this.failure.set(null);
    try {
      const body = {
        ...request,
        reason: this.reason().trim() || undefined,
        choices: toChoices(sessions, this.decisions()),
        acknowledgedWarnings: acknowledgements(this.warnings(), this.reasons()),
      };
      const done = await this.#api.planner.applyAbsence(body);
      this.result.set(done);
      this.#resetSave();
      this.reasons.set({});
      this.reason.set('');
      this.showMissing.set(false);
      this.lessons.reload();
      this.#focusResult();
    } catch (error) {
      const blocked = blockedOf(error);
      if (blocked) {
        // A conflict is most often a covering teacher taken since the lookup: refresh the lists and say what moved.
        const refreshed = blocked.conflicts.length ? await this.#refreshAfterConflict(request) : false;
        if (!refreshed) {
          this.conflicts.set(blocked.conflicts);
          this.warnings.set(blocked.warnings);
          if (!blocked.conflicts.length && !blocked.warnings.length)
            this.failure.set(apiMessage(error));
        }
      } else {
        this.failure.set(`Rien n’a été enregistré. ${apiMessage(error)}`);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Reads the lessons again (the free teachers changed), keeps every choice that still holds, replaces the
   * covering teachers who are no longer free with a fresh proposal, and says so. False when nothing was replaced
   * (the conflict is something else: the page then shows it as the API sent it) or when the lookup failed.
   */
  async #refreshAfterConflict(request: Request): Promise<boolean> {
    try {
      const fresh = await this.#api.planner.absence(request);
      const names = new Map([...teacherNames(this.sessions()), ...teacherNames(fresh.sessions)]);
      const next = refreshDecisions(fresh.sessions, this.decisions(), names);
      if (!next.replaced.length) return false;
      this.lessons.set(fresh);
      this.decisions.set(next.decisions);
      this.refreshed.set(
        next.replaced.map((r) =>
          replacedText(r, `le ${this.longDay(r.session.date)}, ${this.span(r.session)}`),
        ),
      );
      this.#focusNotice.set(true);
      return true;
    } catch {
      return false;
    }
  }

  /** Focus goes to the first lesson that still needs a choice, or to the page's result. */
  #focusFirstOpen(): void {
    const first = this.check().untreated[0] ?? this.check().incomplete[0]?.session;
    if (!first) return;
    queueMicrotask(() => {
      const host = this.lessonsHeading()?.nativeElement.ownerDocument;
      const target = host?.querySelector<HTMLElement>(
        `fieldset[data-key="${keyOf(first)}"] input, fieldset[data-key="${keyOf(first)}"] select`,
      );
      target?.focus();
    });
  }

  #focusResult(): void {
    queueMicrotask(() =>
      this.lessonsHeading()?.nativeElement.ownerDocument.querySelector<HTMLElement>('h1')?.focus(),
    );
  }
}
