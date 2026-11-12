import { Component, computed, effect, inject, resource, untracked } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { blockState, snapshotOf } from '../../../shared/utils/block-state';
import { plural } from '../../../shared/utils/format';
import { freeUntilText, roomsView } from './planner-views';

/** The rooms are looked at again every five minutes (the minute of the school clock, never a timer of its own). */
const REFRESH_EVERY = 5;

/** « Salles maintenant »: the rooms nobody holds at this minute, and until when they stay free. */
@Component({
  selector: 'app-rooms-block',
  imports: [HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Salles maintenant"
      headingId="bloc-salles"
      [state]="s"
      link="/admin/emploi-du-temps"
      linkLabel="Occupation des salles"
      loadingLabel="Chargement des salles…"
      emptyText="Aucune salle n’est enregistrée. Ajoutez-en dans « Salles »."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <p class="stat">
          <span class="stat__value tabular">{{ s.data.free }}</span>
          <span class="stat__label">{{ label(s.data.free, s.data.total) }}</span>
        </p>
        @if (s.data.shown.length) {
          <ul class="list" role="list" aria-label="Salles libres">
            @for (room of s.data.shown; track room.id) {
              <li>
                <div class="list__main">
                  <p>{{ room.name }}</p>
                  <p class="list__meta">{{ until(room.freeUntil) }}</p>
                </div>
              </li>
            }
          </ul>
          @if (s.data.more > 0) {
            <p class="list__meta">et {{ plural(s.data.more, 'autre salle') }}</p>
          }
        } @else {
          <p class="list__meta">Toutes les salles sont occupées en ce moment.</p>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    p {
      margin: 0;
    }
  `,
})
export class RoomsBlock {
  readonly #api = inject(ApiClient);
  readonly #clock = inject(SchoolClock);
  protected readonly plural = plural;
  protected readonly until = freeUntilText;

  readonly #rooms = resource({ loader: () => this.#api.planner.roomsNow() });
  protected readonly state = computed(() => blockState(snapshotOf(this.#rooms), roomsView));

  constructor() {
    let first = true;
    effect(() => {
      const minute = Number(this.#clock.now().slice(3));
      if (first) {
        first = false;
        return;
      }
      if (minute % REFRESH_EVERY === 0) untracked(() => this.#rooms.reload());
    });
  }

  protected label(free: number, total: number): string {
    return `${free > 1 ? 'salles libres' : 'salle libre'} sur ${total}`;
  }

  protected reload(): void {
    this.#rooms.reload();
  }
}
