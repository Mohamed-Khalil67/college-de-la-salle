import { Component, input, output } from '@angular/core';
import { Icon } from '../../../shared/ui';
import { STEPS, type StepId } from './rollover-logic';

/**
 * The steps of the wizard as an ordered list. The current one is marked (`aria-current="step"`); the steps
 * already reached are buttons, so the secretariat goes back with the keyboard or a tap. Nothing is drag-only.
 */
@Component({
  selector: 'app-year-stepper',
  imports: [Icon],
  template: `
    <nav aria-label="Étapes de la nouvelle année">
      <ol class="stepper" role="list">
        @for (step of steps; track step.id; let i = $index) {
          <li class="stepper__item" [class.stepper__item--current]="step.id === current()" [attr.aria-current]="step.id === current() ? 'step' : null">
            @if (i < reached() && step.id !== current() && !locked()) {
              <button type="button" class="stepper__link" (click)="go.emit(step.id)">
                <span class="stepper__marker" aria-hidden="true"><cdls-icon name="check" /></span>
                <span class="stepper__label">{{ step.label }}<span class="visually-hidden"> (terminée, y revenir)</span></span>
              </button>
            } @else {
              <span class="stepper__link stepper__link--static">
                <span class="stepper__marker" aria-hidden="true">
                  @if (i < reached() && step.id !== current()) {
                    <cdls-icon name="check" />
                  } @else {
                    {{ i + 1 }}
                  }
                </span>
                <span class="stepper__label">
                  {{ step.label }}
                  @if (step.id === current()) {
                    <span class="visually-hidden"> (étape en cours)</span>
                  } @else if (i >= reached()) {
                    <span class="visually-hidden"> (à venir)</span>
                  }
                </span>
              </span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    .stepper {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: var(--space-2);
      margin: 0 0 var(--space-8);
      padding: 0;
      list-style: none;
    }
    .stepper__item {
      min-width: 0;
      border-top: 3px solid var(--color-line);
      padding-top: var(--space-3);
    }
    .stepper__item--current {
      border-top-color: var(--color-accent);
    }
    .stepper__link {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      min-height: 2.75rem;
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-heading);
      font: inherit;
      font-size: var(--text-body-s);
      text-align: left;
    }
    button.stepper__link {
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
    .stepper__link--static {
      color: var(--color-muted);
    }
    .stepper__item--current .stepper__link {
      color: var(--color-heading);
      font-weight: 600;
    }
    .stepper__marker {
      display: grid;
      flex: none;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border: 2px solid var(--color-line-strong);
      border-radius: var(--radius-full);
      font-size: var(--text-caption);
      font-weight: 600;
    }
    .stepper__item--current .stepper__marker {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-surface);
    }
    @media (max-width: 47.99rem) {
      .stepper {
        grid-template-columns: 1fr;
        gap: 0;
      }
      .stepper__item {
        border-top: 0;
        border-left: 3px solid var(--color-line);
        padding: 0 0 0 var(--space-3);
      }
      .stepper__item--current {
        border-left-color: var(--color-accent);
      }
      .stepper__item:not(.stepper__item--current) .stepper__link {
        min-height: 2.75rem;
      }
    }
  `,
})
export class YearStepper {
  readonly steps = STEPS;
  readonly current = input.required<StepId>();
  /** How many steps are open (0-based index of the last reachable one, plus one). */
  readonly reached = input.required<number>();
  /** True while a request runs or once the result is shown: the steps are then only a status. */
  readonly locked = input(false);
  readonly go = output<StepId>();
}
