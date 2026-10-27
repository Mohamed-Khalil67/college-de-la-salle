import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { debounce, form, FormField } from '@angular/forms/signals';
import type { UserDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Icon } from '../../../shared/ui';
import { fullName } from '../shared/admin-format';

/** Finds existing students by name or e-mail and enrols them in the class (moving them if needed). */
@Component({
  selector: 'app-enroll-search',
  imports: [FormField, Alert, Button, Field, FieldControl, Icon],
  template: `
    <section class="stack stack--sm panel" aria-labelledby="enroll-title">
      <h2 class="t-h2" id="enroll-title">Inscrire un élève</h2>
      <form role="search" aria-label="Rechercher un élève à inscrire" (submit)="$event.preventDefault()">
        <cdls-field label="Rechercher un élève" helper="Au moins deux lettres du nom, du prénom ou de l’e-mail.">
          <div class="search">
            <cdls-icon name="search" />
            <input cdlsControl type="search" autocomplete="off" [formField]="searchForm.q" />
          </div>
        </cdls-field>
      </form>

      @if (failure()) {
        <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
      }

      @if (query().length >= 2) {
        @if (results.error()) {
          <cdls-alert tone="danger">{{ errorText(results.error()) }}</cdls-alert>
        } @else if (results.hasValue()) {
          <p class="t-body-s t-muted" role="status">{{ countLabel() }}</p>
          @if (results.value().items.length) {
            <ul class="list results" role="list">
              @for (user of results.value().items; track user.id) {
                <li>
                  <span class="list__main">
                    <span class="d-block">{{ name(user) }}</span>
                    <span class="cell-sub">{{ user.email }}</span>
                  </span>
                  @if (user.studentId && enrolledIds().has(user.studentId)) {
                    <span class="t-body-s t-muted">Déjà dans la classe</span>
                  } @else if (user.studentId) {
                    <button cdlsButton variant="secondary" size="sm" type="button" [disabled]="busyId() === user.id" (click)="enroll(user)">
                      Inscrire<span class="visually-hidden"> {{ name(user) }}</span>
                    </button>
                  }
                </li>
              }
            </ul>
            <p class="t-body-s t-muted">Un élève déjà inscrit dans une autre classe de l’année y est déplacé.</p>
          }
        } @else {
          <p class="loading-line" role="status">Recherche…</p>
        }
      }
    </section>
  `,
  styles: `
    .panel {
      padding: var(--space-6);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .results > li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2) var(--space-4);
    }
  `,
})
export class EnrollSearch {
  readonly classId = input.required<string>();
  /** Student ids already in the class. */
  readonly enrolledIds = input<ReadonlySet<string>>(new Set());
  /** Emits the name of the student just enrolled. */
  readonly enrolled = output<string>();

  readonly #api = inject(ApiClient);

  protected readonly searchModel = signal({ q: '' });
  protected readonly searchForm = form(this.searchModel, (p) => debounce(p.q, 300));
  protected readonly query = computed(() => this.searchModel().q.trim());

  protected readonly results = resource({
    params: () => (this.query().length >= 2 ? this.query() : undefined),
    loader: ({ params }) => this.#api.users.list({ role: 'student', search: params, pageSize: 8 }),
  });
  protected readonly countLabel = computed(() => {
    if (!this.results.hasValue()) return '';
    const { total, items } = this.results.value();
    if (!total) return `Aucun élève ne correspond à « ${this.query()} ».`;
    return total > items.length ? `${items.length} premiers résultats sur ${total} : précisez la recherche.` : `${total} résultat${total > 1 ? 's' : ''}.`;
  });

  protected readonly busyId = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected name(user: UserDto): string {
    return fullName(user);
  }

  protected errorText(error: unknown): string {
    return apiMessage(error, 'La recherche a échoué. Réessayez dans un instant.');
  }

  protected async enroll(user: UserDto): Promise<void> {
    if (!user.studentId) return;
    this.busyId.set(user.id);
    this.failure.set(null);
    try {
      await this.#api.school.enroll(this.classId(), user.studentId);
      this.enrolled.emit(fullName(user));
      this.results.reload();
    } catch (error) {
      this.failure.set(apiMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }
}
