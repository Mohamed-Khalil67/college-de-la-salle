import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PROFILE, wordmarkPlace } from '../../core/school/school-profile';

/**
 * The school's name with its crest, both from its profile (`schools/<SCHOOL>/profile.json`; the crest file is the
 * pack's `public/crest.svg`). When the text is hidden on small screens, `label` names the link. The name is
 * never translated (`lang` is the language it is written in, so it is read right on the other pages too).
 */
@Component({
  selector: 'cdls-wordmark',
  imports: [RouterLink],
  template: `
    <a class="wordmark" [routerLink]="link()" [attr.aria-label]="label()">
      <svg class="wordmark__crest" aria-hidden="true" focusable="false">
        <use [attr.href]="tone() === 'dark' ? school.brand.crestOnDark : school.brand.crest" />
      </svg>
      <span class="wordmark__text">
        <span class="wordmark__name" [attr.lang]="school.nameLang">{{ name }}</span>
        <span class="wordmark__place">{{ subtitle() }}</span>
      </span>
    </a>
  `,
})
export class Wordmark {
  protected readonly school = PROFILE;
  protected readonly name = PROFILE.names[PROFILE.nameLang].full;
  readonly tone = input<'light' | 'dark'>('light');
  readonly subtitle = input(wordmarkPlace(PROFILE));
  readonly link = input('/');
  readonly label = input<string | null>(null);
}
