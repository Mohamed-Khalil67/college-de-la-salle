import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { photo } from '../../school';
import { Button } from '../../ui';

/** `<section siteHero>`: the campus from the air under a navy scrim, with the page's h1. */
@Component({
  selector: 'section[siteHero]',
  imports: [NgOptimizedImage, RouterLink, Button],
  host: { class: 'hero on-inverse', 'aria-labelledby': 'hero-title' },
  template: `
    <img class="hero__media" [ngSrc]="campus.src" [width]="campus.width" [height]="campus.height" [alt]="campus.alt" priority sizes="100vw" />
    <div class="container">
      <div class="hero__content">
        <hr class="gold-rule" />
        <h1 id="hero-title" class="t-display-xl">Un collège lasallien au cœur du Caire, depuis 1898</h1>
        <p class="t-body-l">
          Du jardin d’enfants à la Terminale, 2 400 élèves préparent la Thanaweya Amma ou le baccalauréat français, dans un
          même projet éducatif.
        </p>
        <div class="hero__actions">
          <a cdlsButton variant="on-dark" routerLink="/contact">Préparer une inscription</a>
          <a class="t-label" routerLink="/histoire">Découvrir notre histoire</a>
        </div>
      </div>
    </div>
    <p class="hero__credit">Le campus de Daher vu du ciel. {{ campus.credit }}.</p>
  `,
})
export class Hero {
  protected readonly campus = photo('campus-aerien');
}
