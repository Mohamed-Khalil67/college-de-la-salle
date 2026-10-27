/**
 * Demo groups: the Première (Bac français) science class is split into two TP halves, with the lab session
 * cut into two one-hour sessions (one per half) and a homework addressed to the first half only; the
 * Seconde (Bac français) has its LV2 groups (Allemand, Espagnol).
 */
import type { SectionId } from '@cdls/shared';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { OccupancyService } from '../src/occupancy/occupancy.service.js';

/** The end of the first hour of each two-hour block the demo timetable uses. */
const MIDDLE: Readonly<Record<string, string>> = {
  '08:00': '09:00',
  '10:15': '11:15',
  '12:45': '13:45',
  '13:45': '14:45',
};

export async function seedGroups(
  prisma: PrismaClient,
  options: {
    rosters: readonly { classId: string; students: string[]; section: SectionId; code: string }[];
    typeId: (code: string) => string;
    teacherId: string;
  },
): Promise<{ groups: number }> {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const join = (
    group: { id: string; classId: string; division: string },
    studentIds: readonly string[],
  ) =>
    prisma.groupMember.createMany({
      data: studentIds.map((studentId) => ({
        groupId: group.id,
        studentId,
        classId: group.classId,
        division: group.division,
        joinedOn: today,
      })),
    });
  let groups = 0;

  const science = options.rosters.find((r) => r.section === 'bac' && r.code === 'premiere');
  if (science) {
    const half = Math.ceil(science.students.length / 2);
    const [a, b] = await Promise.all(
      ['TP A', 'TP B'].map((label) =>
        prisma.group.create({ data: { classId: science.classId, division: 'TP', label } }),
      ),
    );
    groups += 2;
    await join(a!, science.students.slice(0, half));
    await join(b!, science.students.slice(half));

    // The lab session becomes two one-hour sessions, one for each half, one after the other.
    const tp = await prisma.timetableSlot.findFirst({
      where: {
        classSubject: { classId: science.classId, subjectId: 'physique-chimie' },
        activityTypeId: options.typeId('tp'),
      },
    });
    const middle = tp ? MIDDLE[tp.startTime] : undefined;
    if (tp && middle) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = tp;
      await prisma.timetableSlot.update({
        where: { id: tp.id },
        data: { endTime: middle, groupId: a!.id, division: 'TP' },
      });
      const second = await prisma.timetableSlot.create({
        data: { ...copy, startTime: middle, groupId: b!.id, division: 'TP' },
      });
      const occupancy = new OccupancyService();
      await occupancy.reindexSlots(prisma, [tp.id, second.id]);
    }

    // A homework for the first half only.
    const homework = await prisma.event.create({
      data: {
        activityTypeId: options.typeId('devoir'),
        title: 'Compte rendu du TP de chimie',
        subjectId: 'physique-chimie',
        classId: science.classId,
        date: new Date('2026-11-09T00:00:00Z'),
        description: 'Pour le groupe TP A : à rendre au prochain TP.',
        authorId: options.teacherId,
      },
    });
    await prisma.assessmentTarget.create({
      data: { eventId: homework.id, scope: 'group', groupId: a!.id },
    });
  }

  const seconde = options.rosters.find((r) => r.section === 'bac' && r.code === 'seconde');
  if (seconde) {
    const half = Math.ceil(seconde.students.length / 2);
    const [de, es] = await Promise.all(
      ['Allemand', 'Espagnol'].map((label) =>
        prisma.group.create({ data: { classId: seconde.classId, division: 'LV2', label } }),
      ),
    );
    groups += 2;
    await join(de!, seconde.students.slice(0, half));
    await join(es!, seconde.students.slice(half));
  }
  return { groups };
}
