/**
 * The demo timetable: a believable week (Sunday to Thursday) for every class, built by a greedy
 * scheduler that never double-books a class, a teacher or a room, plus a few one-off exceptions.
 * The occupancy index is written with the same service as the API, so the database's exclusion
 * constraints would refuse a clash: the seed can't produce one.
 */
import { randomUUID } from 'node:crypto';
import { addDays, weekday, type SectionId, type WeekParity } from '@cdls/shared';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { OccupancyService } from '../src/occupancy/occupancy.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

export interface TimetableClassSubject {
  readonly classId: string;
  readonly section: SectionId;
  readonly subjectId: string;
  readonly classSubjectId: string;
  readonly teacherId: string;
}

type RoomRole = 'home' | 'lab' | 'info' | 'gym';

interface Spec {
  /** Periods of one hour (1 or 2, back to back). */
  readonly size: 1 | 2;
  readonly type?: 'tp';
  readonly room?: RoomRole;
  readonly parity?: WeekParity;
}

const PLAN: Readonly<Record<string, (section: SectionId) => readonly Spec[]>> = {
  mathematiques: () => [{ size: 2 }, { size: 2 }],
  francais: () => [{ size: 2 }, { size: 1 }],
  arabe: (s) => (s === 'nationale' ? [{ size: 2 }, { size: 1 }] : [{ size: 2 }]),
  anglais: () => [{ size: 1 }, { size: 1 }],
  espagnol: () => [{ size: 1 }],
  'physique-chimie': () => [{ size: 1 }, { size: 2, type: 'tp', room: 'lab' }],
  svt: () => [{ size: 1 }, { size: 1, type: 'tp', room: 'lab' }],
  informatique: () => [{ size: 1, type: 'tp', room: 'info' }],
  ses: () => [{ size: 1 }],
  'histoire-geographie': () => [{ size: 1 }, { size: 1 }],
  philosophie: () => [{ size: 1 }],
  'education-civique': () => [{ size: 1, parity: 'B' }],
  'education-religieuse': () => [{ size: 1 }],
  eps: () => [{ size: 2, room: 'gym' }],
  arts: () => [{ size: 2, parity: 'A' }],
};

/** Hours a week of a subject in the plan (a fortnightly block counts half). */
export function hoursPerWeek(subjectId: string, section: SectionId): number {
  return (PLAN[subjectId]?.(section) ?? []).reduce(
    (sum, s) => sum + (s.parity ? s.size / 2 : s.size),
    0,
  );
}

const PERIODS = [
  ['08:00', '09:00'],
  ['09:00', '10:00'],
  ['10:15', '11:15'],
  ['11:15', '12:15'],
  ['12:45', '13:45'],
  ['13:45', '14:45'],
  ['14:45', '15:45'],
] as const;
const DAYS = [0, 1, 2, 3, 4];

interface Block {
  readonly entry: TimetableClassSubject;
  readonly spec: Spec;
  readonly order: number;
}

export async function seedTimetable(
  prisma: PrismaClient,
  options: {
    entries: readonly TimetableClassSubject[];
    rooms: ReadonlyMap<string, string>;
    homerooms: ReadonlyMap<string, string>;
    activityTypes: ReadonlyMap<string, string>;
    validFrom: string;
    validTo: string;
    substituteTeacherId: string;
  },
): Promise<{ slots: number; exceptions: number }> {
  const { entries, rooms, homerooms } = options;
  const roomOf = (role: RoomRole, classId: string): string => {
    const name =
      role === 'lab'
        ? 'Laboratoire de sciences'
        : role === 'info'
          ? 'Salle informatique'
          : role === 'gym'
            ? 'Gymnase'
            : undefined;
    const id = name ? rooms.get(name) : homerooms.get(classId);
    if (!id) throw new Error(`Seed: no room for ${role}`);
    return id;
  };

  const blocks: Block[] = entries.flatMap((entry, i) =>
    (PLAN[entry.subjectId]?.(entry.section) ?? []).map((spec, j) => ({
      entry,
      spec,
      order: i * 3 + j,
    })),
  );
  // Long and shared-room blocks first: they have the fewest places to go.
  blocks.sort(
    (a, b) =>
      b.spec.size - a.spec.size ||
      Number(!!b.spec.room && b.spec.room !== 'home') -
        Number(!!a.spec.room && a.spec.room !== 'home') ||
      a.order - b.order,
  );

  const used = new Set<string>();
  const keys = (resource: string, day: number, start: number, size: number, parity?: WeekParity) =>
    Array.from({ length: size }, (_, k) =>
      (parity ? [parity] : ['A', 'B']).map((p) => `${resource}|${day}|${start + k}|${p}`),
    ).flat();
  const free = (list: string[]) => list.every((k) => !used.has(k));
  const sameDay = new Set<string>();

  const slots: {
    id: string;
    classSubjectId: string;
    teacherId: string;
    roomId: string;
    activityTypeId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    validFrom: Date;
    validTo: Date;
    weekParity: WeekParity | null;
  }[] = [];

  for (const block of blocks) {
    const { entry, spec } = block;
    const roomId = roomOf(spec.room ?? 'home', entry.classId);
    const starts = spec.size === 2 ? [0, 2, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    const positions = DAYS.flatMap((day) => starts.map((start) => ({ day, start })));
    const offset = (block.order * 7) % positions.length;
    let placed = false;
    for (const strict of [true, false]) {
      for (let n = 0; n < positions.length && !placed; n++) {
        const { day, start } = positions[(offset + n) % positions.length]!;
        if (strict && sameDay.has(`${entry.classSubjectId}|${day}`)) continue;
        const all = [
          ...keys(`class:${entry.classId}`, day, start, spec.size, spec.parity),
          ...keys(`teacher:${entry.teacherId}`, day, start, spec.size, spec.parity),
          ...keys(`room:${roomId}`, day, start, spec.size, spec.parity),
        ];
        if (!free(all)) continue;
        all.forEach((k) => used.add(k));
        sameDay.add(`${entry.classSubjectId}|${day}`);
        slots.push({
          id: randomUUID(),
          classSubjectId: entry.classSubjectId,
          teacherId: entry.teacherId,
          roomId,
          activityTypeId: options.activityTypes.get(spec.type ?? 'cours')!,
          weekday: day,
          startTime: PERIODS[start]![0],
          endTime: PERIODS[start + spec.size - 1]![1],
          validFrom: new Date(`${options.validFrom}T00:00:00Z`),
          validTo: new Date(`${options.validTo}T00:00:00Z`),
          weekParity: spec.parity ?? null,
        });
        placed = true;
      }
      if (placed) break;
    }
    if (!placed) throw new Error(`Seed: no room in the week for ${entry.subjectId}`);
  }

  await prisma.timetableSlot.createMany({ data: slots });

  // The index: same code as the API, so a clash would be refused by the database.
  const occupancy = new OccupancyService(prisma as unknown as PrismaService);
  for (let i = 0; i < slots.length; i += 50)
    await occupancy.reindexSlots(prisma, slots.slice(i, i + 50).map((s) => s.id));

  const exceptions = await seedExceptions(prisma, occupancy, entries, slots, options);
  return { slots: slots.length, exceptions };
}

/** A few one-off changes, each on a session that exists, in a free place. */
async function seedExceptions(
  prisma: PrismaClient,
  occupancy: OccupancyService,
  entries: readonly TimetableClassSubject[],
  slots: readonly { id: string; classSubjectId: string; weekday: number; endTime: string; weekParity: WeekParity | null; roomId: string }[],
  options: { rooms: ReadonlyMap<string, string>; substituteTeacherId: string },
): Promise<number> {
  const firstSession = (subjectId: string, afterDay: string, classIndex: number) => {
    const wanted = entries.filter((e) => e.subjectId === subjectId);
    const entry = wanted[classIndex % wanted.length]!;
    const slot = slots.find((s) => s.classSubjectId === entry.classSubjectId && !s.weekParity)!;
    let day = afterDay;
    while (weekday(day) !== slot.weekday) day = addDays(day, 1);
    return { slot, entry, day };
  };
  const make: {
    slotId: string;
    date: string;
    kind: 'cancelled' | 'moved' | 'substitute' | 'room_change';
    newStart?: string;
    newEnd?: string;
    newRoomId?: string;
    newTeacherId?: string;
    reason: string;
  }[] = [];

  const maths = firstSession('mathematiques', '2026-11-08', 0);
  make.push({ slotId: maths.slot.id, date: maths.day, kind: 'cancelled', reason: 'Enseignant absent' });

  const french = firstSession('francais', '2026-11-15', 1);
  make.push({
    slotId: french.slot.id,
    date: french.day,
    kind: 'room_change',
    newRoomId: options.rooms.get('Grande salle')!,
    reason: 'Lecture à voix haute avec la classe voisine',
  });

  const philosophy = firstSession('philosophie', '2026-11-22', 2);
  make.push({
    slotId: philosophy.slot.id,
    date: philosophy.day,
    kind: 'moved',
    newStart: '16:00',
    newEnd: '17:00',
    reason: 'Rattrapage après la sortie',
  });

  // A replacement: the substitute teaches nothing at that hour (checked by the index).
  const sport = firstSession('eps', '2026-11-29', 0);
  make.push({
    slotId: sport.slot.id,
    date: sport.day,
    kind: 'substitute',
    newTeacherId: options.substituteTeacherId,
    reason: 'Remplacement',
  });

  const touched = new Set<string>();
  for (const e of make) {
    await prisma.slotException.create({
      data: {
        slotId: e.slotId,
        date: new Date(`${e.date}T00:00:00Z`),
        kind: e.kind,
        newStart: e.newStart ?? null,
        newEnd: e.newEnd ?? null,
        newRoomId: e.newRoomId ?? null,
        newTeacherId: e.newTeacherId ?? null,
        reason: e.reason,
      },
    });
    touched.add(e.slotId);
  }
  await occupancy.reindexSlots(prisma, [...touched]);
  return make.length;
}
