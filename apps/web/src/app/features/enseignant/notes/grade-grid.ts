import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import type { EventDto, GradeSheetDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Avatar, Badge, Button, GradeInput, Modal } from '../../../shared/ui';
import { average, clockOf, mark, plural } from '../../../shared/utils/format';
import { LoadState } from '../../../shared/components/load-state';
import { eventTargetLine } from '../../../shared/utils/targets';
import { columnAverage, gradeIssues, isValidScore, issuesSentence, rowAverage } from '../shared/teacher';

type Marks = Readonly<Record<string, number | null>>;

/**
 * The grade grid of one evaluation: earlier evaluations of the same subject read-only, the selected one
 * editable (GradeInput), live averages per student and per evaluation, save, publish and unpublish.
 */
@Component({
  selector: 'app-grade-grid',
  imports: [Alert, Avatar, Badge, Button, GradeInput, Modal, LoadState],
  template: `
    <app-load-state [ref]="sheets" label="Chargement des notes…" />
    @if (main(); as sheet) {
      <div class="toolbar">
        <div class="toolbar__status">
          @if (published()) {
            <cdls-badge tone="success">Publié, visible par les élèves</cdls-badge>
          } @else {
            <cdls-badge tone="warning">Brouillon, invisible pour les élèves</cdls-badge>
          }
          <span role="status">{{ status() }}</span>
        </div>
        <button cdlsButton variant="secondary" size="sm" type="button" (click)="save()">Enregistrer</button>
        @if (published()) {
          <button cdlsButton variant="secondary" size="sm" type="button" (click)="openConfirm()">Retirer la publication</button>
        } @else {
          <button cdlsButton size="sm" type="button" (click)="openConfirm()">Publier les notes</button>
        }
      </div>
      <p class="t-body-s grid-target">
        <b>Assignée à :</b> {{ targetLine() }}.
        @if (!sheet.event.target.whole) {
          Seuls ces élèves apparaissent ici ; les notes des autres élèves de la classe ne se saisissent pas.
        }
      </p>
      <p class="t-body-s t-muted grid-help">
        Saisissez une note de 0 à {{ outOfText() }} (virgule acceptée), ou laissez vide. Passez d’un élève à l’autre avec Tab.
      </p>
      @if (failure()) {
        <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
      }

      <div class="table-wrap" role="region" aria-labelledby="grid-caption" tabindex="0">
        <table class="table table--sticky-first grade-grid">
          <caption id="grid-caption" class="visually-hidden">Notes de {{ sheet.event.title }}, {{ className() }}</caption>
          <thead>
            <tr>
              <th scope="col">Élève <span class="t-muted">({{ targetedRows().length }})</span></th>
              @for (other of others(); track other.event.id) {
                <th scope="col" class="num">{{ other.event.title }}<span class="cell-sub">×{{ fmt(other.event.coefficient) }}, {{ isPublished(other) ? 'publié' : 'brouillon' }}</span></th>
              }
              <th scope="col">{{ sheet.event.title }}<span class="cell-sub">×{{ fmt(sheet.event.coefficient) }}, {{ published() ? 'publié' : 'brouillon' }}</span></th>
              <th scope="col" class="num">Moyenne</th>
            </tr>
          </thead>
          <tbody>
            @for (row of sheet.rows; track row.student.id) {
              <tr>
                <th scope="row"><span class="person"><cdls-avatar [name]="name(row.student)" />{{ name(row.student) }}</span></th>
                @for (other of others(); track other.event.id) {
                  <td class="num">{{ scoreIn(other, row.student.id) }}</td>
                }
                <td>
                  @if (row.targeted) {
                    <cdls-grade-input
                      [value]="marks()[row.student.id] ?? null"
                      (valueChange)="setMark(row.student.id, $event)"
                      [outOf]="outOf()"
                      [label]="sheet.event.title + ', ' + name(row.student)"
                      [describedBy]="'err-' + row.student.id"
                    />
                  } @else {
                    <span class="tabular">{{ scoreIn(sheet, row.student.id) }}</span>
                    <cdls-badge tone="warning">N’est plus concerné : note conservée</cdls-badge>
                    @if (row.grade) {
                      <button cdlsButton variant="tertiary" size="sm" type="button" [disabled]="removed().has(row.student.id)" (click)="removeFormer(row.student.id)">
                        {{ removed().has(row.student.id) ? 'Note retirée à l’enregistrement' : 'Retirer la note' }}<span class="visually-hidden"> de {{ name(row.student) }}</span>
                      </button>
                    }
                  }
                </td>
                <td class="num"><b>{{ avg(studentAverage(row.student.id)) }}</b></td>
              </tr>
              @if (row.targeted && !valid(row.student.id)) {
                <tr class="grade-row-error" [id]="'err-' + row.student.id">
                  <td [attr.colspan]="others().length + 3">
                    <p class="field__error">{{ name(row.student) }} : la note doit être un nombre compris entre 0 et {{ outOfText() }}.</p>
                  </td>
                </tr>
              }
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Moyenne de la classe</th>
              @for (other of others(); track other.event.id) {
                <td class="num">{{ avg(otherAverage(other)) }}</td>
              }
              <td class="tabular">{{ avg(classAverage()) }} <span class="t-muted">({{ countText() }})</span></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <cdls-modal [title]="published() ? 'Retirer la publication ?' : 'Publier les notes ?'" [(open)]="confirmOpen">
        <div class="stack stack--sm">
          @if (published()) {
            <p>Les élèves de {{ className() }} ne verront plus ces notes, et leur moyenne sera recalculée sans elles.</p>
          } @else {
            <p>Les {{ targetedRows().length }} élèves concernés de {{ className() }} verront leur note et leur nouvelle moyenne. Vous pourrez encore corriger une note après publication.</p>
            @if (issuesText()) {
              <cdls-alert tone="warning">{{ issuesText() }} {{ issues().invalid.length ? 'Corrigez les notes hors barème avant de publier.' : 'Vous pouvez publier sans elles.' }}</cdls-alert>
            }
          }
          @if (confirmError()) {
            <cdls-alert tone="danger">{{ confirmError() }}</cdls-alert>
          }
        </div>
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="confirmOpen.set(false)">Annuler</button>
          <button cdlsButton [variant]="published() ? 'danger' : 'primary'" type="button" (click)="togglePublished()">
            {{ busy() ? 'Patientez…' : published() ? 'Retirer la publication' : 'Publier les notes' }}
          </button>
        </div>
      </cdls-modal>
    }
  `,
  styles: `
    .grid-help {
      margin-bottom: var(--space-4);
    }
    .grid-target {
      margin-bottom: var(--space-2);
    }
  `,
})
export class GradeGrid {
  readonly event = input.required<EventDto>();
  /** Other evaluations of the same class and subject, shown read-only before the selected one. */
  readonly context = input<readonly EventDto[]>([]);
  readonly className = input('la classe');

  readonly #api = inject(ApiClient);

  protected readonly sheets = resource({
    params: () => ({ id: this.event().id, others: this.context().map((e) => e.id) }),
    loader: ({ params }) => Promise.all([params.id, ...params.others].map((id) => this.#api.grades.sheet(id))),
  });
  protected readonly main = computed<GradeSheetDto | null>(() => (this.sheets.hasValue() ? (this.sheets.value()[0] ?? null) : null));
  protected readonly others = computed(() => (this.sheets.hasValue() ? this.sheets.value().slice(1) : []));

  /** Saved marks, as the server has them. */
  readonly #saved = computed<Marks>(() => Object.fromEntries((this.main()?.rows ?? []).map((r) => [r.student.id, r.grade?.score ?? null])));
  /** What the teacher typed; reset when the sheet changes (another evaluation, or after a save). */
  protected readonly marks = linkedSignal<Marks>(() => this.#saved());

  protected readonly outOf = computed(() => this.main()?.rows.find((r) => r.grade)?.grade?.outOf ?? 20);
  protected readonly outOfText = computed(() => mark(this.outOf()));
  protected readonly published = computed(() => !!this.main()?.rows.some((r) => r.grade?.published));
  protected readonly dirty = computed(() => {
    const saved = this.#saved();
    const marks = this.marks();
    return this.removed().size > 0 || Object.keys(saved).some((id) => !same(saved[id] ?? null, marks[id] ?? null));
  });
  /** The students the work concerns today (a graded student who left the group is shown, read-only). */
  protected readonly targetedRows = computed(() => (this.main()?.rows ?? []).filter((r) => r.targeted));
  protected readonly targetLine = computed(() => eventTargetLine(this.main()?.event.target));
  protected readonly issues = computed(() =>
    gradeIssues(this.targetedRows().map((r) => ({ name: this.name(r.student), score: this.marks()[r.student.id] ?? null })), this.outOf()),
  );
  protected readonly issuesText = computed(() => issuesSentence(this.issues()));
  protected readonly classAverage = computed(() => columnAverage(this.targetedRows().map((r) => this.marks()[r.student.id] ?? null), this.outOf()));
  protected readonly countText = computed(() => {
    const total = this.targetedRows().length;
    const given = this.targetedRows().filter((r) => {
      const m = this.marks()[r.student.id] ?? null;
      return m !== null && isValidScore(m, this.outOf());
    }).length;
    return `${plural(given, 'note')} sur ${total}`;
  });

  /** Graded students who left the group whose mark the teacher chose to remove (sent as an empty mark on save). */
  protected readonly removed = signal<ReadonlySet<string>>(new Set());
  protected removeFormer(id: string): void {
    this.removed.update((s) => new Set([...s, id]));
  }
  protected readonly busy = signal(false);
  protected readonly savedAt = signal<Date | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly confirmError = signal<string | null>(null);

  protected readonly status = computed(() => {
    if (this.busy()) return 'Enregistrement…';
    if (this.dirty()) return 'Modifications non enregistrées';
    const at = this.savedAt();
    return at ? `Enregistré à ${clockOf(at)}` : 'Aucune modification';
  });

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
  protected setMark(studentId: string, value: number | null): void {
    this.marks.update((m) => ({ ...m, [studentId]: value }));
  }

  protected openConfirm(): void {
    this.confirmError.set(null);
    this.confirmOpen.set(true);
  }

  /** Saves the typed marks; false (with a message) when some are invalid or the API refuses. */
  protected async save(): Promise<boolean> {
    const sheet = this.main();
    if (!sheet || this.busy()) return false;
    if (this.issues().invalid.length) {
      this.failure.set(`Corrigez d’abord les notes signalées en rouge. ${this.issuesText()}`);
      return false;
    }
    this.busy.set(true);
    this.failure.set(null);
    try {
      const entries = [
        ...this.targetedRows().map((r) => ({
          studentId: r.student.id,
          score: this.marks()[r.student.id] ?? null,
          comment: r.grade?.comment ?? '',
        })),
        ...[...this.removed()].map((studentId) => ({ studentId, score: null, comment: '' })),
      ];
      this.#replace(await this.#api.grades.save(sheet.event.id, { outOf: this.outOf(), entries }));
      this.removed.set(new Set());
      this.savedAt.set(new Date());
      return true;
    } catch (error) {
      this.failure.set(`Les notes n’ont pas été enregistrées. ${apiMessage(error)}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected async togglePublished(): Promise<void> {
    const sheet = this.main();
    if (!sheet || this.busy()) return;
    const publish = !this.published();
    if (publish && this.issues().invalid.length) {
      this.confirmError.set('Corrigez les notes hors barème avant de publier.');
      return;
    }
    if (this.dirty() && !(await this.save())) {
      this.confirmError.set(this.failure());
      return;
    }
    this.busy.set(true);
    try {
      this.#replace(await this.#api.grades.publish(sheet.event.id, publish));
      this.confirmOpen.set(false);
      this.savedAt.set(new Date());
    } catch (error) {
      this.confirmError.set(`${publish ? 'La publication' : 'Le retrait'} a échoué. ${apiMessage(error)}`);
    } finally {
      this.busy.set(false);
    }
  }

  #replace(sheet: GradeSheetDto): void {
    this.sheets.update((list) => (list ? [sheet, ...list.slice(1)] : [sheet]));
  }
}

function same(a: number | null, b: number | null): boolean {
  return a === b || (a !== null && b !== null && Number.isNaN(a) && Number.isNaN(b));
}

