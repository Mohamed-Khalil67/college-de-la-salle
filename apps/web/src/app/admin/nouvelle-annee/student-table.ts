import { Component, computed, input, linkedSignal, model, signal } from '@angular/core';
import {
  ROLLOVER_ACTION_LABELS,
  type RolloverClassPlan,
  type RolloverStudentAction,
  type RolloverStudentPlan,
} from '@cdls/shared';
import { Badge, Button, Icon, Pagination } from '../../ui';
import { plural } from '../shared/admin-format';
import {
  actionsFor,
  applyToStudents,
  type Choices,
  countActions,
  effectiveAction,
  filterStudents,
  NO_FILTERS,
  pageSlice,
  setChoice,
  type StudentFilters,
} from './rollover-logic';

const PAGE_SIZE = 25;

/**
 * Every student with the class they are promoted to, and a select for the secretariat's choice (redoublement,
 * départ, diplôme, changement de section). Search and filters narrow the list; bulk actions work on the filtered
 * students; the table shows 25 rows at a time so 600+ students stay light and keyboard-friendly.
 */
@Component({
  selector: 'app-student-table',
  imports: [Badge, Button, Icon, Pagination],
  template: `
    <section class="stack stack--sm" aria-labelledby="students-title">
      <h3 class="t-h2" id="students-title">Élèves et décisions</h3>
      <p class="t-muted">
        Par défaut chaque élève passe dans la classe suivante, et ceux des classes terminales obtiennent leur diplôme. Changez seulement les cas particuliers.
      </p>

      <ul class="tally" aria-label="Récapitulatif des décisions">
        @for (item of tally(); track item.action) {
          <li>
            <cdls-badge [tone]="item.tone">{{ item.label }}</cdls-badge>
            <span>{{ item.count }}</span>
          </li>
        }
      </ul>

      <div class="bulk" role="group" aria-labelledby="bulk-title">
        <h4 class="t-body-s bulk__title" id="bulk-title">Actions groupées</h4>
        <div class="bulk__row">
          <button cdlsButton variant="secondary" size="sm" type="button" [disabled]="!choices().size" (click)="allPromoted()">
            Tous promus
          </button>
          <span class="bulk__hint">remet chaque élève à la décision par défaut ({{ changed() }} modifié{{ changed() > 1 ? 's' : '' }}).</span>
        </div>
        <div class="bulk__row">
          <label class="bulk__label" for="bulk-action">Pour les {{ filtered().length }} élèves affichés par les filtres :</label>
          <select id="bulk-action" class="field__control bulk__select" [value]="bulkAction()" (change)="bulkAction.set(asAction($event))">
            @for (a of bulkActions; track a) {
              <option [value]="a" [selected]="a === bulkAction()">{{ labels[a] }}</option>
            }
          </select>
          <button cdlsButton variant="secondary" size="sm" type="button" [disabled]="!filtered().length" (click)="applyBulk()">Appliquer</button>
        </div>
        <p class="t-body-s" role="status">{{ bulkMessage() }}</p>
      </div>

      <form class="filters" role="search" aria-label="Filtrer les élèves" (submit)="$event.preventDefault()">
        <div class="field">
          <label class="field__label" for="student-q">Rechercher un élève</label>
          <div class="search">
            <cdls-icon name="search" />
            <input id="student-q" class="field__control" type="search" autocomplete="off" placeholder="Nom ou matricule" [value]="filters().query" (input)="setFilter('query', val($event))" />
          </div>
        </div>
        <div class="field">
          <label class="field__label" for="student-class">Classe actuelle</label>
          <select id="student-class" class="field__control" [value]="filters().classId" (change)="setFilter('classId', val($event))">
            <option value="">Toutes</option>
            @for (c of classes(); track c.sourceClassId) {
              <option [value]="c.sourceClassId" [selected]="c.sourceClassId === filters().classId">{{ c.label }} ({{ sectionName(c) }})</option>
            }
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="student-action">Décision</label>
          <select id="student-action" class="field__control" [value]="filters().action" (change)="setFilter('action', val($event))">
            <option value="">Toutes</option>
            <option value="changed" [selected]="filters().action === 'changed'">Modifiées par vous</option>
            @for (a of allActions; track a) {
              <option [value]="a" [selected]="a === filters().action">{{ labels[a] }}</option>
            }
          </select>
        </div>
        <div class="field filters__reset">
          <button cdlsButton variant="tertiary" type="button" [disabled]="!hasFilters()" (click)="resetFilters()">Effacer les filtres</button>
        </div>
      </form>

      <p class="t-body-s" role="status">{{ resultText() }}</p>

      @if (rows().length) {
        <div class="table-wrap" role="region" aria-labelledby="students-caption" tabindex="0">
          <table class="table table--stack">
            <caption id="students-caption" class="visually-hidden">
              Élèves de l’année {{ sourceLabel() }} : classe actuelle, classe de la nouvelle année et décision. Page {{ page() }}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Élève</th>
                <th scope="col">Classe actuelle</th>
                <th scope="col">Nouvelle classe</th>
                <th scope="col">Décision</th>
              </tr>
            </thead>
            <tbody>
              @for (s of rows(); track s.studentId) {
                <tr>
                  <th scope="row">
                    <span class="d-block">{{ s.firstName }} {{ s.lastName }}</span>
                    <span class="cell-sub">{{ s.studentNumber ?? 'Sans matricule' }}</span>
                  </th>
                  <td data-label="Classe actuelle :">{{ s.sourceClassLabel }}</td>
                  <td data-label="Nouvelle classe :">{{ target(s) }}</td>
                  <td data-label="Décision :">
                    @if (s.skipped) {
                      <cdls-badge tone="neutral">Déjà placé</cdls-badge>
                    } @else {
                      <select
                        class="field__control decision"
                        [attr.aria-label]="'Décision pour ' + s.firstName + ' ' + s.lastName"
                        [value]="action(s)"
                        (change)="choose(s, $event)"
                      >
                        @for (a of optionsFor(s); track a) {
                          <option [value]="a" [selected]="a === action(s)">{{ labels[a] }}</option>
                        }
                      </select>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <cdls-pagination [total]="filtered().length" [pageSize]="pageSize" label="Pages des élèves" noun="élèves" [(page)]="page" />
      }
    </section>
  `,
  styles: `
    .tally {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3) var(--space-6);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tally li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-variant-numeric: lining-nums tabular-nums;
      font-weight: 600;
    }
    .bulk {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-page);
    }
    .bulk__title {
      margin: 0;
      font-weight: 600;
    }
    .bulk__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .bulk__hint {
      color: var(--color-muted);
      font-size: var(--text-body-s);
    }
    .bulk__select {
      width: auto;
      min-width: 12rem;
    }
    .filters__reset {
      align-self: end;
    }
    .decision {
      min-width: 12rem;
    }
  `,
})
export class StudentTable {
  readonly students = input.required<readonly RolloverStudentPlan[]>();
  readonly classes = input.required<readonly RolloverClassPlan[]>();
  readonly sourceLabel = input.required<string>();
  readonly choices = model.required<Choices>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly labels = ROLLOVER_ACTION_LABELS;
  protected readonly allActions: readonly RolloverStudentAction[] = ['promote', 'repeat', 'leave', 'graduate', 'section_change'];
  protected readonly bulkActions: readonly RolloverStudentAction[] = ['repeat', 'leave', 'section_change'];

  protected readonly filters = signal<StudentFilters>(NO_FILTERS);
  protected readonly bulkAction = signal<RolloverStudentAction>('repeat');
  protected readonly bulkMessage = signal('');
  /** Back to the first page whenever the filters change. */
  protected readonly page = linkedSignal({ source: () => this.filters(), computation: () => 1 });

  protected readonly filtered = computed(() => filterStudents(this.students(), this.choices(), this.filters()));
  protected readonly rows = computed(() => pageSlice(this.filtered(), this.page(), PAGE_SIZE));
  protected readonly changed = computed(() => this.choices().size);
  protected readonly hasFilters = computed(() => {
    const f = this.filters();
    return !!(f.query || f.classId || f.action);
  });
  protected readonly nextLabel = computed(() => new Map(this.classes().map((c) => [c.sourceClassId, c.nextLabel])));

  protected readonly tally = computed(() => {
    const counts = countActions(this.students(), this.choices());
    const tones = { promote: 'success', repeat: 'warning', leave: 'neutral', graduate: 'heritage', section_change: 'info' } as const;
    return this.allActions
      .filter((a) => counts[a] > 0)
      .map((a) => ({ action: a, label: ROLLOVER_ACTION_LABELS[a], count: counts[a], tone: tones[a] }));
  });
  protected readonly resultText = computed(() => {
    const total = this.students().length;
    const shown = this.filtered().length;
    return this.hasFilters() ? `${plural(shown, 'élève correspond', 'élèves correspondent')} aux filtres, sur ${total}.` : `${plural(total, 'élève', 'élèves')} dans l’année ${this.sourceLabel()}.`;
  });

  protected sectionName(c: RolloverClassPlan): string {
    return c.sectionCode === 'bac' ? 'Bac français' : 'Bac nationale';
  }

  protected action(s: RolloverStudentPlan): RolloverStudentAction {
    return effectiveAction(s, this.choices());
  }

  protected optionsFor(s: RolloverStudentPlan): readonly RolloverStudentAction[] {
    return actionsFor(s);
  }

  /** The class the student will be in, from the choice made now (the preview was computed with the earlier ones). */
  protected target(s: RolloverStudentPlan): string {
    const action = this.action(s);
    if (action === 'repeat') return s.sourceClassLabel;
    if (action === 'promote' || action === 'section_change') return this.nextLabel().get(s.sourceClassId) ?? '—';
    return action === 'graduate' ? 'Diplômé' : 'Quitte le collège';
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected asAction(event: Event): RolloverStudentAction {
    return (event.target as HTMLSelectElement).value as RolloverStudentAction;
  }

  protected choose(s: RolloverStudentPlan, event: Event): void {
    this.choices.set(setChoice(this.choices(), s, this.asAction(event)));
    this.bulkMessage.set('');
  }

  protected setFilter<K extends keyof StudentFilters>(key: K, value: string): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  protected resetFilters(): void {
    this.filters.set(NO_FILTERS);
  }

  protected allPromoted(): void {
    this.choices.set(new Map());
    this.bulkMessage.set('Tous les élèves sont à la décision par défaut : promus, ou diplômés dans les classes terminales.');
  }

  protected applyBulk(): void {
    const action = this.bulkAction();
    const result = applyToStudents(this.choices(), this.filtered(), action);
    this.choices.set(result.choices);
    this.bulkMessage.set(
      `${labelOf(action)} : ${plural(result.changed, 'élève modifié', 'élèves modifiés')}` +
        (result.left ? `, ${plural(result.left, 'élève laissé tel quel', 'élèves laissés tels quels')} (décision impossible pour sa classe, ou déjà placé).` : '.'),
    );
  }
}

function labelOf(action: RolloverStudentAction): string {
  return ROLLOVER_ACTION_LABELS[action];
}
