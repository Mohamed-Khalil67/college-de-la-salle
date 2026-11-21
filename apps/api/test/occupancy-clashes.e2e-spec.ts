import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type IndexRow, OccupancyService } from '../src/occupancy/occupancy.service.js';
import { createTestApp, type TestApp } from './helpers.js';

interface Found {
  i: number;
  kind: string;
  slot_id: string | null;
  exception_id: string | null;
  event_id: string | null;
}

const key = (f: Found) => `${f.i}|${f.kind}|${f.slot_id}|${f.exception_id}|${f.event_id}`;

describe('occupancy clash probe (finding 4: indexed LATERAL instead of a hash join)', () => {
  let t: TestApp;
  let occupancy: OccupancyService;
  let rows: IndexRow[];

  beforeAll(async () => {
    t = await createTestApp();
    occupancy = t.app.get(OccupancyService);
    // Every seeded index row moved by 0 and 30 minutes: half of them hold the exact same time, the other half
    // overlap the next session too, so every rule (room, teacher, whole class, division, group) is exercised.
    const seeded = await t.prisma.$queryRaw<
      {
        room_id: string | null;
        teacher_id: string | null;
        class_id: string | null;
        division_key: string | null;
        group_id: string | null;
        day: string;
        starts_at: string;
        ends_at: string;
      }[]
    >`
      SELECT o.room_id, o.teacher_id, o.class_id, o.division_key, o.group_id, to_char(o.day, 'YYYY-MM-DD') AS day,
             to_char(lower(o.during) + s.shift, 'YYYY-MM-DD HH24:MI') AS starts_at,
             to_char(upper(o.during) + s.shift, 'YYYY-MM-DD HH24:MI') AS ends_at
        FROM occupancy o CROSS JOIN (VALUES (interval '0'), (interval '30 minutes')) AS s(shift)
       ORDER BY o.id, s.shift`;
    rows = seeded.map((r) => ({
      source: 'slot',
      day: r.day,
      roomId: r.room_id,
      teacherId: r.teacher_id,
      classId: r.class_id,
      divisionKey: r.division_key,
      groupId: r.group_id,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      exceptionId: null,
      slotId: null,
      eventId: null,
    }));
  });

  afterAll(() => t.close());

  it('finds exactly what the former plain join found', async () => {
    expect(rows.length).toBeGreaterThan(1000);
    const json = JSON.stringify(
      rows.map((r, i) => ({
        i,
        room_id: r.roomId,
        teacher_id: r.teacherId,
        class_id: r.classId,
        division_key: r.divisionKey,
        group_id: r.groupId ?? null,
        starts_at: r.startsAt,
        ends_at: r.endsAt,
      })),
    );
    // The query as it was before the fix (main 20d1b34), kept here as the reference.
    const reference = await t.prisma.$queryRaw<Found[]>`
      WITH c AS (
        SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS c(
          i int, room_id uuid, teacher_id uuid, class_id uuid, division_key text, group_id uuid, starts_at timestamp, ends_at timestamp)
      )
      SELECT c.i, 'room'::text AS kind, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.room_id = c.room_id AND o.during && tsrange(c.starts_at, c.ends_at)
      UNION ALL
      SELECT c.i, 'teacher'::text, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.teacher_id = c.teacher_id AND o.during && tsrange(c.starts_at, c.ends_at)
      UNION ALL
      SELECT c.i, 'class'::text, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.class_id = c.class_id AND o.during && tsrange(c.starts_at, c.ends_at)
         AND (c.division_key IS NULL OR o.division_key IS DISTINCT FROM c.division_key)
      UNION ALL
      SELECT c.i, 'class'::text, o.slot_id, o.exception_id, o.event_id
        FROM c JOIN occupancy o ON o.group_id = c.group_id AND o.during && tsrange(c.starts_at, c.ends_at)
       WHERE c.group_id IS NOT NULL`;
    const now = await t.prisma.$transaction((tx) => occupancy.indexClashes(tx, rows));
    const expected = reference.map(key).sort();
    const actual = now
      .map((c) =>
        key({ i: c.i, kind: c.kind, slot_id: c.slotId, exception_id: c.exceptionId, event_id: c.eventId }),
      )
      .sort();
    expect(expected.length).toBeGreaterThan(rows.length / 2);
    expect(new Set(reference.map((f) => f.kind))).toEqual(new Set(['room', 'teacher', 'class']));
    expect(actual).toEqual(expected);
  });

  it('probes the GiST indexes of the exclusion constraints, not a hash join over the table', async () => {
    const json = JSON.stringify(
      rows.slice(0, 200).map((r, i) => ({
        i,
        room_id: r.roomId,
        teacher_id: r.teacherId,
        class_id: r.classId,
        division_key: r.divisionKey,
        group_id: r.groupId ?? null,
        starts_at: r.startsAt,
        ends_at: r.endsAt,
      })),
    );
    // The same statement as indexClashes, explained.
    const plan = await t.prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (COSTS OFF)
      WITH c AS (
        SELECT * FROM jsonb_to_recordset(${json}::jsonb) AS c(
          i int, room_id uuid, teacher_id uuid, class_id uuid, division_key text, group_id uuid, starts_at timestamp, ends_at timestamp)
      )
      SELECT c.i, h.kind, h.slot_id, h.exception_id, h.event_id
        FROM c CROSS JOIN LATERAL (
          SELECT 'room'::text AS kind, o.slot_id, o.exception_id, o.event_id FROM occupancy o
           WHERE o.room_id = c.room_id AND o.room_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at)
          UNION ALL
          SELECT 'teacher'::text, o.slot_id, o.exception_id, o.event_id FROM occupancy o
           WHERE o.teacher_id = c.teacher_id AND o.teacher_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at)
          UNION ALL
          SELECT 'class'::text, o.slot_id, o.exception_id, o.event_id FROM occupancy o
           WHERE o.class_id = c.class_id AND o.class_id IS NOT NULL AND o.during && tsrange(c.starts_at, c.ends_at)
             AND (c.division_key IS NULL OR o.division_key IS DISTINCT FROM c.division_key)
          UNION ALL
          SELECT 'class'::text, o.slot_id, o.exception_id, o.event_id FROM occupancy o
           WHERE c.group_id IS NOT NULL AND o.group_id = c.group_id AND o.group_id IS NOT NULL
             AND o.during && tsrange(c.starts_at, c.ends_at)
        ) h`;
    const text = plan.map((p) => p['QUERY PLAN']).join('\n');
    expect(text).toContain('occupancy_room_no_overlap');
    expect(text).toContain('occupancy_teacher_no_overlap');
    expect(text).not.toMatch(/Hash Join/);
  });
});
