import { Component, computed, input } from '@angular/core';
import { type NewsItem, newsDateMs } from '@exam/data-access-curriculum';
import { ArDatePipe } from '@exam/ui-arabic';

const CATEGORY: Readonly<Record<NewsItem['category'], string>> = {
  academic: 'أكاديمي',
  activity: 'نشاط',
  announcement: 'إعلان',
};

/** News feed. Items flagged `sample` are labelled so placeholder content is never mistaken for news. */
@Component({
  selector: 'portal-news-list',
  imports: [ArDatePipe],
  template: `
    <ul class="news" data-testid="news">
      @for (item of items(); track item.id) {
        <li>
          <article [attr.aria-labelledby]="'news-' + item.id">
            <p class="meta">
              <time [attr.datetime]="item.date">{{ item.at | arDate: 'calendar' }}</time>
              · <span>{{ item.categoryLabel }}</span>
              @if (item.sample) {
                <span class="sample">خبر تجريبي</span>
              }
            </p>
            <h3 [id]="'news-' + item.id">{{ item.title }}</h3>
            <p>{{ item.summary }}</p>
          </article>
        </li>
      }
    </ul>
  `,
  styles: `
    .news { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
    article { padding-block: 0.9rem; padding-inline: 1.1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .meta { margin: 0; font-size: 0.85rem; color: var(--muted); }
    .sample { margin-inline-start: 0.5rem; padding-block: 0.05rem; padding-inline: 0.5rem; border-radius: 999px; background: var(--warn-soft); color: var(--warn-strong); font-weight: 600; }
    h3 { margin-block: 0.25rem; font-size: 1.2rem; }
    article p:last-child { margin: 0; }
  `,
})
export class NewsList {
  readonly news = input.required<readonly NewsItem[]>();
  readonly limit = input<number | null>(null);

  protected readonly items = computed(() => {
    const limit = this.limit();
    const list = limit === null ? this.news() : this.news().slice(0, limit);
    return list.map((n) => ({ ...n, at: newsDateMs(n), categoryLabel: CATEGORY[n.category] }));
  });
}
