import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { DOMAIN, FRENCH_TEACHER, MATHS_TEACHER } from './helpers.js';

const day = (d: string) => new Date(`${d}T00:00:00Z`);

export interface RolloverFixture {
  readonly yearId: string;
  readonly label: string;
  readonly classes: Readonly<Record<string, string>>;
  /** Two students per class, by class key (`bac/premiere`). */
  readonly students: Readonly<Record<string, readonly { id: string; userId: string }[]>>;
  readonly teacherIds: { readonly maths: string; readonly french: string };
  readonly roomIds: readonly string[];
}

/**
 * A small school year of its own to roll over (the specs share one database, so the demo year stays untouched):
 * a Bac français chain seconde → première → terminale and a Bac nationale chain 1re → 2e secondaire (terminal),
 * their subjects with coefficients, teachers, periods, a holiday on a leap day, and three weekly sessions.
 * `suffix` makes the e-mails of its students unique.
 */
export async function createRolloverSource(
  prisma: PrismaService,
  suffix: string,
  options: { label?: string; startsOn?: string; endsOn?: string; isCurrent?: boolean } = {},
): Promise<RolloverFixture> {
  const label = options.label ?? '2039-2040';
  const startsOn = options.startsOn ?? '2039-09-01';
  const endsOn = options.endsOn ?? '2040-06-30';
  const bac = await prisma.section.findUniqueOrThrow({ where: { code: 'bac' } });
  const nationale = await prisma.section.findUniqueOrThrow({ where: { code: 'nationale' } });
  const maths = await prisma.teacher.findFirstOrThrow({ where: { user: { email: MATHS_TEACHER } } });
  const french = await prisma.teacher.findFirstOrThrow({ where: { user: { email: FRENCH_TEACHER } } });
  const rooms = await prisma.room.findMany({ where: { active: true }, orderBy: { name: 'asc' }, take: 3 });
  const cours = await prisma.activityType.findUniqueOrThrow({ where: { code: 'cours' } });

  const year = await prisma.schoolYear.create({
    data: {
      label,
      startsOn: day(startsOn),
      endsOn: day(endsOn),
      isCurrent: options.isCurrent ?? false,
    },
  });
  const make = async (sectionId: string, code: string, classLabel: string) =>
    prisma.schoolClass.create({
      data: { schoolYearId: year.id, sectionId, code, label: classLabel },
    });
  const seconde = await make(bac.id, 'seconde', 'Seconde');
  const premiere = await make(bac.id, 'premiere', 'Première');
  const terminale = await make(bac.id, 'terminale', 'Terminale');
  const sec1 = await make(nationale.id, 'secondaire-1', '1re secondaire');
  const sec2 = await make(nationale.id, 'secondaire-2', '2e secondaire');
  const link = (id: string, nextClassId: string) =>
    prisma.schoolClass.update({ where: { id }, data: { nextClassId } });
  await link(seconde.id, premiere.id);
  await link(premiere.id, terminale.id);
  await link(sec1.id, sec2.id);

  const all = { 'bac/seconde': seconde, 'bac/premiere': premiere, 'bac/terminale': terminale, 'nationale/secondaire-1': sec1, 'nationale/secondaire-2': sec2 };
  const classSubjectIds = new Map<string, string>();
  for (const [key, c] of Object.entries(all)) {
    const m = await prisma.classSubject.create({
      data: {
        classId: c.id,
        subjectId: 'mathematiques',
        coefficient: 4,
        hoursPerWeek: 4,
        assignments: { create: { teacherId: maths.id } },
      },
    });
    classSubjectIds.set(`${key}|maths`, m.id);
    if (key.startsWith('bac/')) {
      const f = await prisma.classSubject.create({
        data: {
          classId: c.id,
          subjectId: 'francais',
          coefficient: 3,
          assignments: { create: { teacherId: french.id } },
        },
      });
      classSubjectIds.set(`${key}|francais`, f.id);
    }
  }

  const y0 = Number(startsOn.slice(0, 4));
  const y1 = y0 + 1;
  const leap = (y1 % 4 === 0 && y1 % 100 !== 0) || y1 % 400 === 0;
  for (const [number, from, to] of [
    [1, `${y0}-09-01`, `${y0}-12-15`],
    [2, `${y0}-12-16`, `${y1}-03-31`],
    [3, `${y1}-04-01`, `${y1}-06-30`],
  ] as const)
    await prisma.period.create({
      data: {
        schoolYearId: year.id,
        number,
        label: `Trimestre ${number}`,
        startsOn: day(from),
        endsOn: day(to),
      },
    });
  await prisma.calendarDay.create({
    data: { schoolYearId: year.id, type: 'holiday', label: 'Jour bissextile', startsOn: day(`${y1}-02-${leap ? 29 : 28}`), endsOn: day(`${y1}-02-${leap ? 29 : 28}`) },
  });
  await prisma.calendarDay.create({
    data: {
      schoolYearId: year.id,
      type: 'exam_week',
      label: 'Examens du Bac français',
      startsOn: day(`${y1}-05-10`),
      endsOn: day(`${y1}-05-16`),
      sectionId: bac.id,
    },
  });

  const slot = (key: string, subject: 'maths' | 'francais', teacherId: string, weekday: number, from: string, to: string, roomId: string) =>
    prisma.timetableSlot.create({
      data: {
        id: randomUUID(),
        classSubjectId: classSubjectIds.get(`${key}|${subject}`)!,
        teacherId,
        roomId,
        activityTypeId: cours.id,
        weekday,
        startTime: from,
        endTime: to,
        validFrom: day(startsOn),
        validTo: day(endsOn),
      },
    });
  await slot('bac/premiere', 'maths', maths.id, 1, '08:00', '09:00', rooms[0]!.id);
  await slot('bac/seconde', 'maths', maths.id, 1, '09:00', '10:00', rooms[1]!.id);
  await slot('bac/premiere', 'francais', french.id, 2, '08:00', '09:00', rooms[0]!.id);

  const students: Record<string, { id: string; userId: string }[]> = {};
  let n = 0;
  for (const [key, c] of Object.entries(all)) {
    students[key] = [];
    const sectionId = key.startsWith('bac/') ? bac.id : nationale.id;
    for (let i = 0; i < 2; i++) {
      n++;
      const user = await prisma.user.create({
        data: {
          email: `roll${suffix}.eleve${n}@${DOMAIN}`,
          passwordHash: 'not-a-real-hash',
          role: 'student',
          firstName: `Roll${suffix}${n}`,
          lastName: `Eleve${n}`,
          mustChangePassword: false,
          student: {
            create: {
              sectionId,
              studentNumber: `ROLL-${suffix}-${n}`,
              enrollments: { create: { classId: c.id, schoolYearId: year.id, enrolledOn: day(startsOn) } },
            },
          },
        },
        include: { student: true },
      });
      students[key]!.push({ id: user.student!.id, userId: user.id });
    }
  }
  return {
    yearId: year.id,
    label,
    classes: Object.fromEntries(Object.entries(all).map(([k, c]) => [k, c.id])),
    students,
    teacherIds: { maths: maths.id, french: french.id },
    roomIds: rooms.map((r) => r.id),
  };
}
