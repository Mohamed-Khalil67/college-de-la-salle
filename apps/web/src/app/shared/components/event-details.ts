import { Component, DOCUMENT, computed, inject, input, model } from '@angular/core';
import { type OccurrenceDto, safeAttachments } from '@cdls/shared';
import { Badge, Button, Icon, Modal } from '../ui';
import { saveFile } from '../utils/download';
import { dayTitle, isAssessment, kindLabel, longDate, mark, subjectName, timeSpan, whereOf } from '../utils/format';
import { eventIcs, fileName } from '../utils/week';
import { eventTargetLine } from '../utils/targets';

/**
 * The details of one calendar occurrence in a dialog: when, where, who, the description, the https
 * attachments and « Ajouter à mon agenda » (.ics). Extra actions (edit, delete) are projected.
 */
@Component({
  selector: 'app-event-details',
  imports: [Modal, Badge, Button, Icon],
  template: `
    <cdls-modal [title]="occurrence()?.event?.title ?? 'Événement'" [(open)]="open">
      @if (occurrence(); as o) {
        <div class="stack stack--sm">
          <p><cdls-badge [tone]="exam() ? 'heritage' : 'info'">{{ kind() }}</cdls-badge></p>
          <dl class="details">
            <dt>Date</dt>
            <dd>{{ day() }}</dd>
            <dt>Horaire</dt>
            <dd>{{ time() }}</dd>
            @if (o.event.repeatUntil) {
              <dt>Répétition</dt>
              <dd>Chaque semaine jusqu’au {{ until() }}</dd>
            }
            @if (subject()) {
              <dt>Matière</dt>
              <dd>{{ subject() }}</dd>
            }
            @if (where()) {
              <dt>Lieu</dt>
              <dd>{{ where() }}</dd>
            }
            @if (!o.event.target.whole) {
              <dt>Pour</dt>
              <dd>{{ targetLine() }}</dd>
            }
            @if (gradable()) {
              <dt>Coefficient</dt>
              <dd>{{ coefficient() }}</dd>
            }
            <dt>Proposé par</dt>
            <dd>{{ o.event.authorName }}</dd>
          </dl>
          @if (o.event.description) {
            <p class="details__text">{{ o.event.description }}</p>
          }
          @if (attachments().length) {
            <h3 class="t-label">Documents et liens</h3>
            <ul class="stack stack--sm" role="list">
              @for (link of attachments(); track link.url) {
                <li>
                  <a [href]="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}<span class="visually-hidden"> (s’ouvre dans un nouvel onglet)</span></a>
                </li>
              }
            </ul>
          }
        </div>
        <div class="modal__footer">
          <ng-content />
          <button cdlsButton variant="secondary" type="button" (click)="downloadIcs()"><cdls-icon name="calendar" />Ajouter à mon agenda</button>
        </div>
      }
    </cdls-modal>
  `,
  styles: `
    .details {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--space-1) var(--space-4);
    }
    .details dt {
      color: var(--color-muted);
    }
    .details__text {
      white-space: pre-line;
    }
  `,
})
export class EventDetails {
  readonly occurrence = input<OccurrenceDto | null>(null);
  readonly open = model(false);

  readonly #document = inject(DOCUMENT);

  protected readonly kind = computed(() => kindLabel(this.occurrence()?.event.type ?? { label: '' }));
  protected readonly exam = computed(() => {
    const type = this.occurrence()?.event.type;
    return !!type && isAssessment(type);
  });
  protected readonly gradable = computed(() => this.occurrence()?.event.type.gradable ?? false);
  protected readonly where = computed(() => {
    const e = this.occurrence()?.event;
    return e ? whereOf(e) : '';
  });
  protected readonly targetLine = computed(() => eventTargetLine(this.occurrence()?.event.target));
  protected readonly coefficient = computed(() => mark(this.occurrence()?.event.coefficient ?? 1));
  protected readonly day = computed(() => dayTitle(this.occurrence()?.day ?? '2000-01-01'));
  protected readonly until = computed(() => longDate(this.occurrence()?.event.repeatUntil ?? '2000-01-01'));
  protected readonly time = computed(() => timeSpan(this.occurrence()?.event.startTime, this.occurrence()?.event.endTime));
  protected readonly subject = computed(() => {
    const e = this.occurrence()?.event;
    return e ? subjectName(e.subjectId) : '';
  });
  protected readonly attachments = computed(() => safeAttachments(this.occurrence()?.event.attachments ?? []));

  /**
   * The API's /events/:id/ics needs the bearer token, which a plain link can't send, so the same file
   * is written here with the shared toIcs().
   */
  protected downloadIcs(): void {
    const e = this.occurrence()?.event;
    if (!e) return;
    saveFile(this.#document, new Blob([eventIcs(e)], { type: 'text/calendar;charset=utf-8' }), fileName(e.title, 'ics'));
  }
}
