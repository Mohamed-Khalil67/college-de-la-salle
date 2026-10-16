import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurriculumStore } from '@exam/data-access-curriculum';
import { Star } from '@exam/ui-arabic';
import { setPageMeta } from './seo';
import { GalleryGrid } from './ui/gallery-grid';
import { NewsList } from './ui/news-list';
import { SchoolName } from './ui/school-name';

/** `/` — prerendered institutional landing page. */
@Component({
  selector: 'portal-landing-page',
  imports: [NgOptimizedImage, RouterLink, Star, GalleryGrid, NewsList, SchoolName],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
})
export class LandingPage {
  protected readonly store = inject(CurriculumStore);

  constructor() {
    setPageMeta(
      'القسم العربي بمدرسة Collège de la Salle: الثانوية العامة بشعبها، ومواد اللغة العربية والفيزياء والكيمياء والرياضيات، واختبارات تدريبية مؤقَّتة.',
    );
  }
}
