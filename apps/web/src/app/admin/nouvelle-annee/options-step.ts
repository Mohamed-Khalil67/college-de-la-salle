import { Component, model } from '@angular/core';

/** Step 2: what is copied. Some things always are; the teaching assignments and the timetable are optional. */
@Component({
  selector: 'app-options-step',
  template: `
    <div class="stack">
      <section class="stack stack--sm" aria-labelledby="always-title">
        <h3 class="t-h3" id="always-title">Toujours copié</h3>
        <ul class="always">
          <li>Les périodes et les jours du calendrier (vacances, semaines d’examens), décalés d’un an et par filière.</li>
          <li>Les classes, avec le lien vers la classe suivante.</li>
          <li>Les matières de chaque classe, avec leurs coefficients et leurs heures.</li>
          <li>Les élèves, promus d’une classe à la suivante : vous réglez les redoublements, les départs et les diplômes à l’étape suivante.</li>
          <li>Les groupes de chaque classe (TP, LV2…) : vides, sauf les élèves promus qui retrouvent le groupe de même nom dans leur nouvelle classe. Les séances de groupe suivent l’emploi du temps.</li>
        </ul>
      </section>

      <fieldset class="options">
        <legend class="t-h3">Au choix</legend>
        <label class="check">
          <input type="checkbox" [checked]="copyAssignments()" (change)="setAssignments($event)" aria-describedby="assignments-help" />
          <span>Copier les affectations des enseignants</span>
        </label>
        <p class="field__helper" id="assignments-help">
          Chaque enseignant garde ses matières dans les classes de la nouvelle année. Sans elles, un enseignant ne peut ni saisir de notes ni faire l’appel.
        </p>
        <label class="check">
          <input
            type="checkbox"
            [checked]="copyTimetable() && copyAssignments()"
            [disabled]="!copyAssignments()"
            (change)="setTimetable($event)"
            aria-describedby="timetable-help"
          />
          <span>Copier l’emploi du temps</span>
        </label>
        <p class="field__helper" id="timetable-help">
          Les séances de la semaine type reprennent pour toute la nouvelle année. Le contrôle des conflits (salle, enseignant, classe) est refait : une séance qui
          entre en conflit n’est pas copiée et l’aperçu vous la signale, le reste continue.
          @if (!copyAssignments()) {
            <strong> Il faut copier les affectations pour copier l’emploi du temps.</strong>
          }
        </p>
      </fieldset>

      <p class="t-body-s t-muted">
        Les notes, les absences et les événements, avec leur « Assigner à », restent dans l’ancienne année, qui sera archivée.
      </p>
    </div>
  `,
  styles: `
    .always {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding-left: var(--space-5);
      list-style: disc;
    }
    .options {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    .options legend {
      margin-bottom: var(--space-3);
      padding: 0;
    }
    .options .field__helper {
      margin: 0 0 var(--space-3) var(--space-8);
      max-width: 60ch;
    }
  `,
})
export class OptionsStep {
  readonly copyAssignments = model(true);
  readonly copyTimetable = model(true);

  protected setTimetable(event: Event): void {
    this.copyTimetable.set((event.target as HTMLInputElement).checked);
  }

  protected setAssignments(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.copyAssignments.set(on);
    if (!on) this.copyTimetable.set(false);
  }
}
