import {
  ABSENCE_MAX_DAYS,
  type AbsenceChoice,
  type AbsenceChoiceKind,
  type AbsenceSessionDto,
  type AbsenceTeacherOption,
  daysBetween,
  type TimetableWarningCode,
  type TimetableWarningDto,
  type AcknowledgedWarning,
} from '@cdls/shared';

/**
 * The rules of « Professeur absent », decorator-free (Vitest checks them): what each lesson needs before the
 * planner can save, how the choices become the request, and how the lessons are grouped by day.
 */

/** What the planner picked for one lesson: nothing yet (''), cancel, a covering teacher, or a supervised study. */
export interface AbsenceDecision {
  readonly kind: AbsenceChoiceKind | '';
  /** substitute: the covering teacher; study: the supervisor. */
  readonly teacherId: string;
  /** study: the room; '' keeps the lesson's own room. */
  readonly roomId: string;
}

export const NO_DECISION: AbsenceDecision = { kind: '', teacherId: '', roomId: '' };

export type Decisions = Readonly<Record<string, AbsenceDecision>>;

export const keyOf = (s: Pick<AbsenceSessionDto, 'slotId' | 'date'>): string =>
  `${s.slotId}@${s.date}`;

export const decisionOf = (
  decisions: Decisions,
  s: Pick<AbsenceSessionDto, 'slotId' | 'date'>,
): AbsenceDecision => decisions[keyOf(s)] ?? NO_DECISION;

/** The free teacher to propose to cover: one who teaches the subject. Null: nobody of the subject is free. */
export function suggestedCover(
  s: Pick<AbsenceSessionDto, 'freeTeachers'>,
): AbsenceTeacherOption | null {
  return s.freeTeachers.find((t) => t.sameSubject) ?? null;
}

/** The choice made for a lesson: picking « Remplacer » proposes the free teacher of the subject, if there is one. */
export function choose(
  session: AbsenceSessionDto,
  kind: AbsenceChoiceKind,
  previous: AbsenceDecision,
): AbsenceDecision {
  if (kind === 'cancelled') return { kind, teacherId: '', roomId: '' };
  const keep = session.freeTeachers.some((t) => t.teacherId === previous.teacherId)
    ? previous.teacherId
    : '';
  if (kind === 'substitute')
    return { kind, teacherId: keep || suggestedCover(session)?.teacherId || '', roomId: '' };
  return { kind, teacherId: keep, roomId: previous.roomId };
}

/** What is missing for this lesson, in words that say how to fix it; null when it is ready. */
export function decisionProblem(s: AbsenceSessionDto, d: AbsenceDecision): string | null {
  if (d.kind === 'substitute' && !d.teacherId) {
    return s.freeTeachers.length
      ? 'Choisissez l’enseignant qui remplace.'
      : 'Aucun enseignant n’est libre à ce moment : annulez la séance ou changez l’horaire.';
  }
  if (d.kind === 'study' && !d.teacherId) {
    return s.freeTeachers.length
      ? 'Choisissez la personne qui surveille l’étude.'
      : 'Personne n’est libre pour surveiller : annulez la séance.';
  }
  return null;
}

/** Lessons nobody has dealt with yet: untouched by the weekly rule's exceptions and without a choice. */
export function untreated(
  sessions: readonly AbsenceSessionDto[],
  decisions: Decisions,
): AbsenceSessionDto[] {
  return sessions.filter((s) => s.currentKind === null && decisionOf(decisions, s).kind === '');
}

/** Everything that stops the save: lessons with no choice, and choices that lack their teacher. */
export interface SaveCheck {
  readonly untreated: readonly AbsenceSessionDto[];
  readonly incomplete: readonly { readonly session: AbsenceSessionDto; readonly message: string }[];
  readonly ready: boolean;
}

export function checkBeforeSave(
  sessions: readonly AbsenceSessionDto[],
  decisions: Decisions,
): SaveCheck {
  const open = untreated(sessions, decisions);
  const incomplete = sessions.flatMap((session) => {
    const message = decisionProblem(session, decisionOf(decisions, session));
    return message ? [{ session, message }] : [];
  });
  const decided = sessions.some((s) => decisionOf(decisions, s).kind !== '');
  return { untreated: open, incomplete, ready: decided && !open.length && !incomplete.length };
}

/** The request's choices: one per lesson the planner decided. */
export function toChoices(
  sessions: readonly AbsenceSessionDto[],
  decisions: Decisions,
): AbsenceChoice[] {
  return sessions.flatMap((s): AbsenceChoice[] => {
    const d = decisionOf(decisions, s);
    if (d.kind === '') return [];
    return [
      {
        slotId: s.slotId,
        date: s.date,
        kind: d.kind,
        ...(d.kind === 'cancelled' ? {} : { teacherId: d.teacherId }),
        ...(d.kind === 'study' && d.roomId ? { roomId: d.roomId } : {}),
      },
    ];
  });
}

export interface ChoiceCounts {
  readonly cancelled: number;
  readonly substitute: number;
  readonly study: number;
}

export function countChoices(
  sessions: readonly AbsenceSessionDto[],
  decisions: Decisions,
): ChoiceCounts {
  const kinds = sessions.map((s) => decisionOf(decisions, s).kind);
  const count = (kind: AbsenceChoiceKind) => kinds.filter((k) => k === kind).length;
  return { cancelled: count('cancelled'), substitute: count('substitute'), study: count('study') };
}

/** The lessons by day, in order. */
export function groupByDay(
  sessions: readonly AbsenceSessionDto[],
): { date: string; sessions: AbsenceSessionDto[] }[] {
  const days: { date: string; sessions: AbsenceSessionDto[] }[] = [];
  for (const s of [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  )) {
    const last = days.at(-1);
    if (last?.date === s.date) last.sessions.push(s);
    else days.push({ date: s.date, sessions: [s] });
  }
  return days;
}

/** The warnings of a refused save, each with the reason typed for it (at least three characters). */
export function acknowledgements(
  warnings: readonly TimetableWarningDto[],
  reasons: Partial<Record<TimetableWarningCode, string>>,
): AcknowledgedWarning[] {
  return warnings
    .map((w) => ({ code: w.code, reason: (reasons[w.code] ?? '').trim() }))
    .filter((a) => a.reason.length >= 3);
}

/** What is wrong with the teacher and the dates of step 1; null when the lessons can be looked up. */
export function periodProblem(
  period: { teacherId: string; from: string; to: string },
  today: string,
): { field: 'teacherId' | 'from' | 'to'; message: string } | null {
  if (!period.teacherId) return { field: 'teacherId', message: 'Choisissez l’enseignant absent.' };
  if (!period.from) return { field: 'from', message: 'Indiquez le premier jour d’absence.' };
  if (period.from < today)
    return {
      field: 'from',
      message:
        'Choisissez aujourd’hui ou un jour à venir : les séances passées ne se modifient plus.',
    };
  if (!period.to) return { field: 'to', message: 'Indiquez le dernier jour d’absence.' };
  if (period.to < period.from)
    return { field: 'to', message: 'Le dernier jour doit suivre le premier.' };
  if (daysBetween(period.from, period.to) >= ABSENCE_MAX_DAYS)
    return {
      field: 'to',
      message: `Une absence couvre ${ABSENCE_MAX_DAYS} jours au plus : enregistrez-la en plusieurs fois.`,
    };
  return null;
}
