import { Component, computed, input, model } from '@angular/core';
import { form, FormField, required, validate } from '@angular/forms/signals';
import type { SchoolYearDto } from '@cdls/shared';
import { Alert, Badge, Field, FieldControl } from '../../ui';
import { formatRange, isYearLabel, shownError } from '../shared/admin-format';
import { suggestNewYear } from './rollover-logic';

/** What the first step edits. */
export interface SourceValues {
  sourceYearId: string;
  label: string;
  startsOn: string;
  endsOn: string;
}

/** Step 1: the year to copy, and the name and dates of the new one (proposed one year on, editable). */
@Component({
  selector: 'app-source-step',
  imports: [FormField, Alert, Badge, Field, FieldControl],
  template: `
    <div class="stack">
      <p class="t-muted">
        La nouvelle année reprend la structure de l’année choisie. Rien n’est écrit avant la confirmation : l’aperçu vous montre tout.
      </p>
      <form class="stack form" novalidate (submit)="$event.preventDefault()">
        <cdls-field label="Année à copier" helper="L’année dont on part : ses classes, ses matières, son calendrier et ses élèves.">
          <select cdlsControl [value]="values().sourceYearId" (change)="pick($event)">
            @for (year of years(); track year.id) {
              <option [value]="year.id" [selected]="year.id === values().sourceYearId">
                {{ year.label }}{{ year.status === 'current' ? ' (en cours)' : year.status === 'archived' ? ' (archivée)' : '' }}
              </option>
            }
          </select>
        </cdls-field>
        @if (source(); as s) {
          <p class="source-dates">
            {{ range() }}
            @if (s.status === 'current') {
              <cdls-badge tone="success">En cours</cdls-badge>
            } @else if (s.status === 'archived') {
              <cdls-badge tone="neutral">Archivée</cdls-badge>
            }
          </p>
          @if (s.status === 'archived') {
            <cdls-alert tone="info">
              Cette année est déjà archivée. Relancer le passage ne crée que ce qui manque dans la nouvelle année : rien n’est créé deux fois.
            </cdls-alert>
          }
        }
        <cdls-field label="Nom de la nouvelle année" helper="Deux années qui se suivent, par exemple 2027-2028." [error]="labelError()">
          <input cdlsControl autocomplete="off" [formField]="sourceForm.label" />
        </cdls-field>
        <div class="dates">
          <cdls-field label="Rentrée" [error]="startError()">
            <input cdlsControl type="date" [formField]="sourceForm.startsOn" />
          </cdls-field>
          <cdls-field label="Fin de l’année" [error]="endError()">
            <input cdlsControl type="date" [formField]="sourceForm.endsOn" />
          </cdls-field>
        </div>
        <p class="t-body-s t-muted">
          Les périodes et les jours du calendrier sont décalés d’un an et gardés dans ces dates. Les vacances qui tombent sur une date déplacée sont signalées à
          l’aperçu pour que vous les vérifiiez.
        </p>
      </form>
    </div>
  `,
  styles: `
    .form {
      max-width: 36rem;
    }
    .dates {
      display: grid;
      gap: var(--space-4);
    }
    .source-dates {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin: calc(var(--space-2) * -1) 0 0;
      color: var(--color-muted);
    }
    @media (min-width: 40rem) {
      .dates {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class SourceStep {
  readonly years = input.required<readonly SchoolYearDto[]>();
  readonly values = model.required<SourceValues>();

  protected readonly sourceForm = form(this.values, (p) => {
    required(p.label, { message: 'Saisissez le nom de la nouvelle année, par exemple 2027-2028.' });
    validate(p.label, ({ value }) =>
      value() && !isYearLabel(value().trim())
        ? { kind: 'yearLabel', message: 'Écrivez deux années qui se suivent, par exemple 2027-2028.' }
        : null,
    );
    required(p.startsOn, { message: 'Choisissez la date de rentrée.' });
    required(p.endsOn, { message: 'Choisissez la date de fin d’année.' });
    validate(p.endsOn, ({ value, valueOf }) =>
      value() && valueOf(p.startsOn) && value() <= valueOf(p.startsOn) ? { kind: 'order', message: 'La fin doit venir après la rentrée.' } : null,
    );
  });
  protected readonly labelError = computed(() => shownError(this.sourceForm.label()));
  protected readonly startError = computed(() => shownError(this.sourceForm.startsOn()));
  protected readonly endError = computed(() => shownError(this.sourceForm.endsOn()));

  protected readonly source = computed(() => this.years().find((y) => y.id === this.values().sourceYearId));
  protected readonly range = computed(() => {
    const s = this.source();
    if (!s) return '';
    const text = formatRange(s.startsOn, s.endsOn);
    return text.charAt(0).toUpperCase() + text.slice(1);
  });

  /** Changing the source proposes its next year again. */
  protected pick(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const year = this.years().find((y) => y.id === id);
    if (!year) return;
    this.values.set({ sourceYearId: id, ...suggestNewYear(year) });
  }
}
