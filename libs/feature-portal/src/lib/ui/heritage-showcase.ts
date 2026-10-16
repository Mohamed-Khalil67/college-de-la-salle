import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import type { TimelineEvent } from '@exam/contracts';
import { PageLanguage } from '@exam/ui-arabic';
import { BLUR_PLACEHOLDER, FALLBACK_IMAGE, HERITAGE_IMAGES } from './images';

/**
 * Interactive archive showcase: a row of milestones (tabs) and the selected milestone's illustration
 * and story. Keyboard accessible (WAI-ARIA tabs pattern: arrows, Home, End; roving tabindex), and
 * direction-aware — «next» is the left arrow in RTL and the right arrow in LTR.
 *
 * The picture sits in a fixed 3:2 box with a blurred placeholder, so switching milestones never
 * moves anything on the page.
 */
@Component({
  selector: 'portal-heritage-showcase',
  imports: [NgOptimizedImage],
  template: `
    @if (sorted().length) {
      <section class="grid gap-4" aria-labelledby="heritage-title" data-testid="heritage">
        <h2 id="heritage-title" class="m-0">{{ title() }}</h2>

        <div role="tablist" [attr.aria-label]="title()" class="flex flex-wrap gap-2">
          @for (event of sorted(); track event.id; let i = $index) {
            <button
              type="button"
              role="tab"
              class="heritage-tab"
              [id]="'tab-' + event.id"
              [attr.aria-selected]="i === index()"
              [attr.aria-controls]="'panel-' + event.id"
              [attr.tabindex]="i === index() ? 0 : -1"
              [class.bg-navy-700]="i === index()"
              [class.text-cream]="i === index()"
              (click)="select(i)"
              (keydown)="onKey($event)"
            >
              {{ event.period }}
            </button>
          }
        </div>

        @if (current(); as event) {
          <div
            role="tabpanel"
            [id]="'panel-' + event.id"
            [attr.aria-labelledby]="'tab-' + event.id"
            tabindex="0"
            class="grid items-start gap-5 md:grid-cols-2"
          >
            <figure class="m-0 grid gap-2">
              <div class="relative aspect-3/2 w-full overflow-hidden rounded-xl border border-line bg-surface-2">
                <img
                  fill
                  [ngSrc]="image().src"
                  [alt]="image().alt"
                  [placeholder]="blur"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  class="object-cover"
                />
              </div>
              <figcaption class="text-sm text-muted">
                {{ image().caption }} · <span>رسم توضيحي — الصور الأرشيفية قيد الإضافة</span>
              </figcaption>
            </figure>
            <div class="grid content-start gap-2">
              <p class="eyebrow m-0">{{ event.period }}</p>
              <h3 class="m-0">{{ event.title }}</h3>
              <p class="m-0 leading-loose">{{ event.text }}</p>
            </div>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .heritage-tab { border-radius: 999px; padding-block: 0.35rem; padding-inline: 1rem; }
    .heritage-tab[aria-selected='true'] { border-color: var(--primary); }
    .heritage-tab[aria-selected='true']:hover:not(:disabled) { background: var(--primary); }
  `,
})
export class HeritageShowcase {
  readonly events = input.required<readonly TimelineEvent[]>();
  readonly title = input('تراث المدرسة');

  protected readonly blur = BLUR_PLACEHOLDER;
  protected readonly index = signal(0);
  readonly #lang = inject(PageLanguage);
  readonly #document = inject(DOCUMENT);

  protected readonly sorted = computed(() => [...this.events()].sort((a, b) => a.sortYear - b.sortYear));
  protected readonly current = computed(() => this.sorted()[Math.min(this.index(), this.sorted().length - 1)] ?? null);
  protected readonly image = computed(() => {
    const id = this.current()?.id ?? '';
    return HERITAGE_IMAGES[id] ?? FALLBACK_IMAGE;
  });

  protected select(i: number): void {
    this.index.set(i);
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.sorted().length - 1;
    const next = this.#lang.dir() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const prev = this.#lang.dir() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    let target = this.index();
    if (event.key === next) target = Math.min(last, target + 1);
    else if (event.key === prev) target = Math.max(0, target - 1);
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = last;
    else return;
    event.preventDefault();
    this.index.set(target);
    queueMicrotask(() => this.#document.getElementById(`tab-${this.sorted()[target]?.id}`)?.focus());
  }
}
