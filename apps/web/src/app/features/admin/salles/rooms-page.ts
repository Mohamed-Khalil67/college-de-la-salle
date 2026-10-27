import { DOCUMENT } from '@angular/common';
import { Component, inject, resource, signal } from '@angular/core';
import { ROOM_KIND_LABELS, type RoomDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Badge, Button, EmptyState, Icon } from '../../../shared/ui';
import { ConfirmModal } from '../../../shared/components/confirm-modal';
import { focusPageHeading } from '../../../shared/utils/focus';
import { RoomFormModal } from './room-form-modal';

/** Rooms of the school: create, edit (name, kind, seats, active) and delete the ones no event uses. */
@Component({
  selector: 'app-rooms-page',
  imports: [Alert, Badge, Button, EmptyState, Icon, ConfirmModal, RoomFormModal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Salles</h1>
        <p class="t-muted">Les lieux que les enseignants choisissent pour leurs cours et leurs événements.</p>
      </div>
      <div class="page__actions">
        <button cdlsButton type="button" (click)="startCreate()"><cdls-icon name="plus" />Créer une salle</button>
      </div>
    </div>

    @if (notice()) {
      <cdls-alert tone="success">{{ notice() }}</cdls-alert>
    }

    @if (rooms.error()) {
      <cdls-alert tone="danger">{{ errorText(rooms.error()) }}</cdls-alert>
    } @else if (rooms.hasValue()) {
      @if (rooms.value().length) {
        <div class="table-wrap" role="region" aria-labelledby="rooms-caption" tabindex="0">
          <table class="table table--stack">
            <caption id="rooms-caption" class="visually-hidden">Salles du collège</caption>
            <thead>
              <tr>
                <th scope="col">Salle</th>
                <th scope="col">Type</th>
                <th scope="col" class="num">Places</th>
                <th scope="col">Statut</th>
                <th scope="col" class="num"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (room of rooms.value(); track room.id) {
                <tr>
                  <th scope="row">{{ room.name }}</th>
                  <td data-label="Type :">{{ kindLabels[room.kind] }}</td>
                  <td class="num" data-label="Places :">{{ room.capacity ?? '—' }}</td>
                  <td data-label="Statut :">
                    @if (room.active) {
                      <cdls-badge tone="success">Utilisable</cdls-badge>
                    } @else {
                      <cdls-badge tone="neutral">Désactivée</cdls-badge>
                    }
                  </td>
                  <td class="num">
                    <span class="row-actions">
                      <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startEdit(room)">
                        Modifier<span class="visually-hidden"> {{ room.name }}</span>
                      </button>
                      <button cdlsButton variant="tertiary" size="sm" type="button" (click)="startDelete(room)">
                        Supprimer<span class="visually-hidden"> {{ room.name }}</span>
                      </button>
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <cdls-empty-state icon="map-pin" title="Aucune salle" description="Ajoutez les salles du collège pour les proposer dans l’agenda.">
          <button cdlsButton variant="secondary" type="button" (click)="startCreate()">Créer une salle</button>
        </cdls-empty-state>
      }
    } @else {
      <p class="loading-line" role="status">Chargement des salles…</p>
    }

    <app-room-form-modal [(open)]="formOpen" [editing]="editing()" (saved)="onSaved($event)" />

    <app-confirm-modal
      title="Supprimer cette salle ?"
      confirmLabel="Supprimer la salle"
      [danger]="true"
      [busy]="busy()"
      [error]="actionError()"
      [(open)]="deleteOpen"
      [restoreFocus]="!leaving()"
      (closed)="afterConfirmClosed()"
      (confirmed)="remove()"
    >
      <p><strong>{{ deleting()?.name }}</strong> sera supprimée de la liste des salles.</p>
      <p class="t-body-s t-muted">Si des événements l’utilisent, désactivez-la plutôt : elle ne pourra plus être choisie.</p>
    </app-confirm-modal>
  `,
  styles: `
    .row-actions {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-1);
    }
  `,
})
export class RoomsPage {
  readonly #api = inject(ApiClient);
  readonly #document = inject(DOCUMENT);
  protected readonly leaving = signal(false);

  protected readonly kindLabels = ROOM_KIND_LABELS;
  protected readonly rooms = resource({ loader: () => this.#api.school.rooms() });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<RoomDto | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal<RoomDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected errorText(error: unknown): string {
    return apiMessage(error, 'Impossible de charger les salles. Réessayez dans un instant.');
  }

  /** After a confirmed action that removed the opener, focus goes to the page heading. */
  protected afterConfirmClosed(): void {
    if (!this.leaving()) return;
    this.leaving.set(false);
    focusPageHeading(this.#document);
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected startEdit(room: RoomDto): void {
    this.editing.set(room);
    this.formOpen.set(true);
  }

  protected onSaved(room: RoomDto): void {
    this.notice.set(`Salle « ${room.name} » ${this.editing() ? 'modifiée' : 'créée'}.`);
    this.rooms.reload();
  }

  protected startDelete(room: RoomDto): void {
    this.deleting.set(room);
    this.actionError.set(null);
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const room = this.deleting();
    if (!room) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.#api.school.deleteRoom(room.id);
      this.leaving.set(true);
      this.deleteOpen.set(false);
      this.notice.set(`Salle « ${room.name} » supprimée.`);
      this.rooms.reload();
    } catch (error) {
      this.actionError.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
