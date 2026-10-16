import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurriculumStore } from '@exam/data-access-curriculum';
import { setPageMeta } from './seo';
import { ContextModuleView } from './ui/context-module';
import { PracticeExams } from './ui/practice-exams';
import { SchoolName } from './ui/school-name';
import { SyllabusTree } from './ui/syllabus-tree';

/**
 * `/sections/arabic` — the Arabic section hub: why Arabic matters in Egypt, how Thanaweya Amma is
 * organised, the Arabic curriculum, and direct access to timed practice.
 */
@Component({
  selector: 'portal-arabic-section-page',
  imports: [RouterLink, ContextModuleView, PracticeExams, SchoolName, SyllabusTree],
  template: `
    <header class="page-header">
      <p class="eyebrow">الأقسام</p>
      <h1>القسم العربي في <portal-school-name /></h1>
      <p class="lead">
        يدرس طلاب القسم العربي مناهج الثانوية العامة المصرية باللغة العربية، ويتقدّمون لامتحاناتها الرسمية،
        مع عناية خاصة بالعربية: لغةِ الهوية والفكر والإبداع.
      </p>
    </header>

    @if (arabic(); as subject) {
      @for (module of subject.contextModules; track module.id) {
        <section class="panel">
          <portal-context-module [module]="module" />
        </section>
      }

      <section class="panel" aria-labelledby="tracks-title">
        <h2 id="tracks-title">الثانوية العامة: الشُّعب والمواد</h2>
        <div class="table-wrap">
          <table data-testid="tracks">
            <caption class="visually-hidden">المواد المقرّرة في كل شعبة</caption>
            <thead>
              <tr>
                <th scope="col">الشعبة</th>
                @for (s of store.subjects(); track s.id) {
                  <th scope="col">{{ s.name }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (track of store.tracks(); track track.id) {
                <tr>
                  <th scope="row">{{ track.name }}</th>
                  @for (s of store.subjects(); track s.id) {
                    <td>
                      @if (track.subjects.includes(s.id)) {
                        <span class="yes">✓<span class="visually-hidden"> مقرّرة</span></span>
                      } @else {
                        <span class="no">—<span class="visually-hidden"> غير مقرّرة</span></span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="branches-title">
        <h2 id="branches-title">فروع اللغة العربية في المنهج</h2>
        <ul class="branches">
          @for (branch of subject.branches; track branch.id) {
            <li class="panel">
              <h3>{{ branch.name }}</h3>
              <p>{{ branch.summary }}</p>
            </li>
          }
        </ul>
        <portal-syllabus-tree [nodes]="subject.syllabus" />
        <p><a [routerLink]="['/subjects', subject.id]">صفحة مادة اللغة العربية كاملة ←</a></p>
      </section>

      <portal-practice-exams [subjectId]="subject.id" />

      <nav class="panel other-subjects" aria-label="مواد القسم الأخرى">
        <h2>مواد أخرى</h2>
        <ul>
          @for (s of store.subjects(); track s.id) {
            @if (s.id !== 'arabic') {
              <li><a [routerLink]="['/subjects', s.id]">{{ s.name }}</a></li>
            }
          }
        </ul>
      </nav>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
    h1 { margin-block: 0.25rem 0.5rem; }
    .lead { font-size: 1.1rem; color: var(--muted); max-inline-size: 52rem; }
    h2 { margin-block-start: 0; }
    .table-wrap { position: relative; overflow-x: auto; }
    table { inline-size: 100%; border-collapse: collapse; }
    th, td { padding-block: 0.5rem; padding-inline: 0.75rem; text-align: center; border-block-end: 1px solid var(--border); }
    tbody th { text-align: start; }
    .yes { color: var(--ok-strong); font-weight: 700; }
    .no { color: var(--muted); }
    .branches { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr)); }
    .branches h3 { margin: 0; font-family: var(--font-display); color: var(--accent-strong); }
    .branches p { margin-block-end: 0; }
    .other-subjects ul { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 0; padding: 0; list-style: none; font-weight: 600; }
  `,
})
export class ArabicSectionPage {
  protected readonly store = inject(CurriculumStore);
  protected readonly arabic = computed(() => this.store.subject('arabic'));

  constructor() {
    setPageMeta(
      'القسم العربي: تاريخ اللغة العربية في مصر، ومنهج العربية في الثانوية العامة (النحو والبلاغة والأدب)، واختبارات تدريبية مؤقَّتة.',
    );
  }
}
