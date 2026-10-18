import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { matiereName } from '@site/content';
import { kindInfo, longDay, type CalendarEvent } from '../calendar.model';
import { audienceMatches, averageOnTwenty, classLabel, FORMAT_MARK, frenchError, LIMITS, parseNumber, targetLabel } from '../space.model';
import { SpaceService } from '../space.service';
import { SPACE_STYLES } from './space.styles';

interface Row {
  readonly studentUid: string;
  readonly studentName: string;
  readonly classLabel: string;
  score: string;
  comment: string;
}

/**
 * The grade grid of an exam (like TOMUSS): every student the exam is for, one row each; type the marks,
 * save once. Marks stay a draft until « publiées » is ticked; students only ever see published marks.
 */
@Component({
  selector: 'space-grade-grid',
  template: `
    <dialog #dialog class="dialog" aria-labelledby="gg-title" data-testid="grade-grid">
      @if (event(); as e) {
        <form class="grid gap-4 p-6" novalidate (submit)="onSave($event)">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 id="gg-title" class="m-0 text-2xl" dir="auto">Notes — {{ e.title }}</h2>
              <p class="m-0 mt-1 text-sm text-muted first-letter:uppercase">
                {{ kindLabel(e) }} · {{ longDay(e.date) }} · {{ audience(e) }}@if (e.subject) { · {{ subjectName(e.subject) }} } · coefficient {{ e.coefficient }}
              </p>
            </div>
            <button type="button" class="close" (click)="close()" aria-label="Fermer">✕</button>
          </div>

          @if (rows().length) {
            <div class="flex flex-wrap items-end gap-4">
              <label class="grid gap-1">
                <span class="font-semibold">Noté sur</span>
                <input type="text" inputmode="decimal" class="w-24" [value]="outOf()" (input)="outOf.set($any($event.target).value)" data-testid="gg-out-of" />
              </label>
              <p class="m-0 text-sm text-muted" data-testid="gg-summary">
                {{ filled() }} / {{ rows().length }} notes saisies@if (classAverage() !== null) { · moyenne de la classe {{ mark(classAverage()!) }} / 20 }
              </p>
            </div>

            <div class="overflow-x-auto rounded-xl border border-line">
              <table class="w-full min-w-xl border-collapse">
                <thead>
                  <tr class="border-b border-line text-sm text-muted">
                    <th scope="col" class="p-2 text-start font-semibold">Élève</th>
                    <th scope="col" class="w-28 p-2 text-start font-semibold">Note</th>
                    <th scope="col" class="p-2 text-start font-semibold">Commentaire (facultatif)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rows(); track r.studentUid; let i = $index) {
                    <tr class="border-b border-line" data-testid="gg-row">
                      <th scope="row" class="p-2 text-start font-semibold">
                        <span dir="auto">{{ r.studentName }}</span>
                        <span class="block text-xs font-normal text-muted">{{ r.classLabel }}</span>
                      </th>
                      <td class="p-2">
                        <input type="text" inputmode="decimal" class="w-24" [value]="r.score" (input)="set(i, 'score', $any($event.target).value)" [attr.aria-label]="'Note de ' + r.studentName" [attr.aria-invalid]="invalid(r)" data-testid="gg-score" />
                      </td>
                      <td class="p-2">
                        <input type="text" class="w-full" [value]="r.comment" (input)="set(i, 'comment', $any($event.target).value)" [attr.aria-label]="'Commentaire pour ' + r.studentName" data-testid="gg-comment" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <label class="flex items-center gap-2 font-semibold">
              <input type="checkbox" [checked]="published()" (change)="published.set($any($event.target).checked)" data-testid="gg-published" />
              Notes publiées (visibles par les élèves)
            </label>
            <p class="m-0 text-sm text-muted">Laissez une case vide pour un élève absent ou pas encore noté. Vider une note la supprime.</p>
          } @else {
            <p class="m-0 text-muted" data-testid="gg-empty">Aucun élève inscrit pour {{ audience(e) }} pour l’instant.</p>
          }

          @if (message(); as m) {
            <p class="m-0 rounded-lg px-3 py-2" [class]="ok() ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'" role="alert" data-testid="gg-message">{{ m }}</p>
          }
          <div class="flex flex-wrap gap-3 border-t border-line pt-4">
            @if (rows().length) {
              <button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="gg-save">Enregistrer les notes</button>
            }
            <button type="button" class="btn btn-outline-dark" (click)="close()">Fermer</button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: [
    SPACE_STYLES,
    `
      .dialog { inline-size: min(56rem, calc(100vw - 2rem)); max-block-size: calc(100dvh - 2rem); padding: 0; border: 0; border-radius: 16px; background: var(--surface); color: inherit; box-shadow: 0 20px 50px rgb(10 25 47 / 0.3); }
      .dialog::backdrop { background: rgb(10 25 47 / 0.55); }
      .close { inline-size: 2.25rem; block-size: 2.25rem; flex: none; border-radius: 999px; border: 1px solid var(--border); background: transparent; font: inherit; cursor: pointer; }
      td input, label input[type='text'] { padding-block: 0.4rem; }
      input[aria-invalid='true'] { border-color: #a12a1f; }
      input[type='checkbox'] { inline-size: 1.15rem; block-size: 1.15rem; padding: 0; }
    `,
  ],
})
export class GradeGrid {
  readonly #space = inject(SpaceService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly event = signal<CalendarEvent | null>(null);
  protected readonly rows = signal<Row[]>([]);
  protected readonly outOf = signal('20');
  protected readonly published = signal(false);
  protected readonly busy = signal(false);
  protected readonly ok = signal(false);
  protected readonly message = signal<string | null>(null);

  protected readonly filled = computed(() => this.rows().filter((r) => r.score.trim() !== '').length);
  protected readonly classAverage = computed(() => {
    const outOf = parseNumber(this.outOf());
    if (!(outOf > 0)) return null;
    const marks = this.rows().map((r) => parseNumber(r.score)).filter((n) => !Number.isNaN(n) && n <= outOf);
    return averageOnTwenty(marks.map((score) => ({ score, outOf })));
  });

  protected readonly longDay = longDay;
  protected readonly subjectName = matiereName;

  open(event: CalendarEvent): void {
    const existing = new Map(this.#space.grades().filter((g) => g.eventId === event.id).map((g) => [g.studentUid, g]));
    const students = this.#space
      .students()
      .filter((s) => audienceMatches(event.target, s.section, s.classe))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
    this.event.set(event);
    this.rows.set(
      students.map((s) => {
        const g = existing.get(s.uid);
        return {
          studentUid: s.uid,
          studentName: s.displayName,
          classLabel: classLabel(s.section, s.classe),
          score: g ? String(g.score).replace('.', ',') : '',
          comment: g?.comment ?? '',
        };
      }),
    );
    const first = [...existing.values()][0];
    this.outOf.set(first ? String(first.outOf) : '20');
    this.published.set(first?.published ?? false);
    this.message.set(null);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected kindLabel(e: CalendarEvent): string {
    return kindInfo(e.kind).label;
  }

  protected audience(e: CalendarEvent): string {
    return targetLabel(e.target);
  }

  protected mark(n: number): string {
    return FORMAT_MARK.format(n);
  }

  protected set(index: number, field: 'score' | 'comment', value: string): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  protected invalid(r: Row): boolean {
    if (!r.score.trim()) return false;
    const n = parseNumber(r.score);
    return Number.isNaN(n) || n > parseNumber(this.outOf());
  }

  protected async onSave(submit: Event): Promise<void> {
    submit.preventDefault();
    const e = this.event();
    if (!e) return;
    const outOf = parseNumber(this.outOf());
    if (Number.isNaN(outOf) || outOf <= 0 || outOf > 100) return this.#say('« Noté sur » doit être un nombre entre 1 et 100.', false);
    const wrong = this.rows().find((r) => this.invalid(r));
    if (wrong) return this.#say(`La note de ${wrong.studentName} doit être un nombre entre 0 et ${FORMAT_MARK.format(outOf)}.`, false);
    if (this.rows().some((r) => r.comment.length > LIMITS.comment)) return this.#say('Un commentaire est trop long.', false);
    this.busy.set(true);
    this.message.set(null);
    try {
      await this.#space.saveGrades(
        e,
        outOf,
        this.rows().map((r) => ({ studentUid: r.studentUid, studentName: r.studentName, score: r.score.trim() ? parseNumber(r.score) : null, comment: r.comment })),
        this.published(),
      );
      this.#say(this.published() ? 'Notes enregistrées et publiées : les élèves les voient.' : 'Notes enregistrées (brouillon, invisibles pour les élèves).', true);
    } catch (error) {
      this.#say(frenchError(error), false);
    } finally {
      this.busy.set(false);
    }
  }

  #say(text: string, ok: boolean): void {
    this.ok.set(ok);
    this.message.set(text);
  }
}
