import { Service, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Route titles become "<page> — منصّة الاختبارات" in the browser tab. */
@Service()
export class ArabicTitleStrategy extends TitleStrategy {
  readonly #title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.#title.setTitle(page ? `${page} — منصّة الاختبارات` : 'منصّة الاختبارات');
  }
}
