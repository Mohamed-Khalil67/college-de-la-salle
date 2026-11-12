import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { Badge, type BadgeTone, Button } from '../../../shared/ui';
import { blockState, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { type GradingItem, gradingView, type PendingEntry } from './home-views';
import { TeacherHomeData } from './teacher-home-data';

/**
 * « Notes à finir »: the drafts, planned exams and half-entered marks (18 / 27) of every class and subject
 * the teacher grades, newest first. Each one reopens in « Noter » on its class and subject.
 */
@Component({
  selector: 'app-grading-block',
  imports: [Badge, Button, HomeBlock, RouterLink],
  template: `
    @let s = state();
    <app-home-block
      heading="Notes à finir"
      headingId="bloc-notes"
      [state]="s"
      link="noter"
      linkLabel="Noter une classe"
      loadingLabel="Chargement de vos notes…"
      emptyText="Aucune note à finir. Les brouillons et les contrôles prévus apparaîtront ici."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <ul class="list" role="list" aria-label="Notes à finir">
          @for (item of s.data.items; track item.eventId) {
            <li class="grading">
              <div class="list__main">
                <p>{{ item.title }}</p>
                <p class="list__meta">{{ item.meta }}</p>
                <p class="grading__progress">
                  <span class="tabular">{{ item.progress }}</span>
                  <cdls-badge [tone]="tone(item)">{{ item.state }}</cdls-badge>
                </p>
              </div>
              <a
                cdlsButton
                variant="tertiary"
                routerLink="noter"
                [queryParams]="{ classe: item.classId, matiere: item.subjectId }"
                >Reprendre<span class="visually-hidden"> la note {{ item.title }}, {{ item.meta }}</span></a
              >
            </li>
          }
        </ul>
        @if (s.data.more) {
          <p class="grading__more">{{ s.data.more }}</p>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .grading {
      align-items: center;
    }
    .grading p {
      margin: 0;
    }
    .grading__progress {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-1);
      font-size: var(--text-body-s);
      font-weight: 600;
      color: var(--color-heading);
    }
    .grading__more {
      margin: 0;
      color: var(--color-muted);
      font-size: var(--text-body-s);
    }
  `,
})
export class GradingBlock {
  readonly #today = inject(SchoolClock).today;
  readonly #data = inject(TeacherHomeData);

  /** The assignments failing is the block failing; while they load, so does the block. */
  protected readonly state = computed(() => {
    const error = this.#data.assignments.error();
    const source: Snapshot<PendingEntry[]> = error ? { error, value: undefined } : snapshotOf(this.#data.pending);
    return blockState(source, (entries) => gradingView(entries, this.#today()));
  });

  protected reload(): void {
    this.#data.reload();
  }

  protected tone(item: GradingItem): BadgeTone {
    return item.state === 'Prévu' ? 'info' : item.state === 'Publiée en partie' ? 'success' : 'warning';
  }
}
