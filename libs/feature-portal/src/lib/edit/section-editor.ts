import { Component, computed, inject, input, linkedSignal, model, signal } from '@angular/core';
import { applyEach, form, FormField, validate } from '@angular/forms/signals';
import type { PageId, PageLang } from '@exam/contracts';
import { ContentStore } from '@exam/data-access-curriculum';
import { blankRow, EDITOR_UI, type Row, SECTION_SPECS, type SectionKind, toPatch, toRows, validateField } from './section-spec';

/**
 * Inline editor for one section of one page. Saving applies the change instantly (optimistic, see
 * ContentStore.save) and closes the editor; if the write is rejected the page is restored and the
 * editor reopens with the error.
 */
@Component({
  selector: 'portal-section-editor',
  imports: [FormField],
  template: `
    <form
      class="grid gap-4 rounded-xl border border-gold bg-surface p-4"
      [attr.lang]="lang()"
      [dir]="lang() === 'fr' ? 'ltr' : 'rtl'"
      novalidate
      (submit)="save($event)"
      [attr.aria-label]="spec().title[lang()]"
    >
      <h3 class="m-0 text-lg font-bold text-accent-strong">{{ ui.edit[lang()] }} — {{ spec().title[lang()] }}</h3>

      @if (rowForms().length === 0) {
        <p class="m-0 text-muted">{{ ui.noItems[lang()] }}</p>
      }

      @for (row of f.rows; track $index; let i = $index) {
        <fieldset class="m-0 grid gap-3 rounded-lg border border-line p-3">
          @if (spec().list) {
            <legend class="px-1 text-sm font-semibold text-muted">{{ ui.item[lang()] }} {{ i + 1 }}</legend>
          }
          <div class="grid gap-1">
            <label [for]="id(i, 'a')">{{ spec().a.label[lang()] }}</label>
            @if (spec().a.multiline) {
              <textarea [id]="id(i, 'a')" rows="6" dir="auto" [formField]="row.a" [attr.aria-invalid]="show() && row.a().invalid()"></textarea>
            } @else {
              <input [id]="id(i, 'a')" [type]="spec().a.type === 'date' ? 'date' : 'text'" dir="auto" [formField]="row.a" [attr.aria-invalid]="show() && row.a().invalid()" />
            }
            @if (spec().a.hint; as hint) {
              <p class="hint">{{ hint[lang()] }}</p>
            }
            <p class="field-error" role="alert">
              @if (show()) {
                @for (e of row.a().errors(); track e.kind) {
                  {{ e.message }}
                }
              }
            </p>
          </div>

          @if (spec().b; as b) {
            <div class="grid gap-1">
              <label [for]="id(i, 'b')">{{ b.label[lang()] }}</label>
              @if (b.multiline) {
                <textarea [id]="id(i, 'b')" rows="3" dir="auto" [formField]="row.b"></textarea>
              } @else {
                <input [id]="id(i, 'b')" type="text" dir="auto" [formField]="row.b" />
              }
              <p class="field-error" role="alert">
                @if (show()) {
                  @for (e of row.b().errors(); track e.kind) {
                    {{ e.message }}
                  }
                }
              </p>
            </div>
          }

          @if (spec().c; as c) {
            <div class="grid gap-1">
              <label [for]="id(i, 'c')">{{ c.label[lang()] }}</label>
              @if (c.multiline) {
                <textarea [id]="id(i, 'c')" [rows]="kind() === 'chapters' ? 5 : 3" dir="auto" [formField]="row.c"></textarea>
              } @else {
                <input [id]="id(i, 'c')" [type]="'text'" [class.ltr]="c.type === 'url'" [attr.dir]="c.type === 'url' ? 'ltr' : 'auto'" [formField]="row.c" [attr.aria-invalid]="show() && row.c().invalid()" />
              }
              <p class="field-error" role="alert">
                @if (show()) {
                  @for (e of row.c().errors(); track e.kind) {
                    {{ e.message }}
                  }
                }
              </p>
            </div>
          }

          @if (spec().list) {
            <div class="flex flex-wrap gap-2">
              <button type="button" class="small" [disabled]="i === 0" (click)="move(i)">{{ ui.moveUp[lang()] }}</button>
              <button type="button" class="small danger" (click)="remove(i)">{{ ui.remove[lang()] }}</button>
            </div>
          }
        </fieldset>
      }

      @if (spec().list && rowForms().length < spec().maxRows) {
        <div><button type="button" (click)="add()">+ {{ ui.add[lang()] }}</button></div>
      }

      @if (message(); as text) {
        <p class="form-error m-0" role="alert">{{ text }}</p>
      }

      <div class="flex flex-wrap gap-2">
        <button type="submit" class="primary" [disabled]="saving()">
          {{ saving() ? ui.saving[lang()] : ui.save[lang()] }}
        </button>
        <button type="button" [disabled]="saving()" (click)="open.set(false)">{{ ui.cancel[lang()] }}</button>
      </div>
    </form>
  `,
})
export class SectionEditor {
  readonly pageId = input.required<PageId>();
  readonly kind = input.required<SectionKind>();
  readonly lang = input.required<PageLang>();
  /** Two-way: the wrapper opens it; Cancel and a successful save close it. */
  readonly open = model(true);

  protected readonly ui = EDITOR_UI;
  readonly #store = inject(ContentStore);

  protected readonly spec = computed(() => SECTION_SPECS[this.kind()]);
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);
  readonly #attempted = signal(false);

  /** Rows are rebuilt from the page whenever the editor is (re)opened for another page/section. */
  protected readonly model = linkedSignal<{ rows: Row[] }>(() => {
    this.open();
    return { rows: toRows(this.#store.page(this.pageId())(), this.kind()) };
  });

  protected readonly f = form(this.model, (p) => {
    applyEach(p.rows, (row) => {
      validate(row.a, ({ value }) => validateField(this.kind(), 'a', value(), this.lang()));
      validate(row.b, ({ value }) => validateField(this.kind(), 'b', value(), this.lang()));
      validate(row.c, ({ value }) => validateField(this.kind(), 'c', value(), this.lang()));
    });
  });

  protected readonly rowForms = computed(() => this.model().rows);
  protected readonly show = this.#attempted.asReadonly();

  protected id(index: number, key: 'a' | 'b' | 'c'): string {
    return `edit-${this.kind()}-${index}-${key}`;
  }

  protected add(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.model.update((m) => ({ rows: [...m.rows, blankRow(this.kind(), today)] }));
  }

  protected remove(index: number): void {
    this.model.update((m) => ({ rows: m.rows.filter((_, i) => i !== index) }));
  }

  protected move(index: number): void {
    if (index < 1) return;
    this.model.update((m) => {
      const rows = [...m.rows];
      const [moved] = rows.splice(index, 1);
      if (moved) rows.splice(index - 1, 0, moved);
      return { rows };
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.#attempted.set(true);
    this.message.set(null);
    if (this.f().invalid()) {
      this.message.set(this.ui.fixErrors[this.lang()]);
      return;
    }
    const patch = toPatch(this.kind(), this.model().rows);
    this.saving.set(true);
    // Optimistic: the store updates the page now; closing immediately shows the result.
    const write = this.#store.save(this.pageId(), patch);
    this.open.set(false);
    try {
      await write;
    } catch {
      this.open.set(true);
      this.message.set(this.ui.failed[this.lang()]);
    } finally {
      this.saving.set(false);
    }
  }
}
