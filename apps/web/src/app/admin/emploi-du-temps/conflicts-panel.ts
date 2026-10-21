import { Component, computed, input, output, signal } from '@angular/core';
import {
  TIMETABLE_WARNING_LABELS,
  type TimetableConflictDto,
  type TimetableOccurrenceDto,
  type TimetableWarningDto,
} from '@cdls/shared';
import { Badge, type BadgeTone } from '../../ui';
import { FreeRooms } from '../../timetable/free-rooms';

export interface PanelFix {
  readonly kind: 'move' | 'cancel';
  readonly slotId: string;
  readonly date: string;
}

export interface RoomFix {
  readonly session: TimetableOccurrenceDto;
  readonly roomId: string;
}

interface Issue {
  readonly id: string;
  readonly label: string;
  readonly tone: BadgeTone;
  readonly message: string;
  /** The session to fix: the one that holds the place (conflict) or that raised the warning. */
  readonly slotId: string | null;
  readonly date: string | null;
  readonly rooms: boolean;
}

const CONFLICT_LABELS = {
  room: 'Conflit de salle',
  teacher: 'Conflit d’enseignant',
  class: 'Conflit de classe',
} as const;

/**
 * « Conflits (n) »: the clashes of the last refused save and the warnings of the week, each with fixes on
 * the session concerned: pick a free room (one click), move it, cancel it.
 */
@Component({
  selector: 'app-conflicts-panel',
  imports: [Badge, FreeRooms],
  template: `
    <section class="card card--panel" aria-labelledby="conflits-titre">
      <h2 class="t-h3" id="conflits-titre">Conflits ({{ issues().length }})</h2>
      @if (!issues().length) {
        <p class="t-body-s t-muted">Aucun conflit ni avertissement pour cette semaine.</p>
      } @else {
        <ul class="issues" role="list">
          @for (issue of issues(); track issue.id) {
            <li class="issue">
              <p class="issue__head">
                <cdls-badge [tone]="issue.tone">{{ issue.label }}</cdls-badge>
              </p>
              <p class="issue__text" [id]="'issue-' + issue.id">{{ issue.message }}</p>
              @if (issue.slotId && issue.date) {
                <div class="issue__actions">
                  @if (issue.rooms) {
                    <button
                      type="button"
                      class="btn btn--secondary btn--sm"
                      [attr.aria-expanded]="open() === issue.id"
                      [attr.aria-describedby]="'issue-' + issue.id"
                      (click)="toggleRooms(issue)"
                    >
                      Salles libres
                    </button>
                  }
                  <button
                    type="button"
                    class="btn btn--secondary btn--sm"
                    [attr.aria-describedby]="'issue-' + issue.id"
                    (click)="fix.emit({ kind: 'move', slotId: issue.slotId, date: issue.date })"
                  >
                    Déplacer…
                  </button>
                  <button
                    type="button"
                    class="btn btn--secondary btn--sm"
                    [attr.aria-describedby]="'issue-' + issue.id"
                    (click)="fix.emit({ kind: 'cancel', slotId: issue.slotId, date: issue.date })"
                  >
                    Annuler la séance…
                  </button>
                </div>
                @if (open() === issue.id) {
                  @if (target(); as session) {
                    <app-free-rooms
                      [date]="session.current.date"
                      [startTime]="session.current.startTime"
                      [endTime]="session.current.endTime"
                      [classId]="session.classId"
                      [ignoreSlotId]="session.slotId"
                      (pick)="applyRoom.emit({ session, roomId: $event })"
                    />
                  } @else if (missing() === issue.id) {
                    <p class="t-body-s t-muted">Cette séance est introuvable : elle a peut-être déjà changé. Actualisez la semaine.</p>
                  } @else {
                    <p class="loading-line">Recherche de la séance…</p>
                  }
                }
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .issues {
      display: grid;
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .issue {
      display: grid;
      gap: var(--space-2);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--color-line);
    }
    .issue:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .issue__head,
    .issue__text {
      margin: 0;
    }
    .issue__text {
      font-size: var(--text-body-s);
    }
    .issue__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class ConflictsPanel {
  /** The clashes of the last refused save. */
  readonly conflicts = input<readonly TimetableConflictDto[]>([]);
  /** The warnings of the stored timetable this week. */
  readonly warnings = input<readonly TimetableWarningDto[]>([]);
  /** Finds the session behind an issue (it may not be on the displayed week). */
  readonly locate = input.required<(slotId: string, date: string) => Promise<TimetableOccurrenceDto | null>>();
  readonly fix = output<PanelFix>();
  readonly applyRoom = output<RoomFix>();

  protected readonly open = signal<string | null>(null);
  protected readonly target = signal<TimetableOccurrenceDto | null>(null);
  protected readonly missing = signal<string | null>(null);

  protected readonly issues = computed<Issue[]>(() => [
    ...this.conflicts().map((c, i) => ({
      id: `c${i}`,
      label: CONFLICT_LABELS[c.kind],
      tone: 'danger' as const,
      message: c.message,
      slotId: c.withSource === 'event' ? null : c.withSlotId,
      date: c.date,
      rooms: c.kind === 'room',
    })),
    ...this.warnings().map((w, i) => ({
      id: `w${i}`,
      label: TIMETABLE_WARNING_LABELS[w.code],
      tone: 'warning' as const,
      message: w.message,
      slotId: w.slotId,
      date: w.date,
      rooms: w.code === 'room_capacity' || w.code === 'tp_outside_lab',
    })),
  ]);

  protected async toggleRooms(issue: Issue): Promise<void> {
    if (this.open() === issue.id) {
      this.open.set(null);
      return;
    }
    this.open.set(issue.id);
    this.target.set(null);
    this.missing.set(null);
    if (issue.slotId && issue.date) {
      const found = await this.locate()(issue.slotId, issue.date);
      this.target.set(found);
      if (!found) this.missing.set(issue.id);
    }
  }
}
