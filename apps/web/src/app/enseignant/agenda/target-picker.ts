import { Component, computed, effect, inject, input, model, resource, signal, untracked } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Button, Icon } from '../../ui';
import {
  audienceChangeNote,
  isWhole,
  studentName,
  targetSentence,
  type TargetValue,
  WHOLE_CLASS,
} from '../../groupes/groups-logic';

let nextId = 0;

/**
 * « Assigner à »: who a homework or an evaluation concerns. The whole class by default, then groups, then
 * individual students as chips (with a search), and a plain sentence that says how many students it concerns.
 * Nothing here is drag-only: radios, checkboxes, a search field and buttons.
 */
@Component({
  selector: 'app-target-picker',
  imports: [Button, Icon],
  template: `
    <fieldset class="target">
      <legend class="field__label">Assigner à</legend>
      <div class="target__modes">
        <label class="check">
          <input type="radio" [name]="modeName" [checked]="!custom()" (change)="chooseWhole()" />
          <span>Toute la classe</span>
        </label>
        <label class="check">
          <input type="radio" [name]="modeName" [checked]="custom()" (change)="custom.set(true)" />
          <span>Des groupes ou des élèves</span>
        </label>
      </div>

      @if (custom()) {
        <fieldset class="target__block">
          <legend class="t-body-s target__legend">Groupes</legend>
          @if (groupList().length) {
            <ul class="target__list" role="list">
              @for (g of groupList(); track g.id) {
                <li>
                  <label class="check">
                    <input type="checkbox" [checked]="value().groupIds.includes(g.id)" (change)="toggleGroup(g.id, $any($event.target).checked)" />
                    <span>{{ g.label }} <span class="t-muted">({{ g.division }}, {{ g.memberCount }} {{ g.memberCount > 1 ? 'élèves' : 'élève' }})</span></span>
                  </label>
                </li>
              }
            </ul>
          } @else {
            <p class="t-body-s t-muted">Cette classe n’a pas encore de groupe. Créez-en dans la page « Groupes », ou nommez des élèves ci-dessous.</p>
          }
        </fieldset>

        <div class="target__block">
          <label class="field__label" [for]="searchId">Ajouter un élève</label>
          <input class="field__control" [id]="searchId" type="search" autocomplete="off" placeholder="Rechercher un nom" [value]="query()" (input)="query.set($any($event.target).value)" />
          @if (query().trim()) {
            <p class="visually-hidden" role="status">{{ matches().length }} {{ matches().length > 1 ? 'résultats' : 'résultat' }}</p>
            <ul class="target__list" role="list">
              @for (s of matches(); track s.id) {
                <li>
                  <button cdlsButton variant="tertiary" size="sm" type="button" (click)="addStudent(s.id)">
                    <cdls-icon name="plus" />Ajouter {{ name(s) }}
                  </button>
                </li>
              }
            </ul>
          }
          @if (value().studentIds.length) {
            <ul class="target__chips" role="list" aria-label="Élèves nommés">
              @for (id of value().studentIds; track id) {
                <li class="chip">
                  <span>{{ nameOf(id) }}</span>
                  <button class="chip__remove" type="button" (click)="removeStudent(id)">
                    <cdls-icon name="close" /><span class="visually-hidden">Retirer {{ nameOf(id) }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }

      <p class="target__summary" role="status">{{ summary() }}</p>
      @if (graded() !== null) {
        <p class="t-body-s t-muted">{{ changeNote() }}</p>
      }
    </fieldset>
  `,
  styles: `
    .target {
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }
    .target__modes {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-6);
    }
    .target__block {
      border: 0;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }
    .target__legend {
      font-weight: 600;
      padding: 0;
    }
    .target__list,
    .target__chips {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .target__list {
      flex-direction: column;
      flex-wrap: nowrap;
      max-height: 12rem;
      overflow-y: auto;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: 0 var(--space-1) 0 var(--space-3);
      min-height: 2.75rem;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-full);
      background: var(--color-subtle);
    }
    .chip__remove {
      display: inline-grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border: 0;
      border-radius: var(--radius-full);
      background: transparent;
      color: var(--color-heading);
      cursor: pointer;
    }
    .chip__remove:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .target__summary {
      margin: 0;
      font-weight: 600;
    }
  `,
})
export class TargetPicker {
  /** The class of the work; changing it starts over with the whole class. */
  readonly classId = input.required<string>();
  readonly value = model<TargetValue>(WHOLE_CLASS);
  /** « Des groupes ou des élèves » is chosen (even before anything is picked). */
  readonly custom = model(false);
  /** Grades already given when editing a published evaluation (null: a new one, or no marks to speak of). */
  readonly graded = input<number | null>(null);

  readonly #api = inject(ApiClient);
  protected readonly modeName = `target-mode-${++nextId}`;
  protected readonly searchId = `target-search-${nextId}`;

  protected readonly groups = resource({
    params: () => this.classId() || undefined,
    loader: ({ params }) => this.#api.groups.list(params),
  });
  protected readonly roster = resource({
    params: () => this.classId() || undefined,
    loader: ({ params }) => this.#api.school.classStudents(params),
  });
  protected readonly groupList = computed(() => (this.groups.hasValue() ? this.groups.value() : []));
  protected readonly rosterList = computed(() => (this.roster.hasValue() ? this.roster.value() : []));

  protected readonly query = signal('');
  protected readonly matches = computed(() => {
    const q = fold(this.query());
    if (!q) return [];
    const chosen = new Set(this.value().studentIds);
    return this.rosterList()
      .filter((s) => !chosen.has(s.id) && fold(studentName(s)).includes(q))
      .slice(0, 8);
  });

  protected readonly summary = computed(() => {
    if (!this.groups.hasValue() || !this.roster.hasValue()) return 'Chargement des élèves de la classe…';
    if (this.custom() && isWhole(this.value())) return 'Choisissez au moins un groupe ou un élève, ou revenez à « Toute la classe ».';
    return targetSentence(this.value(), this.rosterList(), this.groupList());
  });
  protected readonly changeNote = computed(() => audienceChangeNote(this.graded() ?? 0));

  constructor() {
    // Another class has other groups and other students: start over (not on the first value).
    let previous: string | null = null;
    effect(() => {
      const id = this.classId();
      untracked(() => {
        if (previous !== null && previous !== id) {
          this.value.set(WHOLE_CLASS);
          this.custom.set(false);
          this.query.set('');
        }
        previous = id;
      });
    });
  }

  protected name(s: { firstName: string; lastName: string }): string {
    return studentName(s);
  }
  protected nameOf(id: string): string {
    const s = this.rosterList().find((x) => x.id === id);
    return s ? studentName(s) : 'Élève';
  }

  protected chooseWhole(): void {
    this.custom.set(false);
    this.value.set(WHOLE_CLASS);
    this.query.set('');
  }
  protected toggleGroup(id: string, on: boolean): void {
    this.value.update((v) => ({ ...v, groupIds: on ? [...new Set([...v.groupIds, id])] : v.groupIds.filter((g) => g !== id) }));
  }
  protected addStudent(id: string): void {
    this.value.update((v) => ({ ...v, studentIds: [...new Set([...v.studentIds, id])] }));
    this.query.set('');
  }
  protected removeStudent(id: string): void {
    this.value.update((v) => ({ ...v, studentIds: v.studentIds.filter((s) => s !== id) }));
  }

}

/** Lower case without accents, for the search. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
