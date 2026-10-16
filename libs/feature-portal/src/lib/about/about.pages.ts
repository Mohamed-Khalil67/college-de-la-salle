import { Component, inject } from '@angular/core';
import { CurriculumStore } from '@exam/data-access-curriculum';
import { setPageMeta } from '../seo';
import { GalleryGrid } from '../ui/gallery-grid';
import { NewsList } from '../ui/news-list';
import { SchoolName } from '../ui/school-name';

/** `/about/history` */
@Component({
  selector: 'portal-history-page',
  imports: [SchoolName],
  template: `
    @let school = store.school();
    <header class="page-header">
      <p class="eyebrow">عن المدرسة</p>
      <h1>تاريخ مدرسة <portal-school-name /></h1>
    </header>
    @if (school.historyIsDraft) {
      <p class="draft" role="note">نصّ تمهيدي — بانتظار النصّ المعتمد من إدارة المدرسة.</p>
    }
    @for (section of school.history; track section.id) {
      <section class="panel" [attr.aria-labelledby]="'h-' + section.id">
        <h2 [id]="'h-' + section.id">{{ section.title }}</h2>
        @for (paragraph of section.paragraphs; track $index) {
          <p class="exam-text">{{ paragraph }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.25rem; }
    h1 { margin-block: 0.25rem 0; }
    h2 { margin-block-start: 0; }
    .draft { margin: 0; padding-block: 0.6rem; padding-inline: 1rem; border-radius: var(--radius); background: var(--warn-soft); color: var(--warn-strong); }
  `,
})
export class HistoryPage {
  protected readonly store = inject(CurriculumStore);

  constructor() {
    setPageMeta('تاريخ مدرسة Collège de la Salle ورسالتها التربوية، ونشأة القسم العربي.');
  }
}

/** `/about/news` */
@Component({
  selector: 'portal-news-page',
  imports: [NewsList],
  template: `
    <header class="page-header">
      <p class="eyebrow">عن المدرسة</p>
      <h1>الأخبار</h1>
    </header>
    <portal-news-list [news]="store.news()" />
  `,
  styles: `:host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.25rem; } h1 { margin-block: 0.25rem 0; }`,
})
export class NewsPage {
  protected readonly store = inject(CurriculumStore);

  constructor() {
    setPageMeta('أخبار القسم العربي وإعلاناته: الأنشطة، والاختبارات التجريبية، والمستجدّات الأكاديمية.');
  }
}

/** `/about/gallery` */
@Component({
  selector: 'portal-gallery-page',
  imports: [GalleryGrid],
  template: `
    <header class="page-header">
      <p class="eyebrow">عن المدرسة</p>
      <h1>معرض الصور</h1>
      <p class="muted">رسوم توضيحية مؤقَّتة إلى أن تُضاف صور المدرسة.</p>
    </header>
    <portal-gallery-grid [images]="store.gallery()" [priorityFirst]="true" />
  `,
  styles: `:host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.25rem; } h1 { margin-block: 0.25rem 0; }`,
})
export class GalleryPage {
  protected readonly store = inject(CurriculumStore);

  constructor() {
    setPageMeta('معرض صور المدرسة: الفناء، والمكتبة، والمختبرات، والفصول، والأنشطة.');
  }
}
