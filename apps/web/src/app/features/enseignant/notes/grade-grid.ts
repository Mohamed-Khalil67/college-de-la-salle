import { Component, DestroyRef, ElementRef, computed, effect, inject, input, linkedSignal, output, resource, signal, untracked, viewChild } from '@angular/core';
import { LIMITS, type EventDto, type GradeSheetDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Avatar, Badge, Button, Field, FieldControl, GradeInput, Modal } from '../../../shared/ui';
import { average, clockOf, mark, plural } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';
import { eventTargetLine } from '../../../shared/utils/targets';
import { changedSince, columnAverage, gradeIssues, isAnnounced, isValidScore, issuesSentence, rowAverage, saveStage, saveStatus, saveSummary, scaleProblem } from '../shared/teacher';

type Marks = Readonly<Record<string, number | null>>;
type Comments = Readonly<Record<string, string>>;

/** Quiet time after the last keystroke before the quick grid saves on its own. */
const AUTOSAVE_MS = 800;

/**
 * The grade grid of one evaluation: earlier evaluations of the same subject read-only, the selected one
 * editable (GradeInput), live averages per student and per evaluation, save, publish and unpublish.
 * Enter moves to the next student. In `quick` mode (« Noter ») it also takes a comment per student, saves
 * on its own with a polite status line, and offers « Finir plus tard » and « Publier aux élèves ».
 */
@Component({
  selector: 'app-grade-grid',
  imports: [Alert, Avatar, Badge, Button, Field, FieldControl, GradeInput, Modal, LoadState],
  templateUrl: './grade-grid.html',
  styles: `
    .grid-help {
      margin-bottom: var(--space-4);
    }
    .grid-target {
      margin-bottom: var(--space-2);
    }
    .comment-input {
      min-inline-size: 12rem;
      min-block-size: 2.5rem;
    }
    .grid-published {
      margin-block-start: var(--space-3);
      text-align: end;
    }
    .scale-field {
      max-inline-size: 12rem;
      margin-block-end: var(--space-4);
    }
    .grid-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-3);
      margin-block-start: var(--space-4);
    }
  `,
})
export class GradeGrid {
  readonly event = input.required<EventDto>();
  /** Other evaluations of the same class and subject, shown read-only before the selected one. */
  readonly context = input<readonly EventDto[]>([]);
  readonly className = input('la classe');
  /** « Noter »: comments, autosave, « Finir plus tard » and « Publier aux élèves ». */
  readonly quick = input(false);
  /** The scale before the first mark is saved (it is stored with the marks, not on the event). */
  readonly scale = input(20);
  /** « Finir plus tard », once the marks are saved. */
  readonly finished = output<void>();
  /** After a publish (true) or an unpublish (false). */
  readonly publishedChange = output<boolean>();

  readonly #api = inject(ApiClient);
  readonly #destroyRef = inject(DestroyRef);
  private readonly table = viewChild<ElementRef<HTMLTableElement>>('table');
  private readonly publishButton = viewChild<ElementRef<HTMLButtonElement>>('publishButton');

  protected readonly commentMax = LIMITS.comment;

  protected readonly sheets = resource({
    params: () => ({ id: this.event().id, others: this.context().map((e) => e.id) }),
    loader: ({ params }) => Promise.all([params.id, ...params.others].map((id) => this.#api.grades.sheet(id))),
  });
  protected readonly main = computed<GradeSheetDto | null>(() => (this.sheets.hasValue() ? (this.sheets.value()[0] ?? null) : null));
  protected readonly others = computed(() => (this.sheets.hasValue() ? this.sheets.value().slice(1) : []));

  /** Saved marks and comments, as the server has them. */
  readonly #saved = computed<Marks>(() => Object.fromEntries((this.main()?.rows ?? []).map((r) => [r.student.id, r.grade?.score ?? null])));
  readonly #savedComments = computed<Comments>(() => Object.fromEntries((this.main()?.rows ?? []).map((r) => [r.student.id, r.grade?.comment ?? ''])));
  /** What the teacher typed; reset when the sheet changes (another evaluation, or after a save). */
  protected readonly marks = linkedSignal<Marks>(() => this.#saved());
  protected readonly comments = linkedSignal<Comments>(() => this.#savedComments());

  /** The scale as typed before the first mark is saved (a number or not); once a mark exists the stored scale rules. */
  protected readonly scaleText = linkedSignal(() => String(this.scale()));
  protected readonly scaleLocked = computed(() => !!this.main()?.rows.some((r) => r.grade));
  readonly #typedScale = computed(() => {
    const text = this.scaleText().trim().replace(',', '.');
    return text === '' ? Number.NaN : Number(text);
  });
  /** Shown under « Note sur » while it is empty or out of range; nothing is saved until it is fixed. */
  protected readonly scaleError = computed(() => (this.scaleLocked() ? null : scaleProblem(this.#typedScale())));
  protected readonly outOf = computed(
    () => this.main()?.rows.find((r) => r.grade)?.grade?.outOf ?? (this.scaleError() ? this.scale() : this.#typedScale()),
  );
  protected readonly outOfText = computed(() => mark(this.outOf()));
  protected readonly published = computed(() => !!this.main()?.rows.some((r) => r.grade?.published));
  /** Marks in the sheet that the students cannot see yet. */
  readonly #hidden = computed(() => (this.main()?.rows ?? []).filter((r) => r.grade && !r.grade.published).length);
  /** « Publier » is offered until every mark is visible; after that only « Retirer la publication » (the full grid). */
  protected readonly retracting = computed(() => this.published() && this.#hidden() === 0);
  protected readonly dirty = computed(() => {
    const saved = this.#saved();
    const marks = this.marks();
    const savedComments = this.#savedComments();
    const comments = this.comments();
    return (
      this.removed().size > 0 ||
      Object.keys(saved).some((id) => !same(saved[id] ?? null, marks[id] ?? null)) ||
      Object.keys(savedComments).some((id) => marks[id] !== null && marks[id] !== undefined && (savedComments[id] ?? '') !== (comments[id] ?? ''))
    );
  });
  /** The students the work concerns today (a graded student who left the group is shown, read-only). */
  protected readonly targetedRows = computed(() => (this.main()?.rows ?? []).filter((r) => r.targeted));
  protected readonly targetLine = computed(() => eventTargetLine(this.main()?.event.target));
  protected readonly issues = computed(() =>
    gradeIssues(this.targetedRows().map((r) => ({ name: this.name(r.student), score: this.marks()[r.student.id] ?? null })), this.outOf()),
  );
  protected readonly issuesText = computed(() => issuesSentence(this.issues()));
  /** A mark or the scale is outside what is accepted: nothing is sent until it is fixed. */
  readonly #blocked = computed(() => this.issues().invalid.length > 0 || !!this.scaleError());
  protected readonly classAverage = computed(() => columnAverage(this.targetedRows().map((r) => this.marks()[r.student.id] ?? null), this.outOf()));
  readonly #given = computed(
    () =>
      this.targetedRows().filter((r) => {
        const m = this.marks()[r.student.id] ?? null;
        return m !== null && isValidScore(m, this.outOf());
      }).length,
  );
  protected readonly countText = computed(() => `${plural(this.#given(), 'note')} sur ${this.targetedRows().length}`);

  /** Graded students who left the group whose mark the teacher chose to remove (sent as an empty mark on save). */
  protected readonly removed = signal<ReadonlySet<string>>(new Set());
  protected removeFormer(id: string): void {
    this.removed.update((s) => new Set([...s, id]));
  }
  protected readonly busy = signal(false);
  /** The publish (or unpublish) request, with the save before it. */
  protected readonly publishing = signal(false);
  protected readonly savedAt = signal<Date | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly confirmError = signal<string | null>(null);

  protected readonly stage = computed(() =>
    saveStage({
      saving: this.busy(),
      dirty: this.dirty(),
      invalid: this.#blocked(),
      failed: !!this.failure(),
      entered: this.#given(),
      total: this.targetedRows().length,
      average: this.classAverage(),
    }),
  );
  readonly #statusText = computed(() => {
    if (this.quick()) return saveStatus({ saving: this.busy(), dirty: this.dirty(), invalid: this.#blocked(), failed: !!this.failure(), entered: 0, total: 0, average: null });
    switch (this.stage()) {
      case 'saving':
        return 'Enregistrement…';
      case 'pending':
        return 'Modifications non enregistrées';
      case 'failed':
        return 'Non enregistré';
      case 'invalid':
        return 'Note hors barème : corrigez-la pour enregistrer';
      case 'saved': {
        const at = this.savedAt();
        return at ? `Enregistré à ${clockOf(at)}` : 'Aucune modification';
      }
    }
  });
  /** The live region: only a settled state (Enregistré, Non enregistré, Note hors barème), never the keystroke-by-keystroke ones. */
  protected readonly announced = computed(() => (isAnnounced(this.stage()) ? this.#statusText() : ''));
  /** Same place on screen, but not announced. */
  protected readonly transient = computed(() => (isAnnounced(this.stage()) ? '' : this.#statusText()));
  protected readonly summary = computed(() => saveSummary({ entered: this.#given(), total: this.targetedRows().length, average: this.classAverage() }));
  protected readonly publishLabel = computed(() => (this.quick() ? 'Publier aux élèves' : 'Publier les notes'));

  #timer: ReturnType<typeof setTimeout> | null = null;
  /** Set when the grid goes away: no autosave is scheduled after that. */
  #destroyed = false;
  /** The save that is running, so « Finir plus tard » and « Publier » wait for it instead of doing nothing. */
  #running: Promise<void> | null = null;

  constructor() {
    // « Noter » saves on its own once the teacher pauses, unless a mark is outside the scale.
    effect(() => {
      if (!this.quick() || !this.dirty() || this.#blocked()) {
        this.#clearTimer();
        return;
      }
      this.marks();
      this.comments();
      untracked(() => this.#schedule());
    });
    // Leaving the grid (another note, another page) saves what was typed in the last moments.
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
      this.#clearTimer();
      if (this.quick() && this.dirty() && !this.#blocked() && !this.#running) void this.save();
    });
  }

  protected name(s: { firstName: string; lastName: string }): string {
    return `${s.firstName} ${s.lastName}`;
  }
  protected fmt(value: number): string {
    return mark(value);
  }
  protected avg(value: number | null): string {
    return average(value);
  }
  protected valid(studentId: string): boolean {
    return isValidScore(this.marks()[studentId] ?? null, this.outOf());
  }
  protected hasMark(studentId: string): boolean {
    const m = this.marks()[studentId];
    return m !== null && m !== undefined;
  }
  protected isPublished(sheet: GradeSheetDto): boolean {
    return sheet.rows.some((r) => r.grade?.published);
  }
  protected scoreIn(sheet: GradeSheetDto, studentId: string): string {
    const g = sheet.rows.find((r) => r.student.id === studentId)?.grade;
    if (!g) return '–';
    return g.outOf === 20 ? mark(g.score) : `${mark(g.score)}/${mark(g.outOf)}`;
  }
  protected otherAverage(sheet: GradeSheetDto): number | null {
    const outOf = sheet.rows.find((r) => r.grade)?.grade?.outOf ?? 20;
    return columnAverage(sheet.rows.map((r) => r.grade?.score ?? null), outOf);
  }
  protected studentAverage(studentId: string): number | null {
    const cells = this.others().map((s) => {
      const g = s.rows.find((r) => r.student.id === studentId)?.grade;
      return { score: g?.score ?? null, outOf: g?.outOf ?? 20, coefficient: s.event.coefficient };
    });
    cells.push({ score: this.marks()[studentId] ?? null, outOf: this.outOf(), coefficient: this.event().coefficient });
    return rowAverage(cells);
  }
  protected setScale(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.scaleText.set(event.target.value);
  }
  protected setMark(studentId: string, value: number | null): void {
    this.marks.update((m) => ({ ...m, [studentId]: value }));
  }
  protected setComment(studentId: string, event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.comments.update((c) => ({ ...c, [studentId]: value }));
  }

  /** Enter in a row moves to the next student's mark; after the last one, to the publish button. */
  protected onEnter(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const table = this.table()?.nativeElement;
    const row = target.closest('tr');
    if (!table || !row) return;
    event.preventDefault();
    const inputs = [...table.querySelectorAll<HTMLInputElement>('tbody input.grade-input')];
    const index = inputs.findIndex((input) => input.closest('tr') === row);
    const next = inputs[index + 1];
    if (next) {
      next.focus();
      next.select();
    } else {
      this.publishButton()?.nativeElement.focus();
    }
  }

  protected openConfirm(): void {
    this.confirmError.set(null);
    this.confirmOpen.set(true);
  }

  /** Saves what is typed (waiting for a save that is running); false with a message when it cannot. */
  async flush(): Promise<boolean> {
    if (this.#running) await this.#running;
    return this.dirty() ? this.save() : !this.failure();
  }

  /** « Finir plus tard »: saves what is typed, then hands back (the draft stays in the list). */
  protected async finishLater(): Promise<void> {
    if (!(await this.flush())) return;
    this.finished.emit();
  }

  /** Saves the typed marks; false (with a message) when some are invalid or the API refuses. */
  protected async save(): Promise<boolean> {
    const sheet = this.main();
    if (!sheet) return false;
    if (this.#running) {
      await this.#running;
      return this.dirty() ? this.save() : !this.failure();
    }
    this.#clearTimer();
    if (this.scaleError()) {
      this.failure.set(`Corrigez d’abord le barème. ${this.scaleError()}`);
      return false;
    }
    if (this.issues().invalid.length) {
      this.failure.set(`Corrigez d’abord les notes signalées en rouge. ${this.issuesText()}`);
      return false;
    }
    this.busy.set(true);
    this.failure.set(null);
    const sentMarks = this.marks();
    const sentComments = this.comments();
    let finish: () => void = () => undefined;
    this.#running = new Promise<void>((resolve) => (finish = resolve));
    try {
      const entries = [
        ...this.targetedRows().map((r) => ({
          studentId: r.student.id,
          score: sentMarks[r.student.id] ?? null,
          comment: (sentComments[r.student.id] ?? '').trim(),
        })),
        ...[...this.removed()].map((studentId) => ({ studentId, score: null, comment: '' })),
      ];
      const saved = await this.#api.grades.save(sheet.event.id, { outOf: this.outOf(), entries });
      // What was typed while the request ran is put back over the server's answer.
      const typedMarks = changedSince(sentMarks, this.marks());
      const typedComments = changedSince(sentComments, this.comments());
      this.#replace(saved);
      this.marks.update((m) => ({ ...m, ...typedMarks }));
      this.comments.update((c) => ({ ...c, ...typedComments }));
      this.removed.set(new Set());
      this.savedAt.set(new Date());
      return true;
    } catch (error) {
      this.failure.set(`Les notes n’ont pas été enregistrées. ${apiMessage(error)}`);
      return false;
    } finally {
      this.busy.set(false);
      this.#running = null;
      finish();
      // Typed while the request ran: the next autosave picks it up. After a failure nothing is retried on a
      // timer: the next edit, « Finir plus tard » or « Publier » tries again.
      if (this.quick() && this.dirty() && !this.#blocked() && !this.failure()) this.#schedule();
    }
  }

  protected async togglePublished(): Promise<void> {
    const sheet = this.main();
    if (!sheet || this.publishing()) return;
    const publish = !this.retracting();
    if (publish && this.issues().invalid.length) {
      this.confirmError.set('Corrigez les notes hors barème avant de publier.');
      return;
    }
    if (publish && this.scaleError()) {
      this.confirmError.set('Corrigez le barème avant de publier.');
      return;
    }
    if (publish && this.#given() === 0) {
      this.confirmError.set('Saisissez au moins une note avant de publier : sinon les élèves ne verraient rien.');
      return;
    }
    this.publishing.set(true);
    this.confirmError.set(null);
    try {
      if (!(await this.flush())) {
        this.confirmError.set(this.failure() ?? 'Les notes ne sont pas enregistrées. Réessayez dans un instant.');
        return;
      }
      this.#replace(await this.#api.grades.publish(sheet.event.id, publish));
      this.confirmOpen.set(false);
      this.savedAt.set(new Date());
      if (this.retracting() === publish) this.publishedChange.emit(publish);
    } catch (error) {
      this.confirmError.set(`${publish ? 'La publication' : 'Le retrait'} a échoué. ${apiMessage(error)}`);
    } finally {
      this.publishing.set(false);
    }
  }

  #schedule(): void {
    this.#clearTimer();
    if (this.#destroyed) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.save();
    }, AUTOSAVE_MS);
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #replace(sheet: GradeSheetDto): void {
    this.sheets.update((list) => (list ? [sheet, ...list.slice(1)] : [sheet]));
  }
}

function same(a: number | null, b: number | null): boolean {
  return a === b || (a !== null && b !== null && Number.isNaN(a) && Number.isNaN(b));
}
