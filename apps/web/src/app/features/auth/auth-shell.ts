import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { SITE } from '../../school';
import { SkipLink, Wordmark } from '../../shared/ui';

/** The two-column frame of the sign-in family of pages: the college on one side, the page's content on the other. */
@Component({
  selector: 'app-auth-shell',
  imports: [NgOptimizedImage, SkipLink, Wordmark],
  template: `
    <a cdlsSkipLink>Aller au contenu</a>
    <div class="auth">
      <aside class="auth__visual on-inverse" aria-label="Le collège">
        <img [ngSrc]="image.src" [width]="image.width" [height]="image.height" alt="" priority />
        <cdls-wordmark tone="dark" />
        @if (motto; as m) {
          <blockquote class="stack stack--sm">
            <p class="t-quote">{{ m.text }}</p>
            <p class="t-body-s">{{ m.meaningFr }}</p>
          </blockquote>
        }
      </aside>

      <main id="contenu" class="auth__form" tabindex="-1">
        <div class="auth__panel">
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthShell {
  protected readonly image = SITE.authImage;
  protected readonly motto = SITE.motto;
}
