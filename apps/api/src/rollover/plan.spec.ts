import {
  buildPlan,
  classKey,
  PlanError,
  planHash,
  type RolloverOptions,
  type RolloverSnapshot,
  type SnapshotClass,
  type SnapshotSlot,
  stableStringify,
} from './plan.js';

const cls = (
  sectionCode: 'bac' | 'nationale',
  code: string,
  next: string | null,
): SnapshotClass => ({
  id: `id-${sectionCode}-${code}`,
  sectionCode,
  code,
  label: code,
  nextKey: next ? classKey(sectionCode, next) : null,
});

const slot = (over: Partial<SnapshotSlot> = {}): SnapshotSlot => ({
  id: 's1',
  classKey: 'bac/premiere',
  subjectId: 'maths',
  subjectName: 'Mathématiques',
  teacherId: 't1',
  roomId: 'r1',
  roomActive: true,
  activityTypeId: 'a1',
  activityUsable: true,
  weekday: 1,
  startTime: '08:00',
  endTime: '09:00',
  weekParity: null,
  division: null,
  validTo: '2027-06-17',
  ...over,
});

function snapshot(over: Partial<RolloverSnapshot> = {}): RolloverSnapshot {
  return {
    source: { id: 'y1', label: '2026-2027', startsOn: '2026-09-06', endsOn: '2027-06-17', isCurrent: true, archived: false },
    target: null,
    classes: [cls('bac', 'seconde', 'premiere'), cls('bac', 'premiere', 'terminale'), cls('bac', 'terminale', null)],
    targetClassKeys: [],
    periods: [
      { kind: 'trimester', sectionCode: null, number: 1, label: 'T1', startsOn: '2026-09-06', endsOn: '2026-12-17' },
      { kind: 'trimester', sectionCode: null, number: 3, label: 'T3', startsOn: '2027-04-04', endsOn: '2027-06-17' },
    ],
    targetPeriods: [],
    calendarDays: [
      { type: 'holiday', label: 'Vacances d’hiver', startsOn: '2026-12-20', endsOn: '2027-01-02', sectionCode: null, classKeys: [] },
      { type: 'exam_week', label: 'Examens', startsOn: '2027-03-01', endsOn: '2027-03-05', sectionCode: 'bac', classKeys: ['bac/premiere'] },
    ],
    targetCalendarDays: [],
    classSubjects: [
      { classKey: 'bac/premiere', subjectId: 'maths', subjectName: 'Mathématiques', subjectArchived: false, coefficient: 4, hoursPerWeek: 4 },
      { classKey: 'bac/premiere', subjectId: 'latin', subjectName: 'Latin', subjectArchived: true, coefficient: 1, hoursPerWeek: null },
    ],
    targetClassSubjectKeys: [],
    assignments: [
      { classKey: 'bac/premiere', subjectId: 'maths', teacherId: 't1', teacherName: 'Hany Mansour', teacherActive: true },
      { classKey: 'bac/premiere', subjectId: 'maths', teacherId: 't2', teacherName: 'Départ Parti', teacherActive: false },
    ],
    targetAssignmentKeys: [],
    slots: [slot()],
    targetSlotKeys: [],
    students: [
      { studentId: 'a', firstName: 'Amal', lastName: 'Zaki', studentNumber: null, sectionCode: 'bac', classKey: 'bac/seconde', alreadyIn: null },
      { studentId: 'b', firstName: 'Bassem', lastName: 'Adel', studentNumber: null, sectionCode: 'bac', classKey: 'bac/premiere', alreadyIn: null },
      { studentId: 'c', firstName: 'Carine', lastName: 'Morcos', studentNumber: null, sectionCode: 'bac', classKey: 'bac/terminale', alreadyIn: null },
    ],
    ...over,
  };
}

const options: RolloverOptions = { copyAssignments: true, copyTimetable: true };

describe('buildPlan', () => {
  it('names and dates the new year one year on by default', () => {
    expect(buildPlan(snapshot(), options).year).toEqual({
      label: '2027-2028',
      startsOn: '2027-09-06',
      endsOn: '2028-06-17',
      exists: false,
    });
  });

  it('shifts the periods and the calendar days by a year, keeps the sections and classes', () => {
    const plan = buildPlan(snapshot(), options);
    expect(plan.periods.map((p) => [p.number, p.startsOn, p.endsOn])).toEqual([
      [1, '2027-09-06', '2027-12-17'],
      [3, '2028-04-04', '2028-06-17'],
    ]);
    expect(plan.calendarDays.map((d) => [d.label, d.startsOn, d.endsOn, d.sectionCode, d.classKeys])).toEqual([
      ['Vacances d’hiver', '2027-12-20', '2028-01-02', null, []],
      ['Examens', '2028-03-01', '2028-03-05', 'bac', ['bac/premiere']],
    ]);
  });

  it('moves a leap day to 28 February, and 28 February stays', () => {
    const plan = buildPlan(
      snapshot({
        source: { id: 'y1', label: '2027-2028', startsOn: '2027-09-06', endsOn: '2028-06-17', isCurrent: true, archived: false },
        calendarDays: [
          { type: 'event_day', label: 'Bissextile', startsOn: '2028-02-29', endsOn: '2028-02-29', sectionCode: null, classKeys: [] },
          { type: 'event_day', label: 'Février', startsOn: '2028-02-28', endsOn: '2028-02-28', sectionCode: null, classKeys: [] },
        ],
      }),
      options,
    );
    expect(plan.calendarDays.map((d) => d.startsOn)).toEqual(['2029-02-28', '2029-02-28']);
    const into = buildPlan(
      snapshot({
        source: { id: 'y1', label: '2023-2024', startsOn: '2023-09-06', endsOn: '2024-06-17', isCurrent: true, archived: false },
        calendarDays: [{ type: 'event_day', label: 'Février', startsOn: '2023-02-28', endsOn: '2024-02-29', sectionCode: null, classKeys: [] }],
      }),
      options,
    );
    // 2024-02-29 + 1 year is 2025-02-28; a 2023-02-28 start moves to 2024-02-28.
    expect(into.calendarDays[0]).toMatchObject({ startsOn: '2024-09-06', endsOn: '2025-02-28' });
  });

  it('flags the holidays for a check, not the other days', () => {
    const issues = buildPlan(snapshot(), options).issues.filter((i) => i.step === 'calendar_days');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Vacances d’hiver');
  });

  it('cuts a period that spills out of an edited year and drops one that falls outside it', () => {
    const plan = buildPlan(snapshot(), { ...options, startsOn: '2027-09-20', endsOn: '2028-06-01' });
    expect(plan.periods[0]!.startsOn).toBe('2027-09-20');
    expect(plan.periods[1]!.endsOn).toBe('2028-06-01');
    expect(plan.issues.filter((i) => i.step === 'periods')).toHaveLength(2);
    const outside = buildPlan(snapshot(), { ...options, startsOn: '2027-12-18', endsOn: '2028-03-30' });
    expect(outside.periods).toHaveLength(0);
  });

  it('copies the classes with their next-class links, terminal classes have none', () => {
    const plan = buildPlan(snapshot(), options);
    expect(plan.classes.map((c) => [c.key, c.nextKey])).toEqual([
      ['bac/premiere', 'bac/terminale'],
      ['bac/seconde', 'bac/premiere'],
      ['bac/terminale', null],
    ]);
    expect(plan.issues.some((i) => i.step === 'classes' && i.message.includes('terminale'))).toBe(true);
  });

  it('copies the class subjects with their coefficients and leaves out an archived subject', () => {
    const plan = buildPlan(snapshot(), options);
    expect(plan.classSubjects).toEqual([
      { classKey: 'bac/premiere', subjectId: 'maths', coefficient: 4, hoursPerWeek: 4, exists: false },
    ]);
    expect(plan.skipped.classSubjects).toBe(1);
  });

  it('copies the teaching assignments only when asked, and not those of a teacher without an active account', () => {
    expect(buildPlan(snapshot(), options).assignments).toEqual([
      { classKey: 'bac/premiere', subjectId: 'maths', teacherId: 't1', exists: false },
    ]);
    expect(buildPlan(snapshot(), options).skipped.assignments).toBe(1);
    expect(buildPlan(snapshot(), { copyAssignments: false, copyTimetable: false }).assignments).toEqual([]);
  });

  it('copies the timetable only when asked, and it needs the assignments', () => {
    expect(buildPlan(snapshot(), options).slots).toHaveLength(1);
    expect(buildPlan(snapshot(), { copyAssignments: true, copyTimetable: false }).slots).toEqual([]);
    expect(() => buildPlan(snapshot(), { copyAssignments: false, copyTimetable: true })).toThrow(PlanError);
  });

  it('leaves out a slot that ended earlier, or whose room or activity is gone, and says so', () => {
    const plan = buildPlan(
      snapshot({
        slots: [
          slot({ id: 'ended', validTo: '2027-01-31' }),
          slot({ id: 'room', roomActive: false }),
          slot({ id: 'type', activityUsable: false }),
          slot({ id: 'teacher', teacherId: 't9' }),
          slot({ id: 'ok', weekday: 2 }),
        ],
      }),
      options,
    );
    expect(plan.slots.map((s) => s.sourceSlotId)).toEqual(['ok']);
    expect(plan.skipped.slots).toBe(3);
    expect(plan.issues.filter((i) => i.step === 'timetable')).toHaveLength(3);
  });

  it('knows what a re-run already has', () => {
    const plan = buildPlan(
      snapshot({
        target: { id: 'y2', label: '2027-2028', startsOn: '2027-09-06', endsOn: '2028-06-17', isCurrent: false, archived: false },
        targetClassKeys: ['bac/seconde', 'bac/premiere', 'bac/terminale'],
        targetPeriods: [{ kind: 'trimester', sectionCode: null, number: 1, label: 'T1', startsOn: '2027-09-06', endsOn: '2027-12-17' }],
        targetClassSubjectKeys: ['bac/premiere|maths'],
        targetAssignmentKeys: ['bac/premiere|maths|t1'],
        targetSlotKeys: ['bac/premiere|maths|t1|1|08:00|09:00||'],
        students: [
          { studentId: 'a', firstName: 'Amal', lastName: 'Zaki', studentNumber: null, sectionCode: 'bac', classKey: 'bac/seconde', alreadyIn: 'bac/premiere' },
        ],
      }),
      options,
    );
    expect(plan.year.exists).toBe(true);
    expect(plan.classes.every((c) => c.exists)).toBe(true);
    expect(plan.periods.map((p) => p.exists)).toEqual([true, false]);
    expect(plan.classSubjects[0]!.exists).toBe(true);
    expect(plan.assignments[0]!.exists).toBe(true);
    expect(plan.slots[0]!.exists).toBe(true);
    expect(plan.students[0]!.skipped).toBe('already_enrolled');
  });

  it('keeps the dates of a year that already exists', () => {
    const plan = buildPlan(
      snapshot({ target: { id: 'y2', label: '2027-2028', startsOn: '2027-09-10', endsOn: '2028-06-10', isCurrent: false, archived: false } }),
      { ...options, startsOn: '2027-09-01' },
    );
    expect(plan.year).toMatchObject({ startsOn: '2027-09-10', endsOn: '2028-06-10', exists: true });
  });

  it('archives the source and makes the new year current only when the source was', () => {
    expect(buildPlan(snapshot(), options)).toMatchObject({ archiveSource: true, makeCurrent: true });
    const old = snapshot().source;
    expect(buildPlan(snapshot({ source: { ...old, isCurrent: false } }), options).makeCurrent).toBe(false);
  });

  it('refuses a plan without classes, with a bad name or with dates that do not follow the source', () => {
    expect(() => buildPlan(snapshot({ classes: [] }), options)).toThrow(/aucune classe/);
    expect(() => buildPlan(snapshot(), { ...options, label: '2026-2027' })).toThrow(/autre nom/);
    expect(() => buildPlan(snapshot(), { ...options, startsOn: '2027-09-06', endsOn: '2027-09-01' })).toThrow(PlanError);
    expect(() => buildPlan(snapshot(), { ...options, startsOn: '2026-01-01' })).toThrow(/commencer après/);
    expect(() => buildPlan(snapshot({ source: { ...snapshot().source, label: 'ancienne' } }), options)).toThrow(/nom de la nouvelle année/);
  });

  describe('students', () => {
    const actions = (o: RolloverOptions = options) =>
      Object.fromEntries(buildPlan(snapshot(), o).students.map((s) => [s.studentId, [s.action, s.targetKey]]));

    it('promotes through the next class and graduates the terminal class', () => {
      expect(actions()).toEqual({
        a: ['promote', 'bac/premiere'],
        b: ['promote', 'bac/terminale'],
        c: ['graduate', null],
      });
    });

    it('applies the overrides: redoublement stays in the same level, départ has no class', () => {
      expect(
        actions({
          ...options,
          overrides: [
            { studentId: 'a', action: 'repeat' },
            { studentId: 'b', action: 'leave' },
            { studentId: 'c', action: 'repeat' },
          ],
        }),
      ).toEqual({ a: ['repeat', 'bac/seconde'], b: ['leave', null], c: ['repeat', 'bac/terminale'] });
    });

    it('promotes a student asking for another section in their own section', () => {
      expect(actions({ ...options, overrides: [{ studentId: 'a', action: 'section_change' }] })['a']).toEqual([
        'section_change',
        'bac/premiere',
      ]);
    });

    it('keeps the default the plan proposed next to the choice', () => {
      const s = buildPlan(snapshot(), { ...options, overrides: [{ studentId: 'c', action: 'leave' }] }).students.find((x) => x.studentId === 'c')!;
      expect([s.defaultAction, s.action]).toEqual(['graduate', 'leave']);
    });

    it('refuses an impossible choice', () => {
      const bad = (studentId: string, action: 'graduate' | 'promote') => () =>
        buildPlan(snapshot(), { ...options, overrides: [{ studentId, action }] });
      expect(bad('a', 'graduate')).toThrow(/classe terminale/);
      expect(bad('c', 'promote')).toThrow(/terminale/);
      expect(() => buildPlan(snapshot(), { ...options, overrides: [{ studentId: 'zz', action: 'repeat' }] })).toThrow(/n’est pas dans l’année source/);
      expect(() =>
        buildPlan(snapshot(), {
          ...options,
          overrides: [
            { studentId: 'a', action: 'repeat' },
            { studentId: 'a', action: 'leave' },
          ],
        }),
      ).toThrow(/deux fois/);
    });

    it('lists the students by name, whatever the order they were read in', () => {
      expect(buildPlan(snapshot(), options).students.map((s) => s.studentId)).toEqual(['b', 'c', 'a']);
    });
  });
});

describe('plan hash', () => {
  it('is stable for the same plan and does not depend on key order', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
    const plan = buildPlan(snapshot(), options);
    expect(planHash(plan, { x: 1 })).toBe(planHash(buildPlan(snapshot(), options), { x: 1 }));
    expect(planHash(plan, { x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with the plan, the overrides or what running it reported', () => {
    const plan = buildPlan(snapshot(), options);
    const base = planHash(plan, { issues: [] });
    expect(planHash(buildPlan(snapshot(), { ...options, copyTimetable: false }), { issues: [] })).not.toBe(base);
    expect(planHash(buildPlan(snapshot(), { ...options, overrides: [{ studentId: 'a', action: 'repeat' }] }), { issues: [] })).not.toBe(base);
    expect(planHash(plan, { issues: ['conflit'] })).not.toBe(base);
    // Anything the plan reads: a new student in the source year.
    const more = snapshot({
      students: [
        ...snapshot().students,
        { studentId: 'd', firstName: 'D', lastName: 'D', studentNumber: null, sectionCode: 'bac', classKey: 'bac/seconde', alreadyIn: null },
      ],
    });
    expect(planHash(buildPlan(more, options), { issues: [] })).not.toBe(base);
  });
});
