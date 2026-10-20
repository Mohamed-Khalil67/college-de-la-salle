import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The college's name with its crest. The crest is a placeholder until the school authorises its logo
 * (docs/brand.md, open decisions). When the text is hidden on small screens, `label` names the link.
 */
@Component({
  selector: 'cdls-wordmark',
  imports: [RouterLink],
  template: `
    <a class="wordmark" [routerLink]="link()" [attr.aria-label]="label()">
      <svg class="wordmark__crest" aria-hidden="true" focusable="false">
        <use [attr.href]="tone() === 'dark' ? '/icons.svg#crest-on-dark' : '/icons.svg#crest'" />
      </svg>
      <span class="wordmark__text">
        <span class="wordmark__name">Collège de la Salle</span>
        <span class="wordmark__place">{{ subtitle() }}</span>
      </span>
    </a>
  `,
})
export class Wordmark {
  readonly tone = input<'light' | 'dark'>('light');
  readonly subtitle = input('Daher, Le Caire, depuis 1898');
  readonly link = input('/');
  readonly label = input<string | null>(null);
}
