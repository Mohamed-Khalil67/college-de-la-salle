import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { SkipLink, Wordmark } from '../ui';

/** The two-column frame of the sign-in family of pages: the college on one side, the page's content on the other. */
@Component({
  selector: 'app-auth-shell',
  imports: [NgOptimizedImage, SkipLink, Wordmark],
  template: `
    <a cdlsSkipLink>Aller au contenu</a>
    <div class="auth">
      <aside class="auth__visual on-inverse" aria-label="Le collège">
        <img ngSrc="/images/school/batiment-brique.jpg" width="625" height="425" alt="" priority />
        <cdls-wordmark tone="dark" />
        <blockquote class="stack stack--sm">
          <p class="t-quote">« Signum Fidei »</p>
          <p class="t-body-s">Signe de la foi : la devise des Frères des Écoles chrétiennes, fondateurs du collège.</p>
        </blockquote>
      </aside>

      <main id="contenu" class="auth__form" tabindex="-1">
        <div class="auth__panel">
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthShell {}
