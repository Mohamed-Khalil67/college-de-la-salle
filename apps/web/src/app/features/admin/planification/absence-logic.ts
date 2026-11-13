import {
  ABSENCE_MAX_DAYS,
  type AbsenceChoice,
  type AbsenceChoiceKind,
  type AbsenceSessionDto,
  type AbsenceTeacherOption,
  type CoverLesson,
  type CoverPick,
  daysBetween,
  offerable,
  reconcileCovers,
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

/** The lesson as the shared cover rules (`@cdls/shared` absence-cover) see it. */
export function toCoverLesson(s: AbsenceSessionDto): CoverLesson {
  return {
    key: keyOf(s),
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    free: s.freeTeachers,
  };
}

/** Who is picked (cover or supervisor) on each lesson, by key. */
export function pickedTeachers(decisions: Decisions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, d] of Object.entries(decisions))
    if ((d.kind === 'substitute' || d.kind === 'study') && d.teacherId) out[key] = d.teacherId;
  return out;
}

/**
 * The free teachers to offer for a lesson: none that another lesson at the same time already holds, so the
 * same person is never proposed for two simultaneous lessons (the save would be refused with a conflict).
 */
export function offeredFor(
  session: AbsenceSessionDto,
  sessions: readonly AbsenceSessionDto[],
  decisions: Decisions,
): AbsenceTeacherOption[] {
  const offered = new Set(
    offerable(toCoverLesson(session), sessions.map(toCoverLesson), pickedTeachers(decisions)).map(
      (t) => t.teacherId,
    ),
  );
  return session.freeTeachers.filter((t) => offered.has(t.teacherId));
}

/** The choice made for a lesson: picking « Remplacer » proposes the offered teacher of the subject, if there is one. */
export function choose(
  session: AbsenceSessionDto,
  kind: AbsenceChoiceKind,
  previous: AbsenceDecision,
  offered: readonly AbsenceTeacherOption[] = session.freeTeachers,
): AbsenceDecision {
  if (kind === 'cancelled') return { kind, teacherId: '', roomId: '' };
  const keep = offered.some((t) => t.teacherId === previous.teacherId) ? previous.teacherId : '';
  if (kind === 'substitute')
    return {
      kind,
      teacherId: keep || suggestedCover({ freeTeachers: offered })?.teacherId || '',
      roomId: '',
    };
  return { kind, teacherId: keep, roomId: previous.roomId };
}

/** What is missing for this lesson, in words that say how to fix it; null when it is ready. */
export function decisionProblem(
  s: AbsenceSessionDto,
  d: AbsenceDecision,
  offered: readonly AbsenceTeacherOption[] = s.freeTeachers,
): string | null {
  if (
    (d.kind === 'substitute' || d.kind === 'study') &&
    (s.currentKind === 'moved' || s.currentKind === 'room_change')
  ) {
    return 'Cette séance a été déplacée ou change de salle : rétablissez-la d’abord dans l’emploi du temps, ou annulez-la.';
  }
  if (
    (d.kind === 'substitute' || d.kind === 'study') &&
    d.teacherId &&
    !offered.some((t) => t.teacherId === d.teacherId)
  ) {
    return 'Cette personne n’est plus libre à ce moment : choisissez-en une autre.';
  }
  if (d.kind === 'substitute' && !d.teacherId) {
    return offered.length
      ? 'Choisissez l’enseignant qui remplace.'
      : 'Aucun enseignant n’est libre à ce moment : annulez la séance ou changez l’horaire.';
  }
  if (d.kind === 'study' && !d.teacherId) {
    return offered.length
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
  // Only a cancelled lesson is settled: one moved or in another room is still the absent teacher's.
  return sessions.filter(
    (s) => s.currentKind !== 'cancelled' && decisionOf(decisions, s).kind === '',
  );
}

const inOrder = (a: AbsenceSessionDto, b: AbsenceSessionDto): number =>
  a.date.localeCompare(b.date) ||
  a.startTime.localeCompare(b.startTime) ||
  keyOf(a).localeCompare(keyOf(b));

/** A cover the planner had picked that the fresh lists no longer allow, and what stands there now. */
export interface ReplacedCover {
  readonly session: AbsenceSessionDto;
  /** Name of the teacher who was picked; '' when unknown. */
  readonly was: string;
  /** Name of the new proposal; '' when nobody is proposed (the planner must choose). */
  readonly now: string;
}

/**
 * The decisions made against an earlier list of lessons, kept against a fresh one (after a refused save the
 * free teachers changed): lessons that are still there keep their choice; a covering teacher who is not free
 * any more, or who a lesson at the same time holds, is replaced by a new proposal (or by nobody), and each
 * replacement is reported so the page can say so. `names` maps teacher ids to names (from the old lists).
 */
export function refreshDecisions(
  sessions: readonly AbsenceSessionDto[],
  decisions: Decisions,
  names: ReadonlyMap<string, string>,
): { decisions: Decisions; replaced: ReplacedCover[] } {
  const present = new Set(sessions.map(keyOf));
  const kept: Record<string, AbsenceDecision> = {};
  const picks: Record<string, CoverPick> = {};
  for (const [key, d] of Object.entries(decisions)) {
    if (!present.has(key)) continue;
    kept[key] = d;
    if (d.kind === 'substitute' || d.kind === 'study') picks[key] = { kind: d.kind, teacherId: d.teacherId };
  }
  const { teachers, replaced } = reconcileCovers(sessions.map(toCoverLesson), picks);
  for (const key of Object.keys(picks)) {
    const d = kept[key];
    if (d) kept[key] = { ...d, teacherId: teachers[key] ?? '' };
  }
  const bySession = new Map(sessions.map((s) => [keyOf(s), s]));
  return {
    decisions: kept,
    replaced: replaced.flatMap((r) => {
      const session = bySession.get(r.key);
      return session
        ? [{ session, was: names.get(r.was) ?? '', now: names.get(r.now) ?? '' }]
        : [];
    }),
  };
}

/** The names of the teachers listed on these lessons, by id. */
export function teacherNames(sessions: readonly AbsenceSessionDto[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const s of sessions) for (const t of s.freeTeachers) names.set(t.teacherId, t.name);
  return names;
}

/** « Mona Maths ne peut plus prendre Maths (1ère A) du … : Nour Nabil la remplace. », for the refreshed page. */
export function replacedText(r: ReplacedCover, when: string): string {
  const lesson = `${r.session.subjectName} (${r.session.classLabel}) ${when}`;
  const who = r.was || 'La personne choisie';
  return r.now
    ? `${who} n’est plus libre pour ${lesson} : ${r.now} est proposé à sa place.`
    : `${who} n’est plus libre pour ${lesson} : choisissez quelqu’un d’autre.`;
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
    // Two lessons at the same time that hold the same teacher: the earlier one keeps them, the later one is flagged.
    const earlier = Object.fromEntries(
      Object.entries(decisions).filter(([key]) => {
        const other = sessions.find((o) => keyOf(o) === key);
        return !!other && inOrder(other, session) < 0;
      }),
    );
    const message = decisionProblem(
      session,
      decisionOf(decisions, session),
      offeredFor(session, sessions, earlier),
    );
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
