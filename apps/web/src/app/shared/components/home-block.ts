import { Component, computed, DestroyRef, effect, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert, Button } from '../ui';
import type { BlockState } from '../utils/block-state';
import { HomeStatus } from './home-status';
import { resourceErrorMessage } from './load-state';

/** The looks of a block: the ordinary card, or the highlighted navy one. */
export const HOME_BLOCK_TONES = ['default', 'inverse'] as const;
export type HomeBlockTone = (typeof HOME_BLOCK_TONES)[number];

/**
 * One block of a role's home page (« one page per role »): a `<section>` with its heading, the loading,
 * error and empty states of its `state`, the block's own content (projected, shown by the block when
 * `state` is ready) and, last, ONE entry link to the detail page (shown when `link` is set). A failing block
 * shows its own alert and, when the page listens to `retry`, a « Réessayer » button; it never blanks the
 * page. `wide` spans the whole grid row; `tone="inverse"` is the highlighted navy block. Under a page that
 * provides `HomeStatus`, the block reports its state to the page's single live region.
 */
@Component({
  selector: 'app-home-block',
  imports: [Alert, Button, RouterLink],
  host: {
    class: 'home-block card card--panel',
    '[class.home-block--wide]': 'wide()',
    '[class.home-block--inverse]': 'tone() === "inverse"',
  },
  template: `
    <section class="home-block__section" [attr.aria-labelledby]="headingId()">
      <h2 class="t-h3 home-block__title" [id]="headingId()">{{ heading() }}</h2>
      <div class="home-block__body">
        @switch (state().status) {
          @case ('loading') {
            <p class="loading-line">{{ loadingLabel() }}</p>
          }
          @case ('error') {
            <cdls-alert tone="danger">{{ message() }}</cdls-alert>
            <button cdlsButton class="home-block__retry" type="button" variant="secondary" size="sm" (click)="retry.emit()">
              Réessayer
            </button>
          }
          @case ('empty') {
            <p class="home-block__empty">{{ emptyText() }}</p>
          }
        }
        <ng-content />
      </div>
      @if (link(); as target) {
        <a
          cdlsButton
          class="home-block__entry"
          [variant]="tone() === 'inverse' ? 'on-dark' : 'secondary'"
          [routerLink]="target"
          >{{ linkLabel() }}</a
        >
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
    :host(.home-block--wide) {
      grid-column: 1 / -1;
    }
    .home-block__section {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--space-4);
    }
    .home-block__title {
      margin: 0;
    }
    .home-block__body {
      display: grid;
      flex: 1;
      align-content: start;
      gap: var(--space-4);
    }
    .home-block__empty {
      margin: 0;
      color: var(--color-body);
    }
    .home-block__entry,
    .home-block__retry {
      justify-self: start;
      align-self: flex-start;
    }
    .home-block__retry {
      min-height: 2.75rem;
    }
    /* The highlighted block: navy, ivory text, gold focus ring (the default navy ring would not show). */
    :host(.home-block--inverse) {
      --color-focus: var(--color-accent);
      background: var(--color-inverse);
      border-color: var(--color-inverse);
      color: var(--color-on-inverse);
    }
    :host(.home-block--inverse) .home-block__title,
    :host(.home-block--inverse) .home-block__empty,
    :host(.home-block--inverse) .loading-line {
      color: var(--color-on-inverse);
    }
    @media (max-width: 30rem) {
      .home-block__entry,
      .home-block__retry {
        align-self: stretch;
        justify-self: stretch;
      }
    }
  `,
})
export class HomeBlock {
  readonly heading = input.required<string>();
  /** Unique on the page: the section is labelled by its heading. */
  readonly headingId = input.required<string>();
  readonly state = input.required<BlockState<unknown>>();
  /** The detail page, relative to the space's home (« notes », « emploi-du-temps »); no link when unset. */
  readonly link = input<string>();
  /** Says where the link goes: « Toutes les notes et le bulletin ». */
  readonly linkLabel = input('');
  readonly loadingLabel = input('Chargement…');
  /** An invitation, not an apology: « Rien à rendre cette semaine. » */
  readonly emptyText = input('');
  readonly wide = input(false);
  readonly tone = input<HomeBlockTone>('default');
  /** The student pressed « Réessayer » on the error state: the block reloads its sources. */
  readonly retry = output<void>();

  protected readonly message = computed(() => {
    const state = this.state();
    return state.status === 'error' ? resourceErrorMessage(state.error) : '';
  });

  constructor() {
    const page = inject(HomeStatus, { optional: true });
    if (page) {
      effect(() => page.report(this.headingId(), { heading: this.heading(), status: this.state().status }));
      inject(DestroyRef).onDestroy(() => page.forget(this.headingId()));
    }
  }
}
