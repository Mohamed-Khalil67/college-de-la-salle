import { Component, input } from '@angular/core';
import type { ContextModule } from '@exam/data-access-curriculum';

/** Background reading with a vertical timeline (logical properties: it mirrors in RTL). */
@Component({
  selector: 'portal-context-module',
  template: `
    @let m = module();
    <article class="module" [attr.aria-labelledby]="'module-' + m.id">
      <h2 [id]="'module-' + m.id">{{ m.title }}</h2>
      @for (paragraph of m.paragraphs; track $index) {
        <p class="exam-text">{{ paragraph }}</p>
      }
      @if (m.milestones.length) {
        <ol class="timeline" aria-label="محطات بارزة">
          @for (milestone of m.milestones; track $index) {
            <li>
              <span class="period">{{ milestone.period }}</span>
              <span>{{ milestone.text }}</span>
            </li>
          }
        </ol>
      }
    </article>
  `,
  styles: `
    h2 { margin-block: 0 0.5rem; }
    .timeline { list-style: none; margin: 1.25rem 0 0; padding: 0; display: grid; gap: 0.9rem; border-inline-start: 3px solid var(--gold); }
    .timeline li { position: relative; display: grid; gap: 0.1rem; padding-inline-start: 1.25rem; }
    .timeline li::before { content: ''; position: absolute; inset-inline-start: -0.5rem; inset-block-start: 0.6rem; inline-size: 0.75rem; block-size: 0.75rem; border-radius: 50%; background: var(--terracotta); }
    .period { font-weight: 700; color: var(--accent-strong); }
  `,
})
export class ContextModuleView {
  readonly module = input.required<ContextModule>();
}
