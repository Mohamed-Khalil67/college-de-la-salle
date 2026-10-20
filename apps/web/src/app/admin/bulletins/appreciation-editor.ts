import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import type { ReportCardDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Button } from '../../ui';

let nextId = 0;

/** The class council's appreciation for one report card, saved on its own (locked once published). */
@Component({
  selector: 'app-appreciation-editor',
  imports: [Button],
  template: `
    @if (card().publishedAt) {
      <p class="t-body-s">{{ card().appreciation || 'Aucune appréciation.' }}</p>
    } @else {
      <div class="editor">
        <label class="visually-hidden" [for]="id">Appréciation de {{ card().studentName }}</label>
        <textarea
          class="field__control field__control--sm"
          rows="2"
          maxlength="2000"
          [id]="id"
          [value]="text()"
          (input)="onInput($event)"
        ></textarea>
        <div class="editor__bar">
          <button cdlsButton variant="secondary" size="sm" type="button" [disabled]="busy() || !dirty()" (click)="save()">
            Enregistrer<span class="visually-hidden"> l’appréciation de {{ card().studentName }}</span>
          </button>
          <span class="t-body-s" [class.error]="!!failure()" role="status">{{ failure() ?? status() }}</span>
        </div>
      </div>
    }
  `,
  styles: `
    .editor {
      display: grid;
      gap: var(--space-2);
      min-width: 14rem;
    }
    .editor__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .error {
      color: var(--color-danger);
    }
  `,
})
export class AppreciationEditor {
  readonly card = input.required<ReportCardDto>();

  readonly #api = inject(ApiClient);
  protected readonly id = `appreciation-${++nextId}`;
  protected readonly text = linkedSignal(() => this.card().appreciation);
  /** The text last saved on the server. */
  readonly #baseline = linkedSignal(() => this.card().appreciation);
  protected readonly dirty = computed(() => this.text().trim() !== this.#baseline());
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly failure = signal<string | null>(null);

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
    this.status.set('');
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      const updated = await this.#api.reportCards.update(this.card().id, this.text().trim());
      this.#baseline.set(updated.appreciation);
      this.status.set('Enregistrée.');
    } catch (error) {
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
