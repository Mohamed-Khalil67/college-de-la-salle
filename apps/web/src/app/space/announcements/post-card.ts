import { Component, computed, input } from '@angular/core';
import { matiereName } from '../../school';
import { targetLabel, type Post } from '@cdls/shared';

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** One announcement. Buttons can be projected below (a teacher's « Supprimer »). */
@Component({
  selector: 'space-post-card',
  template: `
    @let p = post();
    <article class="grid gap-1.5 rounded-xl border border-line bg-surface p-4" data-testid="post">
      <p class="m-0 text-sm text-muted">
        {{ date() }}@if (p.subject) { <span data-testid="post-subject"> · {{ subjectName() }}</span> }
      </p>
      <h3 class="m-0 text-lg" dir="auto" data-testid="post-title">{{ p.title }}</h3>
      @if (p.body) {
        <p class="m-0 whitespace-pre-line" dir="auto">{{ p.body }}</p>
      }
      <p class="m-0 text-sm text-muted">Par <bdi dir="auto">{{ p.authorName }}</bdi> · {{ audience() }}</p>
      <ng-content />
    </article>
  `,
})
export class PostCard {
  readonly post = input.required<Post>();

  protected readonly subjectName = computed(() => matiereName(this.post().subject));
  protected readonly date = computed(() => (this.post().createdAt ? DATE.format(this.post().createdAt) : ''));
  protected readonly audience = computed(() => targetLabel(this.post().target));
}
