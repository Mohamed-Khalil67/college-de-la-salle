import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteHead } from './i18n/site-head';

/** The root: each area (public site, login, spaces) brings its own layout; SiteHead sets the page's language. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  constructor() {
    inject(SiteHead).start();
  }
}
