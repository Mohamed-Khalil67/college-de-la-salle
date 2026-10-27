import { Component, input } from '@angular/core';
import { Alert } from '../../../shared/ui';

/** Shown on the screens of a school year that has been archived by the rollover: it is read-only. */
@Component({
  selector: 'app-archived-banner',
  imports: [Alert],
  template: `
    <cdls-alert tone="warning">
      <strong>Année archivée</strong> : l’année {{ label() }} est en lecture seule. Plus de notes, d’événements, d’appel ni de modification de
      l’emploi du temps ; ses classes, ses élèves et ses notes restent consultables.
    </cdls-alert>
  `,
})
export class ArchivedBanner {
  readonly label = input.required<string>();
}
