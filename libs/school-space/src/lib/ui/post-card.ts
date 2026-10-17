import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { matiereById, matiereName } from '@site/content';
import { dueState, formatDay, POST_TYPES, targetLabel, type Post } from '../space.model';

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** One teacher post: subject, title, text, due date or link. Buttons can be projected below. */
@Component({
  selector: 'space-post-card',
  imports: [NgOptimizedImage],
  template: `
    @let p = post();
    <article class="grid gap-2 rounded-xl border border-line bg-surface p-4" data-testid="post">
      <div class="flex flex-wrap items-center gap-3">
        @if (image(); as src) {
          <img [ngSrc]="src" width="60" height="40" alt="" class="rounded-md object-cover" />
        }
        <p class="m-0 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span class="font-semibold text-navy-700">{{ typeLabel() }}</span>
          @if (p.subject) {
            <span data-testid="post-subject">· {{ subjectName() }}</span>
          }
          <span>· {{ date() }}</span>
        </p>
      </div>
      <h3 class="m-0 text-lg" dir="auto" data-testid="post-title">{{ p.title }}</h3>
      @if (p.body) {
        <p class="m-0 whitespace-pre-line" dir="auto">{{ p.body }}</p>
      }
      @if (p.dueDate) {
        <p class="m-0 text-sm font-semibold" [class]="dueClass()" data-testid="post-due">À rendre pour le {{ dueText() }}{{ dueSuffix() }}</p>
      }
      @if (p.url; as url) {
        <p class="m-0"><a [href]="url" target="_blank" rel="noopener noreferrer">Ouvrir la ressource<span class="visually-hidden"> (nouvel onglet)</span></a></p>
      }
      <p class="m-0 text-sm text-muted">Par <bdi dir="auto">{{ p.authorName }}</bdi> · {{ audience() }}</p>
      <ng-content />
    </article>
  `,
})
export class PostCard {
  readonly post = input.required<Post>();
  /** Today as YYYY-MM-DD, for due-date wording. */
  readonly today = input<string>('');

  protected readonly typeLabel = computed(() => POST_TYPES.find((t) => t.id === this.post().type)?.label ?? '');
  protected readonly subjectName = computed(() => matiereName(this.post().subject));
  protected readonly image = computed(() => matiereById(this.post().subject)?.image ?? null);
  protected readonly date = computed(() => (this.post().createdAt ? DATE.format(this.post().createdAt) : ''));
  protected readonly audience = computed(() => targetLabel(this.post().target));
  protected readonly dueText = computed(() => formatDay(this.post().dueDate ?? ''));
  readonly #state = computed(() => {
    const due = this.post().dueDate;
    return this.today() && due ? dueState(due, this.today()) : 'later';
  });
  protected readonly dueClass = computed(() => (this.#state() === 'overdue' ? 'text-warn' : this.#state() === 'later' ? 'text-navy-700' : 'text-gold-ink'));
  protected readonly dueSuffix = computed(() => {
    const s = this.#state();
    return s === 'overdue' ? ' (en retard)' : s === 'today' ? ' (aujourd’hui)' : s === 'soon' ? ' (bientôt)' : '';
  });
}
