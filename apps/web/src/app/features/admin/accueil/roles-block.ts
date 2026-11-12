import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState, bothOf, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { plural } from '../../../shared/utils/format';
import { rolesView } from './admin-home-views';

/**
 * « Rôles »: who holds the Planificateur permission and how many administrators there are. The count of
 * administrators is a bonus: when it cannot be read, the planners still show.
 */
@Component({
  selector: 'app-roles-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Rôles"
      headingId="bloc-roles"
      [state]="s"
      link="utilisateurs"
      linkLabel="Comptes et droits"
      loadingLabel="Chargement des rôles…"
      emptyText=""
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <div class="roles__group">
          <h3 class="roles__title">Planificateurs ({{ s.data.plannerCount }})</h3>
          @if (s.data.planners.length) {
            <ul class="roles__names" role="list">
              @for (name of s.data.planners; track name) {
                <li>{{ name }}</li>
              }
            </ul>
            @if (s.data.plannerCount > s.data.planners.length) {
              <p class="roles__more">et {{ s.data.plannerCount - s.data.planners.length }} autre{{ s.data.plannerCount - s.data.planners.length > 1 ? 's' : '' }}</p>
            }
          } @else {
            <p class="roles__more">Personne n’a encore le droit de gérer les horaires. Donnez-le depuis la fiche d’un compte.</p>
          }
        </div>
        @if (s.data.adminCount !== null) {
          <p class="roles__admins">{{ plural(s.data.adminCount, 'administrateur') }}</p>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .roles__group {
      display: grid;
      gap: var(--space-2);
    }
    .roles__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-heading);
    }
    .roles__names {
      display: grid;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .roles__more,
    .roles__admins {
      margin: 0;
      color: var(--color-body);
    }
  `,
})
export class RolesBlock {
  readonly #api = inject(ApiClient);
  readonly #planners = resource({ loader: () => this.#api.users.list({ isPlanner: true, status: 'active', pageSize: 5 }) });
  readonly #admins = resource({ loader: () => this.#api.users.list({ role: 'admin', status: 'active', pageSize: 1 }) });

  protected readonly state = computed(() => {
    const admins = snapshotOf(this.#admins);
    const settled: Snapshot<number | null> = admins.error
      ? { error: undefined, value: null }
      : { error: undefined, value: admins.value ? admins.value.total : undefined };
    return blockState(bothOf(snapshotOf(this.#planners), settled), ([planners, count]) => rolesView(planners, count));
  });

  protected readonly plural = plural;

  protected reload(): void {
    this.#planners.reload();
    this.#admins.reload();
  }
}
