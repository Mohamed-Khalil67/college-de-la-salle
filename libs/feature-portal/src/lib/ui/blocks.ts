import { Component, computed, input } from '@angular/core';
import {
  type Announcement,
  dayToMs,
  type PageLang,
  type ResourceItem,
  type SyllabusChapter,
  type TimelineEvent,
} from '@exam/contracts';
import { ArDatePipe } from '@exam/ui-arabic';

/** Splits a text on blank lines into paragraphs. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Summary text as paragraphs. */
@Component({
  selector: 'portal-paragraphs',
  template: `
    @for (p of items(); track $index) {
      <p class="mb-3 mt-0 text-lg leading-loose">{{ p }}</p>
    }
  `,
})
export class Paragraphs {
  readonly text = input.required<string>();
  protected readonly items = computed(() => paragraphs(this.text()));
}

/** Vertical timeline; the rule runs along the leading edge, so it mirrors with the direction. */
@Component({
  selector: 'portal-timeline-list',
  template: `
    <ol class="m-0 grid list-none gap-5 border-s-[3px] border-gold p-0">
      @for (e of events(); track e.id) {
        <li class="relative grid gap-1 ps-5">
          <span class="absolute -start-[0.55rem] top-2 size-3 rounded-full bg-primary" aria-hidden="true"></span>
          <span class="font-bold text-accent-strong">{{ e.period }}</span>
          <span class="font-semibold">{{ e.title }}</span>
          <span class="text-muted">{{ e.text }}</span>
        </li>
      }
    </ol>
  `,
})
export class TimelineList {
  readonly events = input.required<readonly TimelineEvent[]>();
}

/** Syllabus chapters with their notions. */
@Component({
  selector: 'portal-chapter-list',
  template: `
    <ol class="m-0 grid list-none gap-4 p-0" data-testid="chapters">
      @for (c of chapters(); track c.id; let i = $index) {
        <li class="rounded-xl border border-line border-s-4 border-s-gold bg-surface p-4">
          <h3 class="m-0 text-xl" data-testid="chapter-title">{{ c.title }}</h3>
          @if (c.summary) {
            <p class="mb-2 mt-1 text-muted">{{ c.summary }}</p>
          }
          @if (c.topics.length) {
            <ul class="m-0 grid gap-1 ps-5">
              @for (t of c.topics; track $index) {
                <li>{{ t }}</li>
              }
            </ul>
          }
        </li>
      }
    </ol>
  `,
})
export class ChapterList {
  readonly chapters = input.required<readonly SyllabusChapter[]>();
}

/** Downloadable sheets and external resources. */
@Component({
  selector: 'portal-resource-list',
  template: `
    <ul class="m-0 grid list-none gap-3 p-0" data-testid="resources">
      @for (r of resources(); track r.id) {
        <li class="rounded-xl border border-line bg-surface p-4">
          <a [href]="r.url" target="_blank" rel="noopener noreferrer" class="text-lg font-semibold">{{ r.title }}</a>
          <span class="visually-hidden"> ({{ lang() === 'fr' ? "s'ouvre dans un nouvel onglet" : 'يُفتح في تبويب جديد' }})</span>
          @if (r.description) {
            <p class="m-0 text-muted">{{ r.description }}</p>
          }
        </li>
      }
    </ul>
  `,
})
export class ResourceList {
  readonly resources = input.required<readonly ResourceItem[]>();
  readonly lang = input<PageLang>('ar');
}

/** Announcements, newest first. */
@Component({
  selector: 'portal-announcement-list',
  imports: [ArDatePipe],
  template: `
    <ul class="m-0 grid list-none gap-4 p-0" data-testid="announcements">
      @for (a of items(); track a.id) {
        <li>
          <article class="rounded-xl border border-line bg-surface p-4" [attr.aria-labelledby]="'ann-' + a.id">
            <p class="m-0 text-sm text-muted">
              <time [attr.datetime]="a.date">{{ a.at | arDate: 'calendar' }}</time>
            </p>
            <h3 [id]="'ann-' + a.id" class="m-0 text-xl">{{ a.title }}</h3>
            @if (a.body) {
              <p class="m-0">{{ a.body }}</p>
            }
          </article>
        </li>
      }
    </ul>
  `,
})
export class AnnouncementList {
  readonly announcements = input.required<readonly Announcement[]>();
  readonly limit = input<number | null>(null);

  protected readonly items = computed(() => {
    const sorted = [...this.announcements()].sort((a, b) => b.date.localeCompare(a.date));
    const limit = this.limit();
    return (limit === null ? sorted : sorted.slice(0, limit)).map((a) => ({ ...a, at: dayToMs(a.date) }));
  });
}
