import { Component } from '@angular/core';
import { SITE } from '../../school';
import { SkipLink, Wordmark } from '../../shared/ui';

/** The two-column frame of the sign-in family of pages: the college on one side, the page's content on the other. */
@Component({
  selector: 'app-auth-shell',
  imports: [SkipLink, Wordmark],
  template: `
    <a cdlsSkipLink>Aller au contenu</a>
    <div class="auth">
      <aside class="auth__visual on-inverse" aria-label="Le collège" [style.background-image]="backdrop">
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
  /** The panel is decorative and full height: the photo is its background (an <img> would be cropped by CSS, which Angular flags). */
  protected readonly backdrop = `url("${SITE.authImage.src}")`;
  protected readonly motto = SITE.motto;
}
