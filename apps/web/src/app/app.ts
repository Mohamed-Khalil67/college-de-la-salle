import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** The root: each area (public site, login, spaces) brings its own layout. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
