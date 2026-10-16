import { Dir } from '@angular/cdk/bidi';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthStore } from '@exam/data-access-exams';
import { Frieze } from '@exam/ui-arabic';

@Component({
  selector: 'app-root',
  // `Dir` provides CDK `Directionality` = 'rtl' to the whole tree, so any CDK overlay, menu or
  // drag-drop added later mirrors correctly without per-component configuration.
  imports: [Dir, RouterOutlet, RouterLink, Frieze],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthStore);
}
