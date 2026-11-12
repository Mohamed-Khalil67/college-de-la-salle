import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { type BlockReport, pageStatusMessage } from '../utils/block-state';

/**
 * What the blocks of one home page tell the page about themselves. Provide it in the page component
 * (`providers: [HomeStatus]`): each `<app-home-block>` under it reports its state, and the page's single
 * `<app-home-status>` region announces the result as one sentence.
 */
@Injectable()
export class HomeStatus {
  readonly #reports = signal<ReadonlyMap<string, BlockReport>>(new Map());
  readonly message = computed(() => pageStatusMessage([...this.#reports().values()]));

  report(id: string, report: BlockReport): void {
    this.#reports.update((map) => new Map(map).set(id, report));
  }

  forget(id: string): void {
    this.#reports.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }
}

/**
 * The page's ONE polite live region, always in the page and updated with text (a region inserted with its
 * text is often not announced). Visually hidden: sighted users see the blocks themselves.
 */
@Component({
  selector: 'app-home-status',
  template: `<p class="visually-hidden" role="status">{{ status.message() }}</p>`,
})
export class HomeStatusRegion {
  protected readonly status = inject(HomeStatus);
}
