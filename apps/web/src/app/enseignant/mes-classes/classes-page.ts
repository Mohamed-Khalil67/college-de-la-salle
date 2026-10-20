import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { Badge, Button, EmptyState } from '../../ui';
import { mark, plural } from '../../eleve/shared/format';
import { LoadState } from '../../eleve/shared/load-state';
import { groupByClass } from '../shared/teacher';
import { schoolClasses, teacherAssignments } from '../shared/teacher-data';

/** The teacher's classes, from their teaching assignments, with shortcuts to grades and roll call. */
@Component({
  selector: 'app-classes-page',
  imports: [RouterLink, Badge, Button, EmptyState, LoadState],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Mes classes</h1>
        <p class="t-muted">Bonjour {{ firstName() }}. Les classes et matières que l’administration vous a confiées cette année.</p>
      </div>
    </div>

    <app-load-state [ref]="assignments" label="Chargement de vos classes…" />
    @if (assignments.hasValue()) {
      @if (groups().length) {
        <div class="grid-3">
          @for (group of groups(); track group.classId) {
            <section class="card card--panel" [attr.aria-labelledby]="'classe-' + group.classId">
              <div class="card__header">
                <h2 class="t-h3" [id]="'classe-' + group.classId">{{ group.label }}</h2>
                @if (group.sectionLabel) {
                  <cdls-badge tone="neutral">{{ group.sectionLabel }}</cdls-badge>
                }
              </div>
              @if (group.studentCount !== null) {
                <p class="t-muted">{{ count(group.studentCount) }}</p>
              }
              <ul class="list" role="list">
                @for (s of group.subjects; track s.id) {
                  <li>
                    <div class="list__main"><p>{{ s.name }}</p></div>
                    <span class="list__meta">Coefficient {{ format(s.coefficient) }}</span>
                  </li>
                }
              </ul>
              <div class="page__actions">
                <a cdlsButton variant="secondary" size="sm" routerLink="notes" [queryParams]="{ classe: group.classId }">
                  Saisir des notes<span class="visually-hidden"> en {{ group.label }}</span>
                </a>
                <a cdlsButton variant="secondary" size="sm" routerLink="appel" [queryParams]="{ classe: group.classId }">
                  Faire l’appel<span class="visually-hidden"> en {{ group.label }}</span>
                </a>
              </div>
            </section>
          }
        </div>
      } @else {
        <cdls-empty-state icon="users" title="Aucune classe pour le moment" description="L’administration vous affecte à vos classes en début d’année. Contactez le secrétariat si une classe manque." />
      }
    }
  `,
})
export class ClassesPage {
  readonly #auth = inject(AuthStore);
  protected readonly firstName = computed(() => this.#auth.user()?.firstName ?? '');
  protected readonly assignments = teacherAssignments();
  readonly #classes = schoolClasses();

  protected readonly groups = computed(() =>
    groupByClass(this.assignments.hasValue() ? this.assignments.value() : [], this.#classes.hasValue() ? this.#classes.value() : []),
  );

  protected count(n: number): string {
    return plural(n, 'élève');
  }
  protected format(n: number): string {
    return mark(n);
  }
}
