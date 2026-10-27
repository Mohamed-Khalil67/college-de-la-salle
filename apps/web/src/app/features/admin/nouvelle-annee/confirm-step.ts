import { Component, computed, input, output } from '@angular/core';
import type { RolloverPreview, RolloverStudentAction } from '@cdls/shared';
import { Alert, Button } from '../../../shared/ui';
import { formatRange } from '../shared/admin-format';
import { consequences, groupsLine } from './rollover-logic';

/** Step 4: the last look. The button opens a dialog that restates the consequences before anything is written. */
@Component({
  selector: 'app-confirm-step',
  imports: [Alert, Button],
  template: `
    <div class="stack">
      <p class="t-muted">Relisez ce qui va se passer. Le passage est fait en une seule fois : s’il échoue, rien n’est enregistré.</p>

      <ul class="facts" aria-label="Ce qui va se passer">
        <li>
          Création de l’année <strong>{{ preview().newYear.label }}</strong> ({{ range() }}) avec ses classes, ses matières et son calendrier.
        </li>
        @if (placed()) {
          <li>{{ placed() }} élèves inscrits dans leur nouvelle classe.</li>
        }
        @if (groups()) {
          <li>{{ groups() }}</li>
        }
        @for (line of lines(); track line) {
          <li>{{ line }}</li>
        }
        <li>
          L’année <strong>{{ preview().sourceYear.label }}</strong> est <strong>archivée</strong> : plus de notes, d’événements, d’appel ni de modification de
          l’emploi du temps. Elle reste consultable.
        </li>
        @if (preview().makesNewYearCurrent) {
          <li>La nouvelle année devient l’année en cours pour tout le collège.</li>
        }
      </ul>

      @if (conflicts()) {
        <cdls-alert tone="warning">
          {{ conflicts() }} séance{{ conflicts() > 1 ? 's' : '' }} d’emploi du temps ne {{ conflicts() > 1 ? 'seront' : 'sera' }} pas copiée{{ conflicts() > 1 ? 's' : '' }}
          (conflit). Le passage continue sans elle{{ conflicts() > 1 ? 's' : '' }}.
        </cdls-alert>
      }

      <div class="page__actions">
        <button cdlsButton type="button" [disabled]="busy()" (click)="launch.emit()">Lancer le passage à {{ preview().newYear.label }}</button>
      </div>
    </div>
  `,
  styles: `
    .facts {
      display: grid;
      gap: var(--space-3);
      max-width: 62ch;
      margin: 0;
      padding-left: var(--space-5);
      list-style: disc;
    }
  `,
})
export class ConfirmStep {
  readonly preview = input.required<RolloverPreview>();
  readonly counts = input.required<Record<RolloverStudentAction, number>>();
  readonly busy = input(false);
  readonly launch = output<void>();

  protected readonly range = computed(() => formatRange(this.preview().newYear.startsOn, this.preview().newYear.endsOn));
  protected readonly groups = computed(() => groupsLine(this.preview().steps));
  protected readonly lines = computed(() => consequences(this.counts()));
  protected readonly placed = computed(() => {
    const c = this.counts();
    return c.promote + c.repeat + c.section_change;
  });
  protected readonly conflicts = computed(() => this.preview().issues.filter((i) => i.level === 'conflict').length);
}
