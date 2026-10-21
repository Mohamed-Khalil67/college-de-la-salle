import { Component, computed, input, output } from '@angular/core';
import { Badge, Button, Icon, type BadgeTone } from '../../ui';
import { nextStep, type ChecklistStep, type StepId, type StepStatus } from './year-plan';

const STATUS: Readonly<Record<StepStatus, { readonly label: string; readonly tone: BadgeTone }>> = {
  done: { label: 'Fait', tone: 'success' },
  partial: { label: 'En cours', tone: 'warning' },
  todo: { label: 'À faire', tone: 'neutral' },
};

/**
 * The setup of a school year as a list of steps. Each status comes from the data, so the list resumes where
 * the work stopped: the first step that is not done says « Reprendre ici ». Steps can be done in any order.
 */
@Component({
  selector: 'app-year-checklist',
  imports: [Badge, Button, Icon],
  template: `
    <p class="progress" role="status">{{ progress() }}</p>
    <ol class="steps" role="list">
      @for (step of steps(); track step.id; let i = $index) {
        <li class="step" [class.step--next]="step.id === next()?.id" [attr.aria-current]="step.id === next()?.id ? 'step' : null">
          <span class="step__marker" aria-hidden="true">
            @if (step.status === 'done') {
              <cdls-icon name="check" />
            } @else {
              {{ i + 1 }}
            }
          </span>
          <div class="step__body">
            <h3 class="t-h3 step__title">
              {{ step.title }}
              <cdls-badge [tone]="status(step).tone">{{ status(step).label }}</cdls-badge>
              @if (step.id === next()?.id) {
                <cdls-badge tone="heritage">Reprendre ici</cdls-badge>
              }
            </h3>
            <p class="t-muted">{{ step.detail }}</p>
          </div>
          <button
            cdlsButton
            [variant]="step.id === next()?.id ? 'primary' : 'secondary'"
            size="sm"
            type="button"
            (click)="act.emit(step.id)"
          >
            {{ step.action }}
          </button>
        </li>
      }
    </ol>
  `,
  styles: `
    .progress {
      margin-bottom: var(--space-4);
      color: var(--color-muted);
    }
    .steps {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .step {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: var(--space-3) var(--space-4);
      padding: var(--space-4);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .step--next {
      border: 2px solid var(--color-primary);
      padding: calc(var(--space-4) - 1px);
    }
    .step__marker {
      display: grid;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 2px solid var(--color-line-strong);
      border-radius: var(--radius-full);
      color: var(--color-heading);
      font-weight: 600;
    }
    .step__title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .step button {
      grid-column: 2;
      justify-self: start;
    }
    @media (min-width: 48rem) {
      .step {
        grid-template-columns: auto 1fr auto;
      }
      .step button {
        grid-column: auto;
      }
    }
  `,
})
export class YearChecklist {
  readonly steps = input.required<readonly ChecklistStep[]>();
  readonly act = output<StepId>();

  protected readonly next = computed(() => nextStep(this.steps()));
  protected readonly progress = computed(() => {
    const done = this.steps().filter((s) => s.status === 'done').length;
    const total = this.steps().length;
    return done === total ? `Les ${total} étapes sont terminées.` : `${done} étape${done > 1 ? 's' : ''} sur ${total} terminée${done > 1 ? 's' : ''}. Chaque étape peut se faire plus tard.`;
  });

  protected status(step: ChecklistStep): { readonly label: string; readonly tone: BadgeTone } {
    return STATUS[step.status];
  }
}
