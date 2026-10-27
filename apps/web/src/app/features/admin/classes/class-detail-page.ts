import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ClassStudentDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { AuthStore } from '../../../core/auth/auth-store';
import { Alert, Avatar, Button, EmptyState, Icon, Tabs, type TabItem } from '../../../shared/ui';
import { ArchivedBanner } from '../shared/archived-banner';
import { ConfirmModal } from '../../../shared/components/confirm-modal';
import { fullName, plural, sectionLabel } from '../shared/admin-format';
import { ArchiveModal, type ArchiveTarget } from '../utilisateurs/archive-modal';
import { ClassSubjectsTab } from './class-subjects-tab';
import { EnrollSearch } from './enroll-search';

/** One class: its enrolled students, enrolment of existing students and removal. */
@Component({
  selector: 'app-class-detail-page',
  imports: [RouterLink, ArchivedBanner, Alert, Avatar, Button, EmptyState, Icon, Tabs, ArchiveModal, ClassSubjectsTab, ConfirmModal, EnrollSearch],
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
        @if (isAdmin() && schoolClass.value().studentCount > 0) {
          <div class="page__actions">
            <button cdlsButton variant="secondary" type="button" (click)="archiveOpen.set(true)">Archiver la classe</button>
          </div>
        }
      </div>
    } @else {
      <div class="page__header"><div class="page__header-text"><h1 class="t-h1">Classe</h1></div></div>
    }

    @if (archivedYear(); as year) {
      <app-archived-banner [label]="year.label" />
    }

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    @if (isAdmin()) {
      <cdls-tabs [tabs]="tabs" label="Contenu de la classe" [(value)]="tab">
        @if (tab() === 'matieres') {
          @if (schoolClass.hasValue()) {
            <app-class-subjects-tab [schoolClass]="schoolClass.value()" />
          }
        } @else {
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
        }
      </cdls-tabs>
    } @else if (schoolClass.hasValue()) {
      <section class="stack" aria-labelledby="subjects-title">
        <h2 class="t-h2" id="subjects-title">Matières de la classe</h2>
        <app-class-subjects-tab [schoolClass]="schoolClass.value()" />
      </section>
    }

    <app-archive-modal [(open)]="archiveOpen" [target]="archiveTarget()" (archived)="onArchived($event)" />
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
  /** Query parameter `?onglet=matieres` opens the subjects tab (the year checklist links to it). */
  readonly onglet = input<string | undefined>(undefined);

  readonly #api = inject(ApiClient);
  protected readonly plural = plural;
  readonly #auth = inject(AuthStore);
  /** The roster is the admin's: a coordinator (a teacher) only works on the class's subjects. */
  protected readonly isAdmin = computed(() => this.#auth.role() === 'admin');
  protected readonly tabs: readonly TabItem[] = [
    { id: 'eleves', label: 'Élèves inscrits' },
    { id: 'matieres', label: 'Matières de la classe' },
  ];
  protected readonly tab = linkedSignal(() => (this.onglet() === 'matieres' ? 'matieres' : 'eleves'));

  protected readonly schoolClass = resource({ params: () => this.id(), loader: ({ params }) => this.#api.school.class(params) });
  protected readonly roster = resource({
    params: () => (this.isAdmin() ? this.id() : undefined),
    loader: ({ params }) => this.#api.school.classStudents(params),
  });
  /** The school year of the class, to say so when it is archived (read-only). */
  protected readonly years = resource({ loader: () => this.#api.school.years() });
  protected readonly archivedYear = computed(() => {
    if (!this.schoolClass.hasValue() || !this.years.hasValue()) return null;
    const yearId = this.schoolClass.value().schoolYearId;
    const year = this.years.value().find((y) => y.id === yearId);
    return year?.status === 'archived' ? year : null;
  });
  protected readonly track = computed(() => (this.schoolClass.hasValue() ? sectionLabel(this.schoolClass.value().sectionCode) : ''));
  protected readonly enrolledIds = computed(() => new Set(this.roster.hasValue() ? this.roster.value().map((s) => s.id) : []));

  protected readonly notice = signal<string | null>(null);
  protected readonly archiveOpen = signal(false);
  protected readonly archiveTarget = computed<ArchiveTarget | null>(() =>
    this.schoolClass.hasValue()
      ? { kind: 'class', classId: this.id(), label: this.schoolClass.value().label, count: this.schoolClass.value().studentCount }
      : null,
  );
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

  protected onArchived(count: number): void {
    this.notice.set(`${plural(count, 'élève archivé', 'élèves archivés')} : ils ne figurent plus dans la classe.`);
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
