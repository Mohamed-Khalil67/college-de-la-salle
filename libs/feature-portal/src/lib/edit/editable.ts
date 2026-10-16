import { Component, input, signal } from '@angular/core';
import type { PageId, PageLang } from '@exam/contracts';
import { inject } from '@angular/core';
import { EDITOR_UI, type SectionKind, SECTION_SPECS } from './section-spec';
import { SectionEditor } from './section-editor';
import { TeacherMode } from './teacher-mode';

/**
 * Wraps one section of a page. For everyone it just projects its content. In Teacher Mode it adds a
 * dashed outline and an inline «Modifier» trigger that swaps the content for the section editor.
 */
@Component({
  selector: 'portal-editable',
  imports: [SectionEditor],
  host: { class: 'block' },
  template: `
    <div
      class="relative"
      [class.outline-1]="mode.enabled()"
      [class.outline-dashed]="mode.enabled()"
      [class.outline-gold]="mode.enabled()"
      [class.outline-offset-4]="mode.enabled()"
      [class.rounded-lg]="mode.enabled()"
    >
      @if (mode.enabled()) {
        <div class="mb-2 flex justify-end">
          <button
            type="button"
            class="edit-trigger small"
            [attr.aria-expanded]="editing()"
            [attr.aria-label]="ui.edit[lang()] + ' — ' + title()"
            [attr.data-testid]="'edit-' + kind()"
            (click)="editing.set(!editing())"
          >
            ✎ {{ ui.edit[lang()] }}
          </button>
        </div>
      }
      @if (mode.enabled() && editing()) {
        <portal-section-editor [pageId]="pageId()" [kind]="kind()" [lang]="lang()" [(open)]="editing" />
      } @else {
        <ng-content />
      }
    </div>
  `,
})
export class Editable {
  readonly pageId = input.required<PageId>();
  readonly kind = input.required<SectionKind>();
  readonly lang = input.required<PageLang>();

  protected readonly mode = inject(TeacherMode);
  protected readonly ui = EDITOR_UI;
  protected readonly editing = signal(false);

  protected title(): string {
    return SECTION_SPECS[this.kind()].title[this.lang()];
  }
}
