import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ClassDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, EmptyState, Icon } from '../../ui';
import { groupBySection, plural } from '../shared/admin-format';
import { ClassFormModal } from './class-form-modal';

/** Classes of the current school year by section, with their head counts. */
@Component({
  selector: 'app-classes-page',
  imports: [RouterLink, Alert, Button, EmptyState, Icon, ClassFormModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Classes</h1>
        <p class="t-muted">{{ subtitle() }}</p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" [disabled]="!currentYear()" (click)="startCreate()"><cdls-icon name="plus" />Créer une classe</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    @if (classes.error() || years.error()) {
      <cdls-alert tone="danger">{{ errorText(classes.error() ?? years.error()) }}</cdls-alert>
    } @else if (classes.hasValue() && years.hasValue()) {
      @if (!currentYear()) {
        <cdls-empty-state icon="calendar" title="Aucune année scolaire en cours" description="Créez une année et définissez-la comme année en cours.">
          <a cdlsButton variant="secondary" routerLink="../annees">Années et trimestres</a>
        </cdls-empty-state>
      } @else if (!groups().length) {
        <cdls-empty-state icon="book" title="Aucune classe pour cette année" description="Créez la première classe de l’année.">
          <button cdlsButton variant="secondary" type="button" (click)="startCreate()">Créer une classe</button>
        </cdls-empty-state>
      } @else {
        <div class="stack sections">
          @for (group of groups(); track group.code) {
            <section class="stack stack--sm" [attr.aria-labelledby]="'section-' + group.code">
              <h2 class="t-h2" [id]="'section-' + group.code">{{ group.label }}</h2>
              <div class="table-wrap" role="region" [attr.aria-labelledby]="'caption-' + group.code" tabindex="0">
                <table class="table table--stack">
                  <caption [id]="'caption-' + group.code" class="visually-hidden">Classes du {{ group.label }} et nombre d’élèves</caption>
                  <thead>
                    <tr>
                      <th scope="col">Classe</th>
                      <th scope="col" class="num">Élèves</th>
                      <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of group.items; track item.id) {
                      <tr>
                        <th scope="row">
                          <span class="d-block">{{ item.label }}</span>
                          <span class="cell-sub">Code {{ item.code }}</span>
                        </th>
                        <td class="num" data-label="Élèves :">{{ item.studentCount }}</td>
                        <td class="num">
                          <span class="row-actions">
                            <a cdlsButton variant="tertiary" size="sm" [routerLink]="[item.id]">
                              Voir les élèves<span class="visually-hidden"> de {{ item.label }}</span>
                            </a>
                            <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startRename(item)">
                              Renommer<span class="visually-hidden"> {{ item.label }}</span>
                            </button>
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        </div>
      }
    } @else {
      <p class="loading-line" role="status">Chargement des classes…</p>
    }

    <app-class-form-modal
      [(open)]="formOpen"
      [sections]="sections.hasValue() ? sections.value() : []"
      [yearId]="currentYear()?.id ?? null"
      [yearLabel]="currentYear()?.label ?? ''"
      [editing]="editing()"
      (saved)="onSaved($event)"
    />
  `,
  styles: `
    .sections {
      gap: var(--space-12);
    }
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class ClassesPage {
  readonly #api = inject(ApiClient);

  protected readonly years = resource({ loader: () => this.#api.school.years() });
  protected readonly classes = resource({ loader: () => this.#api.school.classes() });
  protected readonly sections = resource({ loader: () => this.#api.school.sections() });

  protected readonly currentYear = computed(() => (this.years.hasValue() ? this.years.value().find((y) => y.isCurrent) : undefined));
  protected readonly groups = computed(() => (this.classes.hasValue() ? groupBySection(this.classes.value()) : []));
  protected readonly subtitle = computed(() => {
    const year = this.currentYear();
    if (!year || !this.classes.hasValue()) return 'Classes de l’année en cours';
    const list = this.classes.value();
    const students = list.reduce((sum, c) => sum + c.studentCount, 0);
    return `Année ${year.label} : ${plural(list.length, 'classe', 'classes')}, ${plural(students, 'élève inscrit', 'élèves inscrits')}`;
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ClassDto | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les classes. Réessayez dans un instant.');
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected startRename(item: ClassDto): void {
    this.editing.set(item);
    this.formOpen.set(true);
  }

  protected onSaved(item: ClassDto): void {
    this.notice.set(`Classe « ${item.label} » enregistrée.`);
    this.classes.reload();
  }
}
