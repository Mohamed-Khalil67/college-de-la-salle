import { Component, computed, input } from '@angular/core';
import type { CandidateRowStatus } from '@exam/data-access-exams';

const LABELS: Record<CandidateRowStatus, string> = {
  IN_PROGRESS: 'In progress',
  GRADING: 'Grading…',
  NEEDS_REVIEW: 'Needs review',
  GRADED: 'Graded',
  EXPIRED: 'Expired',
};

@Component({
  selector: 'exam-status-badge',
  template: `<span [class]="'badge ' + tone()">{{ label() }}</span>`,
  styles: `
    .badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
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
