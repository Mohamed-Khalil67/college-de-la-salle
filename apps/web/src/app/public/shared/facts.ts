import { Component, input } from '@angular/core';
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
            <dt>{{ capitalize(f.label) }}</dt>
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
  protected readonly capitalize = capitalize;
}
