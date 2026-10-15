import type { ExamSession, Submission } from '@exam/contracts';
import { toRow } from './examiner-dashboard.store';
import { estimateClockOffset } from './server-clock';

const session: ExamSession = {
  id: 's1',
  examId: 'e1',
  examOwnerId: 'owner',
  examTitle: 'Exam',
  candidateId: 'c1',
  candidateName: 'Carol',
  startedAt: 1_000,
  expiresAt: 301_000,
  status: 'ACTIVE',
  integrity: { maxVisibilityLosses: null },
  submittedAt: null,
};

const submission: Submission = {
  id: 's1',
  sessionId: 's1',
  examId: 'e1',
  examOwnerId: 'owner',
  candidateId: 'c1',
  candidateName: 'Carol',
  answers: {},
  integrity: { visibilityLossCount: 0, hiddenMs: 0 },
  completedBy: 'AUTO_TIMER',
  expiresAt: 301_000,
  submittedAt: 299_000,
  score: null,
  maxScore: null,
  gradedAt: null,
};

describe('dashboard row derivation', () => {
  it('is IN_PROGRESS with a live countdown before expiry', () => {
    const row = toRow(session, null, 241_000);
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.remainingMs).toBe(60_000);
  });

  it('is EXPIRED once the deadline passes without a submission, even before the sweeper runs', () => {
    expect(toRow(session, null, 301_000).status).toBe('EXPIRED');
  });

  it('is GRADING until the server writes a score, then GRADED', () => {
    expect(toRow(session, submission, 299_500).status).toBe('GRADING');
    expect(toRow(session, { ...submission, score: 4, maxScore: 6 }, 299_500).status).toBe('GRADED');
  });
});

describe('server clock offset', () => {
  it('assumes the server stamped at the midpoint of the round trip', () => {
    // Local clock is 5s behind; RTT 200ms.
    expect(estimateClockOffset(10_100, 5_000, 5_200)).toBe(5_000);
  });
});
