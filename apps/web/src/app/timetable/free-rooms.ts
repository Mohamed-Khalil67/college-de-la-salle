import { Component, computed, inject, input, output, resource } from '@angular/core';
import { ROOM_KIND_LABELS } from '@cdls/shared';
import { apiMessage } from '../core/api/api-client';
import { Alert } from '../ui';
import { TimetableApi } from './timetable-api';

let nextId = 0;

/**
 * The rooms nobody holds in a time range, as buttons: one click picks a room. Rooms that seat the class come
 * first; the others say « trop petite » in words.
 */
@Component({
  selector: 'app-free-rooms',
  imports: [Alert],
  template: `
    <div class="free-rooms">
      <p class="free-rooms__title" [id]="titleId">Salles libres à ce moment-là</p>
      @if (failure()) {
        <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
      } @else if (rooms.isLoading() && !rooms.hasValue()) {
        <p class="loading-line">Recherche des salles libres…</p>
      } @else if (!list().length) {
        <p class="t-body-s t-muted">Aucune salle n’est libre à ce moment-là. Déplacez la séance ou annulez-la.</p>
      } @else {
        <ul class="free-rooms__list" role="list" [attr.aria-labelledby]="titleId">
          @for (room of list(); track room.id) {
            <li>
              <button
                type="button"
                class="btn btn--secondary btn--sm"
                [attr.aria-pressed]="room.id === selected() ? 'true' : null"
                (click)="pick.emit(room.id)"
              >
                {{ room.name }}
                <span class="free-rooms__meta">{{ meta(room) }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .free-rooms {
      display: grid;
      gap: var(--space-2);
    }
    .free-rooms__title {
      margin: 0;
      font-weight: 600;
      color: var(--color-heading);
    }
    .free-rooms__list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .free-rooms__meta {
      font-weight: 400;
      color: var(--color-muted);
    }
    button[aria-pressed='true'] {
      border-color: var(--color-primary);
      box-shadow: inset 0 0 0 1px var(--color-primary);
    }
  `,
})
export class FreeRooms {
  readonly date = input.required<string>();
  readonly startTime = input.required<string>();
  readonly endTime = input.required<string>();
  readonly classId = input<string | null>(null);
  /** The session being changed: its own room does not count as taken. */
  readonly ignoreSlotId = input<string | null>(null);
  readonly selected = input<string | null>(null);
  readonly pick = output<string>();

  protected readonly titleId = `free-rooms-${++nextId}`;
  readonly #api = inject(TimetableApi);

  protected readonly rooms = resource({
    params: () =>
      this.date() && this.startTime() && this.endTime() && this.endTime() > this.startTime()
        ? {
            date: this.date(),
            startTime: this.startTime(),
            endTime: this.endTime(),
            classId: this.classId() ?? undefined,
            ignoreSlotId: this.ignoreSlotId() ?? undefined,
          }
        : undefined,
    loader: ({ params }) => this.#api.freeRooms(params),
  });
  protected readonly list = computed(() => (this.rooms.hasValue() ? this.rooms.value() : []));
  protected readonly failure = computed(() => (this.rooms.error() ? apiMessage(this.rooms.error()) : null));

  protected meta(room: { capacity: number | null; kind: keyof typeof ROOM_KIND_LABELS; fitsClass: boolean }): string {
    const places = room.capacity === null ? '' : `${room.capacity} places`;
    return [ROOM_KIND_LABELS[room.kind], places, room.fitsClass ? '' : 'trop petite pour la classe']
      .filter(Boolean)
      .join(', ');
  }
}
