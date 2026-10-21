import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inject } from 'vitest';

const MIGRATIONS = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
/** The groups and targets migration: everything before it is the schema of integration-2. */
const GROUPS = '20261022000200_groups_targets';

const all = readdirSync(MIGRATIONS)
  .filter((d) => /^\d{14}_/.test(d))
  .sort();
const sql = (dir: string) => readFileSync(`${MIGRATIONS}${dir}/migration.sql`, 'utf8');

/**
 * Upgrades a database that has the integration-2 schema (phases 1, 2 and 4) with data in it, and checks the
 * backfill: every assessment and homework of a class is addressed to the whole class, nothing else gets a
 * target, no group appears, and what the students saw before they still see.
 */
describe('Groups and targets migration on existing data (e2e)', () => {
  let admin: pg.Client;
  let db: pg.Client;
  let database: string;
  const ids = {} as Record<string, string>;

  const q = async (text: string, values: unknown[] = []) => (await db.query(text, values)).rows;
  const one = async (text: string, values: unknown[] = []) => String((await q(text, values))[0]['id']);

  /** What a student saw before: the events of their class, or of nobody's class, with the old audience rule. */
  const visibleBefore = async (studentId: string) =>
    (
      await q(
        `SELECT e.id::text AS id FROM events e
          JOIN enrollments en ON en.student_id = $1 AND en.left_on IS NULL
         WHERE e.class_id = en.class_id OR (e.class_id IS NULL AND e.section_id IS NULL)
         ORDER BY e.id`,
        [studentId],
      )
    ).map((r) => String(r['id']));

  /** The same list under the new rule: no group or student target means « the whole class ». */
  const visibleAfter = async (studentId: string) =>
    (
      await q(
        `SELECT e.id::text AS id FROM events e
          JOIN enrollments en ON en.student_id = $1 AND en.left_on IS NULL
         WHERE (e.class_id = en.class_id
                AND (NOT EXISTS (SELECT 1 FROM assessment_targets t WHERE t.event_id = e.id AND t.scope IN ('group', 'student'))
                     OR EXISTS (SELECT 1 FROM assessment_targets t WHERE t.event_id = e.id AND t.scope = 'student' AND t.student_id = $1)
                     OR EXISTS (SELECT 1 FROM assessment_targets t JOIN group_members m ON m.group_id = t.group_id
                                 WHERE t.event_id = e.id AND t.scope = 'group' AND m.student_id = $1 AND m.left_on IS NULL)))
            OR (e.class_id IS NULL AND e.section_id IS NULL)
         ORDER BY e.id`,
        [studentId],
      )
    ).map((r) => String(r['id']));

  beforeAll(async () => {
    const url = new URL(inject('databaseUrl'));
    admin = new pg.Client({ connectionString: url.toString() });
    await admin.connect();
    database = `cdls_mig_${Date.now()}_${randomBytes(3).toString('hex')}`;
    await admin.query(`CREATE DATABASE ${database}`);
    url.pathname = `/${database}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    for (const dir of all.slice(0, all.indexOf(GROUPS))) await db.query(sql(dir));
    await seed();
  });

  afterAll(async () => {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  });

  async function seed(): Promise<void> {
    const year = await one(
      `INSERT INTO school_years (id, label, starts_on, ends_on, is_current)
       VALUES (gen_random_uuid(), '2026-2027', '2026-09-06', '2027-06-17', true) RETURNING id`,
    );
    const section = await one(
      `INSERT INTO sections (id, code, label) VALUES (gen_random_uuid(), 'bac', 'Bac français') RETURNING id`,
    );
    ids['class'] = await one(
      `INSERT INTO school_classes (id, school_year_id, section_id, code, label)
       VALUES (gen_random_uuid(), $1, $2, 'premiere', 'Première') RETURNING id`,
      [year, section],
    );
    const user = (email: string, role: string) =>
      one(
        `INSERT INTO users (id, email, password_hash, role, first_name, last_name, updated_at)
         VALUES (gen_random_uuid(), $1, 'x', $2::role, 'A', 'B', now()) RETURNING id`,
        [email, role],
      );
    const teacher = await one(`INSERT INTO teachers (id, user_id) VALUES (gen_random_uuid(), $1) RETURNING id`, [
      await user('t@x.test', 'teacher'),
    ]);
    ids['students'] = '';
    for (let i = 0; i < 4; i++) {
      const s = await one(`INSERT INTO students (id, user_id) VALUES (gen_random_uuid(), $1) RETURNING id`, [
        await user(`s${i}@x.test`, 'student'),
      ]);
      ids['students'] += `${ids['students'] ? ',' : ''}${s}`;
      await q(
        `INSERT INTO enrollments (id, student_id, class_id, school_year_id) VALUES (gen_random_uuid(), $1, $2, $3)`,
        [s, ids['class'], year],
      );
    }
    await q(`INSERT INTO subjects (id, name, "group") VALUES ('mathematiques', 'Mathématiques', 'Sciences')`);
    const type = (code: string) => one(`SELECT id FROM activity_types WHERE code = $1`, [code]);
    const event = (code: string, classId: string | null, sectionId: string | null, date: string) =>
      one(
        `INSERT INTO events (id, activity_type_id, title, subject_id, class_id, section_id, date, author_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'mathematiques', $3, $4, $5, $6, now()) RETURNING id`,
        [code, `Événement ${date}`, classId, sectionId, date, teacher],
      );
    // An exam, a test, a homework, a course, a section meeting and a whole-school day.
    ids['exam'] = await event(await type('examen'), ids['class']!, null, '2026-10-13');
    ids['test'] = await event(await type('controle'), ids['class']!, null, '2026-10-15');
    ids['homework'] = await event(await type('devoir'), ids['class']!, null, '2026-10-26');
    ids['course'] = await event(await type('cours'), ids['class']!, null, '2026-09-06');
    ids['meeting'] = await event(await type('reunion'), null, section, '2026-11-02');
    ids['school'] = await event(await type('activite'), null, null, '2026-11-05');
    // A homework of the section (no class): never targeted.
    ids['sectionHomework'] = await event(await type('devoir'), null, section, '2026-11-09');
    for (const s of ids['students']!.split(',')) {
      await q(
        `INSERT INTO grades (id, event_id, student_id, score, graded_by_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 12, $3, now())`,
        [ids['exam'], s, teacher],
      );
      await q(`INSERT INTO homework_completions (event_id, student_id) VALUES ($1, $2)`, [ids['homework'], s]);
    }
  }

  it('leaves what every student sees unchanged, then addresses every assessment and homework to the class', async () => {
    const students = ids['students']!.split(',');
    const before = await Promise.all(students.map(visibleBefore));
    const gradesBefore = (await q('SELECT count(*)::int AS n FROM grades'))[0]['n'];

    for (const dir of all.slice(all.indexOf(GROUPS))) await db.query(sql(dir));

    const after = await Promise.all(students.map(visibleAfter));
    expect(after).toEqual(before);
    expect(before[0]!.length).toBe(5); // the four events of the class and the whole-school day
    expect((await q('SELECT count(*)::int AS n FROM grades'))[0]['n']).toBe(gradesBefore);
    expect((await q('SELECT count(*)::int AS n FROM groups'))[0]['n']).toBe(0);
    expect((await q('SELECT count(*)::int AS n FROM group_members'))[0]['n']).toBe(0);

    const targets = await q(
      `SELECT event_id::text AS event, scope::text AS scope, group_id, student_id FROM assessment_targets`,
    );
    // The exam, the test and the class homework: one class row each. The course, the meetings and the
    // section homework carry none.
    expect(targets.map((t) => String(t['event'])).sort((a, b) => a.localeCompare(b))).toEqual(
      [ids['exam'], ids['test'], ids['homework']].sort((a, b) => String(a).localeCompare(String(b))),
    );
    expect(targets.every((t) => t['scope'] === 'class' && t['group_id'] === null && t['student_id'] === null)).toBe(true);
  });

  it('keeps the rules it adds: one class row, consistent rows, one open membership per division, no group overlap', async () => {
    const dup = db.query(
      `INSERT INTO assessment_targets (id, event_id, scope) VALUES (gen_random_uuid(), $1, 'class')`,
      [ids['exam']],
    );
    await expect(dup).rejects.toThrow(/assessment_targets_one_class_key/);
    await expect(
      db.query(
        `INSERT INTO assessment_targets (id, event_id, scope, student_id) VALUES (gen_random_uuid(), $1, 'group', $2)`,
        [ids['test'], ids['students']!.split(',')[0]],
      ),
    ).rejects.toThrow(/assessment_targets_scope_check/);

    const group = (label: string, division = 'TP') =>
      one(
        `INSERT INTO groups (id, class_id, division, label) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        [ids['class'], division, label],
      );
    const [g1, g2] = [await group('A'), await group('B')];
    const student = ids['students']!.split(',')[0];
    const member = (g: string) =>
      db.query(
        `INSERT INTO group_members (id, group_id, student_id, class_id, division) VALUES (gen_random_uuid(), $1, $2, $3, 'TP')`,
        [g, student, ids['class']],
      );
    await member(g1!);
    await expect(member(g2!)).rejects.toThrow(/group_members_open_student_division_key/);
    // After leaving, the student can join another group of the division.
    await q(`UPDATE group_members SET left_on = joined_on WHERE group_id = $1`, [g1]);
    await member(g2!);

    // Two sessions of one group never overlap in the index.
    const row = (start: string, end: string) =>
      db.query(
        `INSERT INTO occupancy (id, source, event_id, day, class_id, division_key, group_id, during)
         VALUES (gen_random_uuid(), 'event', $1, '2026-10-13', $2, 'TP', $3, tsrange($4, $5))`,
        [ids['exam'], ids['class'], g1, start, end],
      );
    await row('2026-10-13 09:00', '2026-10-13 10:00');
    await expect(row('2026-10-13 09:30', '2026-10-13 10:30')).rejects.toThrow(/occupancy_group_no_overlap/);
  });
});
