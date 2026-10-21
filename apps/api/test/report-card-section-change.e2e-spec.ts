import type { ReportCardDto, StudentGradesDto } from '@cdls/shared';
import { ADMIN, bearer, createTestApp, type TestApp } from './helpers.js';
import { createRolloverSource, type RolloverFixture } from './rollover-fixture.js';

const day = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * A student who changes section in the middle of a period keeps the grades of the old class, and the report card
 * of the period counts them, with the coefficient of the class each grade belongs to. Everyone else is unchanged.
 */
describe('Report card of a student who changed section mid-period (e2e)', () => {
  let t: TestApp;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await t.token(ADMIN);
  });

  afterAll(() => t.close());

  async function scenario(suffix: string, label: string, bySection: boolean) {
    const year = label.slice(0, 4);
    const f: RolloverFixture = await createRolloverSource(t.prisma, suffix, {
      label,
      startsOn: `${year}-09-01`,
      endsOn: `${Number(year) + 1}-06-30`,
    });
    const bac = await t.prisma.section.findUniqueOrThrow({ where: { code: 'bac' } });
    const nat = await t.prisma.section.findUniqueOrThrow({ where: { code: 'nationale' } });
    if (bySection) {
      // Each section has its own first period (the same dates): the old class's events point at the old one.
      await t.prisma.period.deleteMany({ where: { schoolYearId: f.yearId } });
      for (const s of [bac, nat])
        await t.prisma.period.create({
          data: { schoolYearId: f.yearId, sectionId: s.id, number: 1, label: 'T1', startsOn: day(`${year}-09-01`), endsOn: day(`${year}-12-15`) },
        });
    }
    const periodFor = (sectionId: string) =>
      t.prisma.period.findFirstOrThrow({
        where: { schoolYearId: f.yearId, number: 1, OR: [{ sectionId }, { sectionId: null }] },
      });
    const bacPeriod = await periodFor(bac.id);
    const natPeriod = await periodFor(nat.id);

    // The nationale class weighs mathematics 6, the Bac class 4.
    await t.prisma.classSubject.updateMany({
      where: { classId: f.classes['nationale/secondaire-1']!, subjectId: 'mathematiques' },
      data: { coefficient: 6 },
    });
    const [moving, stays] = f.students['bac/seconde']!;
    const natMate = f.students['nationale/secondaire-1']![0]!;
    const type = await t.prisma.activityType.findUniqueOrThrow({ where: { code: 'controle' } });
    const event = (classId: string, subjectId: string, date: string, periodId: string, title: string) =>
      t.prisma.event.create({
        data: { activityTypeId: type.id, title, subjectId, classId, date: day(date), periodId, authorId: f.teacherIds.maths },
      });
    const grade = (eventId: string, studentId: string, score: number) =>
      t.prisma.grade.create({ data: { eventId, studentId, score, outOf: 20, published: true, gradedById: f.teacherIds.maths } });

    const bacMaths = await event(f.classes['bac/seconde']!, 'mathematiques', `${year}-09-20`, bacPeriod.id, 'Maths Bac');
    const bacFrench = await event(f.classes['bac/seconde']!, 'francais', `${year}-09-25`, bacPeriod.id, 'Français Bac');
    await grade(bacMaths.id, moving!.id, 10);
    await grade(bacFrench.id, moving!.id, 16);
    await grade(bacMaths.id, stays!.id, 12);
    // The student moves to the Bac nationale on 15 October, inside the first period.
    await t.prisma.enrollment.updateMany({
      where: { studentId: moving!.id, classId: f.classes['bac/seconde']! },
      data: { leftOn: day(`${year}-10-15`) },
    });
    await t.prisma.enrollment.create({
      data: { studentId: moving!.id, classId: f.classes['nationale/secondaire-1']!, schoolYearId: f.yearId, enrolledOn: day(`${year}-10-15`) },
    });
    await t.prisma.student.update({ where: { id: moving!.id }, data: { sectionId: nat.id } });
    const natMaths = await event(f.classes['nationale/secondaire-1']!, 'mathematiques', `${year}-11-05`, natPeriod.id, 'Maths nationale');
    await grade(natMaths.id, moving!.id, 14);
    await grade(natMaths.id, natMate.id, 8);

    // The period closes and the report cards are generated, for every class of the section.
    for (const p of bySection ? [bacPeriod, natPeriod] : [natPeriod])
      await t.http().post(`/api/periods/${p.id}/close`).set(bearer(admin)).send({ closed: true }).expect(200);
    const cards = async (period: { id: string }, classId: string) => {
      await t.http().post(`/api/periods/${period.id}/report-cards/generate`).set(bearer(admin)).send({ classId }).expect(200);
      return (await t.http().get(`/api/periods/${period.id}/report-cards?classId=${classId}`).set(bearer(admin)).expect(200)).body as ReportCardDto[];
    };
    return { f, natPeriod, bacPeriod, moving: moving!, stays: stays!, natMate, cards };
  }

  for (const bySection of [false, true]) {
    describe(bySection ? 'with one period per section' : 'with a period for every section', () => {
      it('counts the grades of both classes with the coefficient of the class each belongs to', async () => {
        const s = await scenario(bySection ? 'rc2' : 'rc1', bySection ? '2073-2074' : '2071-2072', bySection);
        const natCards = await s.cards(s.natPeriod, s.f.classes['nationale/secondaire-1']!);
        const mine = natCards.find((c) => c.studentId === s.moving.id)!;
        expect(mine.classId).toBe(s.f.classes['nationale/secondaire-1']);
        const subject = (id: string) => mine.subjects.find((x) => x.subjectId === id)!;
        // Mathematics: 10 (Bac, coefficient 4) and 14 (nationale, coefficient 6): average 12, weight (4 + 6) / 2.
        expect(subject('mathematiques')).toMatchObject({ average: 12, gradeCount: 2, coefficient: 5 });
        // The French grade comes from the Bac class, where the student had it.
        expect(subject('francais')).toMatchObject({ average: 16, gradeCount: 1, coefficient: 3 });
        // (12 × 5 + 16 × 3) / 8
        expect(mine.average).toBe(13.5);
        // The classmate who never moved: unchanged (a single grade of 8).
        const mate = natCards.find((c) => c.studentId === s.natMate.id)!;
        expect(mate.average).toBe(8);
        expect(mate.subjects.map((x) => x.subjectId)).toEqual(['mathematiques']);
        expect(mate.subjects[0]!.coefficient).toBe(6);
        // Ranked among the class: 13.5 first, 8 second.
        expect([mine.rank, mate.rank]).toEqual([1, 2]);
      });

      it('leaves the students who stayed in the old class exactly as they were', async () => {
        const label = bySection ? '2073-2074' : '2071-2072';
        const year = await t.prisma.schoolYear.findUniqueOrThrow({ where: { label } });
        const bacClass = await t.prisma.schoolClass.findFirstOrThrow({ where: { schoolYearId: year.id, code: 'seconde' } });
        const natPeriod = await t.prisma.period.findFirstOrThrow({ where: { schoolYearId: year.id, number: 1, section: { code: 'nationale' } } }).catch(() =>
          t.prisma.period.findFirstOrThrow({ where: { schoolYearId: year.id, number: 1, sectionId: null } }),
        );
        const bacPeriod = bySection
          ? await t.prisma.period.findFirstOrThrow({ where: { schoolYearId: year.id, number: 1, section: { code: 'bac' } } })
          : natPeriod;
        await t.http().post(`/api/periods/${bacPeriod.id}/report-cards/generate`).set(bearer(admin)).send({ classId: bacClass.id }).expect(200);
        const cards = (await t.http().get(`/api/periods/${bacPeriod.id}/report-cards?classId=${bacClass.id}`).set(bearer(admin)).expect(200)).body as ReportCardDto[];
        // The student who moved belongs to the class they ended in, not to this one.
        const moved = await t.prisma.enrollment.findFirstOrThrow({ where: { classId: bacClass.id, leftOn: { not: null } } });
        expect(cards.some((c) => c.studentId === moved.studentId)).toBe(false);
        // The other student of the class: mathematics 12 only, coefficient 4.
        const stays = cards.find((c) => c.studentId !== moved.studentId && c.average === 12)!;
        expect(stays).toBeTruthy();
        expect(stays.subjects.find((x) => x.subjectId === 'mathematiques')).toMatchObject({ average: 12, coefficient: 4 });
      });

      it('shows the same blend in the grades of the student for that period', async () => {
        const label = bySection ? '2073-2074' : '2071-2072';
        const year = await t.prisma.schoolYear.findUniqueOrThrow({ where: { label } });
        const natClass = await t.prisma.schoolClass.findFirstOrThrow({ where: { schoolYearId: year.id, code: 'secondaire-1' } });
        const natPeriod = await t.prisma.period.findFirstOrThrow({
          where: { schoolYearId: year.id, number: 1, OR: [{ section: { code: 'nationale' } }, { sectionId: null }] },
        });
        const movingId = (await t.prisma.enrollment.findFirstOrThrow({ where: { classId: natClass.id, enrolledOn: day(`${label.slice(0, 4)}-10-15`) } })).studentId;
        const res = await t.http().get(`/api/students/${movingId}/grades?periodId=${natPeriod.id}`).set(bearer(admin)).expect(200);
        const grades = res.body as StudentGradesDto;
        const maths = grades.subjects.find((x) => x.subjectId === 'mathematiques')!;
        expect(maths.grades).toHaveLength(2);
        expect(maths).toMatchObject({ average: 12, coefficient: 5 });
        expect(grades.subjects.find((x) => x.subjectId === 'francais')).toMatchObject({ average: 16, coefficient: 3 });
      });
    });
  }
});
