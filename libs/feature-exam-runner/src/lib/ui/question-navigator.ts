import { Component, computed, input, output } from '@angular/core';
import { type AnswerValue, isAnswered, type Question, type QuestionId } from '@exam/contracts';
import { formatNumber } from '@exam/ui-arabic';

interface Cell {
  readonly id: QuestionId;
  readonly number: string;
  readonly answered: boolean;
  readonly flagged: boolean;
  readonly label: string;
}

/**
 * Numbered map of the paper: one box per question showing answered / unanswered / flagged.
 * Each box jumps to its question. The strip scrolls inside itself, so it never widens the page.
 */
@Component({
  selector: 'exam-question-navigator',
  template: `
    <nav aria-label="خريطة الأسئلة">
      <ol class="cells">
        @for (cell of cells(); track cell.id) {
          <li>
            <button
              type="button"
              class="cell"
              [class.answered]="cell.answered"
              [class.flagged]="cell.flagged"
              [attr.aria-label]="cell.label"
              (click)="jump.emit(cell.id)"
            >
              {{ cell.number }}
              @if (cell.flagged) {
                <span class="flag" aria-hidden="true">⚑</span>
              }
            </button>
          </li>
        }
      </ol>
      <p class="legend" aria-hidden="true">
        <span><i class="swatch answered"></i> مُجاب</span>
        <span><i class="swatch"></i> لم يُجَب</span>
        <span><i class="swatch flagged"></i> للمراجعة</span>
      </p>
    </nav>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .cells { list-style: none; margin: 0; padding-block: 0.25rem; padding-inline: 0; display: flex; gap: 0.35rem; overflow-x: auto; }
    .cell {
      position: relative; inline-size: 2.4rem; block-size: 2.4rem; padding: 0;
      font-weight: 600; font-variant-numeric: tabular-nums; color: var(--muted);
      background: var(--surface); border: 1.5px dashed var(--border); border-radius: 8px;
    }
    .cell.answered { color: var(--on-primary); background: var(--accent); border: 1.5px solid var(--accent); }
    .cell.flagged { border: 2px solid var(--primary); }
    .cell.answered.flagged { box-shadow: inset 0 0 0 2px var(--surface); }
    .flag { position: absolute; inset-block-start: -0.55rem; inset-inline-end: -0.35rem; font-size: 0.8rem; color: var(--primary-strong); }
    .legend { display: flex; gap: 1rem; margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--muted); }
    .swatch { display: inline-block; inline-size: 0.8rem; block-size: 0.8rem; border-radius: 3px; vertical-align: middle; border: 1.5px dashed var(--border); }
    .swatch.answered { background: var(--accent); border: 0; }
    .swatch.flagged { border: 2px solid var(--primary); }
  `,
})
export class QuestionNavigator {
  readonly questions = input.required<readonly Question[]>();
  readonly answers = input.required<Readonly<Record<QuestionId, AnswerValue>>>();
  readonly flagged = input.required<readonly QuestionId[]>();
  readonly jump = output<QuestionId>();

  protected readonly cells = computed<readonly Cell[]>(() => {
    const flagged = new Set(this.flagged());
    return this.questions().map((q, i) => {
      const answered = isAnswered(this.answers()[q.id]);
      const isFlagged = flagged.has(q.id);
      const n = formatNumber(i + 1);
      const state = [answered ? 'مُجاب عنه' : 'لم يُجَب عنه', isFlagged ? 'مُعلَّم للمراجعة' : '']
        .filter(Boolean)
        .join('، ');
      return { id: q.id, number: n, answered, flagged: isFlagged, label: `السؤال ${n}: ${state}` };
    });
  });
}
