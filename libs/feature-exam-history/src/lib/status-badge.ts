import { Component, computed, input } from '@angular/core';
import type { CandidateRowStatus } from '@exam/data-access-exams';

const LABELS: Record<CandidateRowStatus, string> = {
  IN_PROGRESS: 'قيد الأداء',
  GRADING: 'جارٍ التصحيح…',
  NEEDS_REVIEW: 'بانتظار التصحيح',
  GRADED: 'صُحِّح',
  EXPIRED: 'انتهى الوقت',
};

@Component({
  selector: 'exam-status-badge',
  template: `<span [class]="'badge ' + tone()">{{ label() }}</span>`,
  styles: `
    .badge { display: inline-block; padding-block: 0.1rem; padding-inline: 0.65rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
    .live { background: var(--accent-soft); color: var(--accent-strong); }
    .pending { background: var(--warn-soft); color: var(--warn-strong); }
    .ok { background: var(--ok-soft); color: var(--ok-strong); }
    .off { background: var(--surface-2); color: var(--muted); }
  `,
})
export class StatusBadge {
  readonly status = input.required<CandidateRowStatus>();
  protected readonly label = computed(() => LABELS[this.status()]);
  protected readonly tone = computed(() => {
    switch (this.status()) {
      case 'IN_PROGRESS':
        return 'live';
      case 'GRADING':
      case 'NEEDS_REVIEW':
        return 'pending';
      case 'GRADED':
        return 'ok';
      case 'EXPIRED':
        return 'off';
    }
  });
}
