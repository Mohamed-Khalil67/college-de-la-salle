import { Service, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Route titles become "<page> — Collège de la Salle"; the landing page is "القسم العربي | Collège de la Salle". */
@Service()
export class ArabicTitleStrategy extends TitleStrategy {
  readonly #title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    const school = 'Collège de la Salle';
    this.#title.setTitle(page ? `${page} — ${school}` : `القسم العربي | ${school}`);
  }
}
