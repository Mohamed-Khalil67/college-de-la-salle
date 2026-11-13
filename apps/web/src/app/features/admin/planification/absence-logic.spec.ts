import { describe, expect, it } from 'vitest';
import type { AbsenceSessionDto } from '@cdls/shared';
import {
  acknowledgements,
  checkBeforeSave,
  choose,
  countChoices,
  decisionProblem,
  groupByDay,
  keyOf,
  NO_DECISION,
  offeredFor,
  refreshDecisions,
  replacedText,
  teacherNames,
  periodProblem,
  suggestedCover,
  toChoices,
  untreated,
  type Decisions,
} from './absence-logic';

const session = (over: Partial<AbsenceSessionDto> = {}): AbsenceSessionDto => ({
  slotId: 's1',
  date: '2026-12-01',
  classLabel: '1ère A',
  groupLabel: null,
  subjectName: 'Maths',
  startTime: '08:00',
  endTime: '09:00',
  roomId: 'r1',
  roomName: 'B12',
  currentKind: null,
  freeTeachers: [
    { teacherId: 'o', name: 'Omar Autre', sameSubject: false },
    { teacherId: 'm', name: 'Mona Maths', sameSubject: true },
  ],
  ...over,
});

describe('suggestedCover and choose', () => {
  it('proposes a free teacher of the subject, or none', () => {
    expect(suggestedCover(session())?.teacherId).toBe('m');
    expect(
      suggestedCover(
        session({ freeTeachers: [{ teacherId: 'o', name: 'O', sameSubject: false }] }),
      ),
    ).toBeNull();
  });
  it('picking « Remplacer » fills the suggestion; « Annuler » clears the teacher', () => {
    expect(choose(session(), 'substitute', NO_DECISION)).toEqual({
      kind: 'substitute',
      teacherId: 'm',
      roomId: '',
    });
    expect(
      choose(session(), 'cancelled', { kind: 'substitute', teacherId: 'm', roomId: '' }),
    ).toEqual({
      kind: 'cancelled',
      teacherId: '',
      roomId: '',
    });
  });
  it('keeps a teacher already picked when the kind changes between cover and study', () => {
    const picked = { kind: 'substitute' as const, teacherId: 'o', roomId: '' };
    expect(choose(session(), 'study', picked)).toEqual({
      kind: 'study',
      teacherId: 'o',
      roomId: '',
    });
  });
  it('leaves the cover empty when nobody of the subject is free', () => {
    const s = session({ freeTeachers: [{ teacherId: 'o', name: 'O', sameSubject: false }] });
    expect(choose(s, 'substitute', NO_DECISION).teacherId).toBe('');
  });
});

describe('what stops the save', () => {
  it('says how to fix a cover or a study without a teacher, and when nobody is free', () => {
    expect(decisionProblem(session(), { kind: 'substitute', teacherId: '', roomId: '' })).toContain(
      'Choisissez l’enseignant',
    );
    expect(decisionProblem(session(), { kind: 'study', teacherId: '', roomId: '' })).toContain(
      'surveille',
    );
    expect(
      decisionProblem(session({ freeTeachers: [] }), {
        kind: 'substitute',
        teacherId: '',
        roomId: '',
      }),
    ).toContain('Aucun enseignant');
    expect(decisionProblem(session(), { kind: 'cancelled', teacherId: '', roomId: '' })).toBeNull();
  });
  it('warns that a moved or re-roomed lesson cannot be covered from here, but can be cancelled', () => {
    const moved = session({ currentKind: 'moved' });
    expect(decisionProblem(moved, { kind: 'substitute', teacherId: 'm', roomId: '' })).toContain(
      'rétablissez-la',
    );
    expect(decisionProblem(moved, { kind: 'study', teacherId: 'm', roomId: '' })).toContain(
      'rétablissez-la',
    );
    expect(decisionProblem(moved, { kind: 'cancelled', teacherId: '', roomId: '' })).toBeNull();
    expect(
      checkBeforeSave([moved], {
        [keyOf(moved)]: { kind: 'substitute', teacherId: 'm', roomId: '' },
      }).ready,
    ).toBe(false);
  });
  it('wants every untouched lesson dealt with, and at least one choice', () => {
    const a = session({ slotId: 'a' });
    const b = session({ slotId: 'b' });
    const decisions: Decisions = { [keyOf(a)]: { kind: 'cancelled', teacherId: '', roomId: '' } };
    expect(untreated([a, b], decisions)).toEqual([b]);
    expect(checkBeforeSave([a, b], decisions).ready).toBe(false);
    expect(
      checkBeforeSave([a, b], {
        ...decisions,
        [keyOf(b)]: { kind: 'cancelled', teacherId: '', roomId: '' },
      }).ready,
    ).toBe(true);
    expect(checkBeforeSave([], {}).ready).toBe(false);
  });
  it('lets a lesson already handled stay as it is', () => {
    const handled = session({ slotId: 'h', currentKind: 'cancelled' });
    const fresh = session({ slotId: 'f' });
    const check = checkBeforeSave([handled, fresh], {
      [keyOf(fresh)]: { kind: 'cancelled', teacherId: '', roomId: '' },
    });
    expect(check.ready).toBe(true);
    expect(
      toChoices([handled, fresh], {
        [keyOf(fresh)]: { kind: 'cancelled', teacherId: '', roomId: '' },
      }),
    ).toHaveLength(1);
  });
  it('still wants a choice for a lesson that was only moved or re-roomed', () => {
    const moved = session({ slotId: 'mv', currentKind: 'moved' });
    expect(untreated([moved], {})).toEqual([moved]);
  });
  it('reports an incomplete choice', () => {
    const a = session();
    const check = checkBeforeSave([a], {
      [keyOf(a)]: { kind: 'study', teacherId: '', roomId: '' },
    });
    expect(check.ready).toBe(false);
    expect(check.incomplete[0]?.message).toContain('surveille');
  });
});

describe('the request', () => {
  it('has one choice per decided lesson, the teacher and the room only where they count', () => {
    const [a, b, c] = [
      session({ slotId: 'a' }),
      session({ slotId: 'b' }),
      session({ slotId: 'c' }),
    ] as const;
    const decisions: Decisions = {
      [keyOf(a)]: { kind: 'cancelled', teacherId: 'ignored', roomId: 'ignored' },
      [keyOf(b)]: { kind: 'substitute', teacherId: 'm', roomId: 'ignored' },
      [keyOf(c)]: { kind: 'study', teacherId: 'o', roomId: 'r9' },
    };
    expect(toChoices([a, b, c], decisions)).toEqual([
      { slotId: 'a', date: '2026-12-01', kind: 'cancelled' },
      { slotId: 'b', date: '2026-12-01', kind: 'substitute', teacherId: 'm' },
      { slotId: 'c', date: '2026-12-01', kind: 'study', teacherId: 'o', roomId: 'r9' },
    ]);
    expect(countChoices([a, b, c], decisions)).toEqual({ cancelled: 1, substitute: 1, study: 1 });
  });
  it('turns the reasons typed for warnings into acknowledgements, ignoring short ones', () => {
    const warnings = [
      { code: 'room_capacity' as const, slotId: 's', date: null, message: 'm' },
      { code: 'hours_exceeded' as const, slotId: 's', date: null, message: 'm' },
    ];
    expect(
      acknowledgements(warnings, { room_capacity: '  Exception validée ', hours_exceeded: 'ok' }),
    ).toEqual([{ code: 'room_capacity', reason: 'Exception validée' }]);
  });
});

describe('groupByDay', () => {
  it('groups by day and orders by time', () => {
    const days = groupByDay([
      session({ slotId: 'late', date: '2026-12-02', startTime: '10:00' }),
      session({ slotId: 'b', date: '2026-12-01', startTime: '10:00' }),
      session({ slotId: 'a', date: '2026-12-01', startTime: '08:00' }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-12-01', '2026-12-02']);
    expect(days[0]?.sessions.map((s) => s.slotId)).toEqual(['a', 'b']);
  });
});

describe('periodProblem', () => {
  const ok = { teacherId: 't', from: '2026-12-01', to: '2026-12-03' };
  it('accepts a teacher and a period starting today or later', () => {
    expect(periodProblem(ok, '2026-12-01')).toBeNull();
  });
  it('names the field to fix', () => {
    expect(periodProblem({ ...ok, teacherId: '' }, '2026-12-01')?.field).toBe('teacherId');
    expect(periodProblem({ ...ok, from: '' }, '2026-12-01')?.field).toBe('from');
    expect(periodProblem(ok, '2026-12-02')?.field).toBe('from');
    expect(periodProblem({ ...ok, to: '' }, '2026-12-01')?.field).toBe('to');
    expect(periodProblem({ ...ok, to: '2026-11-30' }, '2026-11-01')?.field).toBe('to');
    expect(periodProblem({ ...ok, to: '2027-02-01' }, '2026-12-01')?.message).toContain('14 jours');
  });
});

describe('simultaneous lessons never share a teacher', () => {
  const a = session({ slotId: 'a', startTime: '08:00', endTime: '09:00' });
  const b = session({ slotId: 'b', startTime: '08:30', endTime: '09:30', classLabel: '1ère B' });
  const later = session({ slotId: 'c', startTime: '09:00', endTime: '10:00' });
  const cover = (teacherId: string) => ({ kind: 'substitute' as const, teacherId, roomId: '' });

  it('does not offer, for a lesson, the teacher another lesson at the same time already holds', () => {
    const decisions: Decisions = { [keyOf(a)]: cover('m') };
    expect(offeredFor(b, [a, b, later], decisions).map((t) => t.teacherId)).toEqual(['o']);
    expect(offeredFor(later, [a, b, later], decisions).map((t) => t.teacherId)).toEqual(['o', 'm']);
    expect(offeredFor(a, [a, b, later], decisions)).toHaveLength(2);
  });
  it('proposes the next teacher, or nobody, when picking « Remplacer » on the second lesson', () => {
    const offered = offeredFor(b, [a, b], { [keyOf(a)]: cover('m') });
    expect(choose(b, 'substitute', NO_DECISION, offered).teacherId).toBe('');
  });
  it('blocks the save when the same teacher is picked on both', () => {
    const decisions: Decisions = { [keyOf(a)]: cover('m'), [keyOf(b)]: cover('m') };
    const check = checkBeforeSave([a, b], decisions);
    expect(check.ready).toBe(false);
    expect(check.incomplete.map((i) => i.session.slotId)).toEqual(['b']);
  });
  it('after a refused save: replaces a teacher who is no longer free and says who stands there now', () => {
    const names = teacherNames([a]);
    const decisions: Decisions = { [keyOf(a)]: cover('m') };
    const fresh = session({ slotId: 'a', freeTeachers: [{ teacherId: 'o', name: 'Omar Autre', sameSubject: false }, { teacherId: 'n', name: 'Nour Nabil', sameSubject: true }] });
    names.set('n', 'Nour Nabil');
    const out = refreshDecisions([fresh], decisions, names);
    expect(out.decisions[keyOf(a)]).toEqual(cover('n'));
    expect(out.replaced).toHaveLength(1);
    expect(replacedText(out.replaced[0]!, 'le 1 déc.')).toBe('Mona Maths n’est plus libre pour Maths (1ère A) le 1 déc. : Nour Nabil est proposé à sa place.');
  });
  it('leaves nobody when no teacher of the subject remains, and drops lessons that vanished', () => {
    const fresh = session({ slotId: 'a', freeTeachers: [] });
    const out = refreshDecisions([fresh], { [keyOf(a)]: cover('m'), gone: cover('o') }, teacherNames([a]));
    expect(out.decisions).toEqual({ [keyOf(a)]: cover('') });
    expect(replacedText(out.replaced[0]!, 'le 1 déc.')).toContain('choisissez quelqu’un d’autre');
  });
});
