import { Component, inject, input } from '@angular/core';
import { LOCALE } from '../../i18n/locale';
import type { KeyFigure } from '../../school';
import { capitalize } from './contact-mail';

/** `<section siteFacts label="…" [facts]="…">`: the band of key figures under a page intro. */
@Component({
  selector: 'section[siteFacts]',
  host: { class: 'facts', '[attr.aria-label]': 'label()' },
  template: `
    <div class="container">
      <dl class="facts__list">
        @for (f of facts(); track f.label) {
          <div>
            <dt>{{ capitalize(f.label, lang) }}</dt>
            <dd>{{ f.value }}</dd>
          </div>
        }
      </dl>
    </div>
  `,
})
export class Facts {
  readonly facts = input.required<readonly KeyFigure[]>();
  readonly label = input.required<string>();
  protected readonly lang = inject(LOCALE).lang;
  protected readonly capitalize = capitalize;
}
