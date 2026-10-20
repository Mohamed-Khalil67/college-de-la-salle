import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ClassStudentDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Avatar, Button, EmptyState, Icon } from '../../ui';
import { ConfirmModal } from '../shared/confirm-modal';
import { fullName, plural, sectionLabel } from '../shared/admin-format';
import { EnrollSearch } from './enroll-search';

/** One class: its enrolled students, enrolment of existing students and removal. */
@Component({
  selector: 'app-class-detail-page',
  imports: [RouterLink, Alert, Avatar, Button, EmptyState, Icon, ConfirmModal, EnrollSearch],
  template: `
    <p class="back"><a routerLink=".."><cdls-icon name="chevron-left" />Toutes les classes</a></p>

    @if (schoolClass.error()) {
      <div class="page__header"><div class="page__header-text"><h1 class="t-h1">Classe</h1></div></div>
      <cdls-alert tone="danger">{{ errorText(schoolClass.error()) }}</cdls-alert>
    } @else if (schoolClass.hasValue()) {
      <div class="page__header">
        <div class="page__header-text">
          <h1 class="t-h1">{{ schoolClass.value().label }}</h1>
          <p class="t-muted">
            {{ track() }} · code {{ schoolClass.value().code }} · {{ plural(schoolClass.value().studentCount, 'élève', 'élèves') }}
          </p>
        </div>
      </div>
    } @else {
      <div class="page__header"><div class="page__header-text"><h1 class="t-h1">Classe</h1></div></div>
    }

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    <div class="layout">
      <section class="stack stack--sm" aria-labelledby="roster-title">
        <h2 class="t-h2" id="roster-title">Élèves inscrits</h2>
        @if (roster.error()) {
          <cdls-alert tone="danger">{{ errorText(roster.error()) }}</cdls-alert>
        } @else if (roster.hasValue()) {
          @if (roster.value().length) {
            <div class="table-wrap" role="region" aria-labelledby="roster-caption" tabindex="0">
              <table class="table table--stack">
                <caption id="roster-caption" class="visually-hidden">Élèves inscrits, triés par nom</caption>
                <thead>
                  <tr>
                    <th scope="col">Nom</th>
                    <th scope="col">Matricule</th>
                    <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (student of roster.value(); track student.id) {
                    <tr>
                      <th scope="row">
                        <span class="person"><cdls-avatar [name]="name(student)" /><span>{{ name(student) }}</span></span>
                      </th>
                      <td data-label="Matricule :">{{ student.studentNumber ?? '—' }}</td>
                      <td class="num">
                        <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startRemove(student)">
                          Retirer<span class="visually-hidden"> {{ name(student) }} de la classe</span>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <cdls-empty-state icon="users" title="Aucun élève inscrit" description="Recherchez un élève existant pour l’inscrire dans cette classe." />
          }
        } @else {
          <p class="loading-line" role="status">Chargement des élèves…</p>
        }
      </section>

      <app-enroll-search [classId]="id()" [enrolledIds]="enrolledIds()" (enrolled)="onEnrolled($event)" />
    </div>

    <app-confirm-modal
      title="Retirer cet élève de la classe ?"
      confirmLabel="Retirer de la classe"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="removeOpen"
      (confirmed)="remove()"
    >
      <p>
        <strong>{{ removingName() }}</strong> ne sera plus inscrit dans cette classe et n’en verra plus l’agenda ni les notes.
        Son compte reste actif.
      </p>
    </app-confirm-modal>
  `,
  styles: `
    .back {
      margin-bottom: var(--space-4);
    }
    .back a {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-height: 2.75rem;
    }
    .layout {
      display: grid;
      gap: var(--space-12);
      align-items: start;
    }
    @media (min-width: 64rem) {
      .layout {
        grid-template-columns: 3fr 2fr;
      }
    }
  `,
})
export class ClassDetailPage {
  /** Route parameter (classes/:id). */
  readonly id = input.required<string>();

  readonly #api = inject(ApiClient);
  protected readonly plural = plural;

  protected readonly schoolClass = resource({ params: () => this.id(), loader: ({ params }) => this.#api.school.class(params) });
  protected readonly roster = resource({ params: () => this.id(), loader: ({ params }) => this.#api.school.classStudents(params) });
  protected readonly track = computed(() => (this.schoolClass.hasValue() ? sectionLabel(this.schoolClass.value().sectionCode) : ''));
  protected readonly enrolledIds = computed(() => new Set(this.roster.hasValue() ? this.roster.value().map((s) => s.id) : []));

  protected readonly notice = signal<string | null>(null);
  protected readonly removeOpen = signal(false);
  protected readonly removing = signal<ClassStudentDto | null>(null);
  protected readonly removingName = computed(() => {
    const student = this.removing();
    return student ? fullName(student) : '';
  });
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected name(student: ClassStudentDto): string {
    return fullName(student);
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger la classe. Réessayez dans un instant.');
  }

  protected onEnrolled(name: string): void {
    this.notice.set(`${name} est inscrit dans la classe.`);
    this.roster.reload();
    this.schoolClass.reload();
  }

  protected startRemove(student: ClassStudentDto): void {
    this.removing.set(student);
    this.actionError.set(null);
    this.removeOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const student = this.removing();
    if (!student) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.#api.school.unenroll(student.enrollmentId);
      this.removeOpen.set(false);
      this.notice.set(`${fullName(student)} a été retiré de la classe.`);
      this.roster.reload();
      this.schoolClass.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
