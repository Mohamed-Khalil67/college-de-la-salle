import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock } from '../../../shared/components/home-block';
import { Badge } from '../../../shared/ui';
import { blockState, bothOf, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { plural } from '../../../shared/utils/format';
import { approvalsView } from './admin-home-views';

/**
 * « À valider »: the section-change requests waiting for a decision and the accounts nobody has activated.
 * The second count is a bonus: when it cannot be read, the requests still show.
 */
@Component({
  selector: 'app-approvals-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="À valider"
      headingId="bloc-valider"
      [state]="s"
      link="validations"
      linkLabel="Tout valider"
      loadingLabel="Chargement des demandes…"
      emptyText="Rien à valider pour l’instant. Les demandes de changement de section arriveront ici."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <p class="stat">
          <span class="stat__value tabular">{{ s.data.pending }}</span>
          <span class="stat__label">{{ s.data.pending > 1 ? 'demandes' : 'demande' }} de changement de section</span>
        </p>
        @if (s.data.lines.length) {
          <ul class="list" role="list" aria-label="Demandes les plus anciennes">
            @for (line of s.data.lines; track line.id) {
              <li>
                <div class="list__main">
                  <p>{{ line.student }}</p>
                  <p class="list__meta">{{ line.change }}</p>
                </div>
                <cdls-badge tone="warning">À décider</cdls-badge>
              </li>
            }
          </ul>
        }
        @if (s.data.neverActivated) {
          <p class="approvals__accounts">
            {{ plural(s.data.neverActivated, 'compte') }} {{ s.data.neverActivated > 1 ? 'n’ont' : 'n’a' }} pas encore choisi de mot de passe.
          </p>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .stat,
    .approvals__accounts {
      margin: 0;
    }
  `,
})
export class ApprovalsBlock {
  readonly #api = inject(ApiClient);
  readonly #requests = resource({
    loader: () => this.#api.sectionChanges.list({ status: 'pending', pageSize: 3 }),
  });
  readonly #accounts = resource({
    loader: () => this.#api.users.list({ status: 'active', mustChangePassword: true, pageSize: 1 }),
  });

  protected readonly state = computed(() => {
    const accounts = snapshotOf(this.#accounts);
    const settled: Snapshot<number | null> = accounts.error
      ? { error: undefined, value: null }
      : { error: undefined, value: accounts.value ? accounts.value.total : undefined };
    return blockState(bothOf(snapshotOf(this.#requests), settled), ([requests, never]) => approvalsView(requests, never));
  });

  protected readonly plural = plural;

  protected reload(): void {
    this.#requests.reload();
    this.#accounts.reload();
  }
}
