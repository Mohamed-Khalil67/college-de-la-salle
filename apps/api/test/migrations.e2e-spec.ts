import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { averageOnTwenty, generalAverage, SYSTEM_ACTIVITY_TYPES } from '@cdls/shared';
import pg from 'pg';
import { inject } from 'vitest';

const MIGRATIONS = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
/** The first phase 1 migration: everything before it is the schema that was in production. */
const FIRST_PHASE_1 = '20261021000100_subjects_class_subjects';

const all = readdirSync(MIGRATIONS)
  .filter((d) => /^\d{14}_/.test(d))
  .sort();
const sql = (dir: string) => readFileSync(`${MIGRATIONS}${dir}/migration.sql`, 'utf8');

interface Row {
  readonly [column: string]: unknown;
}

/** Student averages as the old code computed them: events by date in the term, coefficient = highest assignment. */
interface Fixture {
  readonly students: readonly string[];
  readonly classId: string;
}

/**
 * Migrates a database built with the pre-phase-1 schema and checks what the backfills promise: no average
 * changes, every event keeps its type, grades keep their period, assignments keep their teacher and class.
 */
describe('Phase 1 migrations on existing data (e2e)', () => {
  let admin: pg.Client;
  let db: pg.Client;
  let database: string;
  let fixture: Fixture;

  /** One student's grades with the old rules: term by date, subject weight = highest assignment coefficient. */
  const legacyAverages = async (): Promise<Map<string, number | null>> => {
    const grades = await db.query(`
      SELECT g.student_id::text AS student, e.subject_id AS subject, g.score::float AS score,
             g.out_of::float AS out_of, e.coefficient::float AS coefficient
      FROM grades g
      JOIN events e ON e.id = g.event_id
      JOIN terms t ON e.date BETWEEN t.starts_on AND t.ends_on AND t.number = 1
      WHERE g.published`);
    const weights = await db.query(`
      SELECT subject_id AS subject, MAX(coefficient)::float AS coefficient
      FROM teaching_assignments GROUP BY class_id, subject_id`);
    return averagesOf(grades.rows, weights.rows);
  };

  /** The same averages after the migration: events by period_id, subject weight = the class subject. */
  const migratedAverages = async (): Promise<Map<string, number | null>> => {
    const grades = await db.query(`
      SELECT g.student_id::text AS student, e.subject_id AS subject, g.score::float AS score,
             g.out_of::float AS out_of, e.coefficient::float AS coefficient
      FROM grades g
      JOIN events e ON e.id = g.event_id
      JOIN periods p ON p.id = e.period_id AND p.number = 1
      WHERE g.published`);
    const weights = await db.query(`
      SELECT subject_id AS subject, coefficient::float AS coefficient FROM class_subjects`);
    return averagesOf(grades.rows, weights.rows);
  };

  beforeAll(async () => {
    const url = new URL(inject('databaseUrl'));
    admin = new pg.Client({ connectionString: url.toString() });
    await admin.connect();
    database = `cdls_mig_${Date.now()}_${randomBytes(3).toString('hex')}`;
    await admin.query(`CREATE DATABASE ${database}`);
    url.pathname = `/${database}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();

    for (const dir of all.slice(0, all.indexOf(FIRST_PHASE_1))) await db.query(sql(dir));
    fixture = await seedLegacyData();
  });

  afterAll(async () => {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  });

  /** Two teachers share mathématiques (coefficients 3 and 4), arabe has one (2); events in and out of the terms. */
  async function seedLegacyData(): Promise<Fixture> {
    const q = async (text: string, values: unknown[] = []) =>
      (await db.query(text, values)).rows as Row[];
    const id = async (text: string, values: unknown[] = []) =>
      String((await q(text, values))[0]!['id']);
    const year = await id(
      `INSERT INTO school_years (id, label, starts_on, ends_on, is_current)
       VALUES (gen_random_uuid(), '2026-2027', '2026-09-06', '2027-06-17', true) RETURNING id`,
    );
    for (const [n, from, to] of [
      [1, '2026-09-06', '2026-12-17'],
      [2, '2027-01-03', '2027-03-25'],
    ] as const)
      await q(
        `INSERT INTO terms (id, school_year_id, number, label, starts_on, ends_on)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
        [year, n, `${n}e trimestre`, from, to],
      );
    const section = await id(
      `INSERT INTO sections (id, code, label) VALUES (gen_random_uuid(), 'bac', 'Bac français') RETURNING id`,
    );
    const classId = await id(
      `INSERT INTO school_classes (id, school_year_id, section_id, code, label)
       VALUES (gen_random_uuid(), $1, $2, 'premiere', 'Première') RETURNING id`,
      [year, section],
    );
    for (const [subject, name, group] of [
      ['mathematiques', 'Mathématiques', 'Sciences'],
      ['arabe', 'Langue arabe', 'Langues'],
      ['psychologie', 'Psychologie et sociologie', 'Lettres et sciences humaines'],
      ['espagnol', 'Espagnol', 'Langues'],
    ])
      await q(`INSERT INTO subjects (id, name, "group") VALUES ($1, $2, $3)`, [
        subject,
        name,
        group,
      ]);

    const user = async (email: string, role: 'teacher' | 'student') =>
      id(
        `INSERT INTO users (id, email, password_hash, role, first_name, last_name, updated_at)
         VALUES (gen_random_uuid(), $1, 'x', $2, 'A', 'B', now()) RETURNING id`,
        [email, role],
      );
    const teacher = async (email: string) =>
      id(`INSERT INTO teachers (id, user_id) VALUES (gen_random_uuid(), $1) RETURNING id`, [
        await user(email, 'teacher'),
      ]);
    const [t1, t2, t3] = [
      await teacher('t1@x.test'),
      await teacher('t2@x.test'),
      await teacher('t3@x.test'),
    ];
    for (const [teacherId, subject, coefficient] of [
      [t1, 'mathematiques', 3],
      [t2, 'mathematiques', 4],
      [t3, 'arabe', 2],
      [t3, 'psychologie', 1.5],
    ] as const)
      await q(
        `INSERT INTO teaching_assignments (id, teacher_id, class_id, subject_id, coefficient)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [teacherId, classId, subject, coefficient],
      );

    const students: string[] = [];
    for (let i = 0; i < 3; i++) {
      const studentId = await id(
        `INSERT INTO students (id, user_id) VALUES (gen_random_uuid(), $1) RETURNING id`,
        [await user(`s${i}@x.test`, 'student')],
      );
      students.push(studentId);
      await q(
        `INSERT INTO enrollments (id, student_id, class_id, school_year_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [studentId, classId, year],
      );
    }

    const event = (kind: string, subject: string | null, date: string, coefficient: number) =>
      id(
        `INSERT INTO events (id, kind, title, subject_id, class_id, date, coefficient, author_id, updated_at)
         VALUES (gen_random_uuid(), $1::event_kind, $1, $2, $3, $4, $5, $6, now()) RETURNING id`,
        [kind, subject, classId, date, coefficient, t1],
      );
    const graded = [
      await event('examen', 'mathematiques', '2026-10-13', 2),
      await event('controle', 'mathematiques', '2026-11-20', 1),
      await event('controle', 'arabe', '2026-12-17', 1), // last day of term 1
      await event('devoir', 'psychologie', '2026-10-26', 1),
      await event('tp', 'mathematiques', '2027-02-10', 1), // term 2: must not count in term 1
    ];
    await event('cours', 'mathematiques', '2026-09-06', 1);
    await event('reunion', null, '2026-11-02', 1);
    await event('examen', 'arabe', '2027-05-01', 1); // outside both terms: no period
    for (const [i, studentId] of students.entries())
      for (const [j, eventId] of graded.entries())
        await q(
          `INSERT INTO grades (id, event_id, student_id, score, out_of, published, graded_by_id, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, now())`,
          [
            eventId,
            studentId,
            j % 2 ? 4 + ((i + j) % 6) : 8 + ((i * 3 + j * 2) % 11) + 0.5,
            j % 2 ? 10 : 20,
            t1,
          ],
        );
    return { students, classId };
  }

  it('keeps every average unchanged: the class subject coefficient is the highest assignment coefficient', async () => {
    const legacy = await legacyAverages();
    expect(legacy.size).toBe(3);
    for (const average of legacy.values()) expect(average).not.toBeNull();
    const eventsBefore = (await db.query('SELECT id::text, kind::text FROM events ORDER BY id'))
      .rows;

    for (const dir of all.slice(all.indexOf(FIRST_PHASE_1))) await db.query(sql(dir));

    expect([...(await migratedAverages())]).toEqual([...legacy]);

    const coefficients = await db.query(
      `SELECT subject_id, coefficient::float AS coefficient FROM class_subjects ORDER BY subject_id`,
    );
    expect(coefficients.rows).toEqual([
      { subject_id: 'arabe', coefficient: 2 },
      { subject_id: 'mathematiques', coefficient: 4 },
      { subject_id: 'psychologie', coefficient: 1.5 },
    ]);
    // Every event keeps the type of its old kind.
    const eventsAfter = (
      await db.query(
        `SELECT e.id::text, t.code AS kind FROM events e JOIN activity_types t ON t.id = e.activity_type_id ORDER BY e.id`,
      )
    ).rows;
    expect(eventsAfter).toEqual(eventsBefore);
  });

  it('keeps one teaching assignment per teacher, now pointing to the class subject', async () => {
    const rows = (
      await db.query(
        `SELECT a.teacher_id::text AS teacher, cs.subject_id AS subject, cs.class_id::text AS class
         FROM teaching_assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id ORDER BY subject, teacher`,
      )
    ).rows;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r['class'] === fixture.classId)).toBe(true);
    expect(rows.filter((r) => r['subject'] === 'mathematiques')).toHaveLength(2);
  });

  it('creates the system activity types with their old flags and drops the enum', async () => {
    const types = (
      await db.query(
        `SELECT code, label, colour, icon, repeatable, gradable, homework FROM activity_types WHERE is_system ORDER BY sort_order`,
      )
    ).rows;
    expect(types).toEqual(
      SYSTEM_ACTIVITY_TYPES.map((t) => ({
        code: t.code,
        label: t.label,
        colour: t.colour,
        icon: t.icon,
        repeatable: t.repeatable,
        gradable: t.gradable,
        homework: t.homework,
      })),
    );
    expect((await db.query(`SELECT 1 FROM pg_type WHERE typname = 'event_kind'`)).rowCount).toBe(0);
  });

  it('gives gradable events the period of their date, and no other event', async () => {
    const rows = (
      await db.query(
        `SELECT t.code, e.date::text AS date, p.number AS period
         FROM events e JOIN activity_types t ON t.id = e.activity_type_id
         LEFT JOIN periods p ON p.id = e.period_id ORDER BY e.date, t.code`,
      )
    ).rows;
    expect(rows).toEqual([
      { code: 'cours', date: '2026-09-06', period: null },
      { code: 'examen', date: '2026-10-13', period: 1 },
      { code: 'devoir', date: '2026-10-26', period: 1 },
      { code: 'reunion', date: '2026-11-02', period: null },
      { code: 'controle', date: '2026-11-20', period: 1 },
      { code: 'controle', date: '2026-12-17', period: 1 },
      { code: 'tp', date: '2027-02-10', period: 2 },
      { code: 'examen', date: '2027-05-01', period: null },
    ]);
  });

  it('turns terms into trimesters of every section, ids kept, with the EXCLUDE constraints', async () => {
    const periods = (
      await db.query(`SELECT number, kind::text AS kind, section_id FROM periods ORDER BY number`)
    ).rows;
    expect(periods).toEqual([
      { number: 1, kind: 'trimester', section_id: null },
      { number: 2, kind: 'trimester', section_id: null },
    ]);
    const constraints = (
      await db.query(`SELECT conname FROM pg_constraint WHERE contype = 'x' AND conname LIKE 'periods_%' ORDER BY conname`)
    ).rows.map((r) => r['conname']);
    expect(constraints).toEqual(['periods_no_overlap', 'periods_number_unique']);

    const year = String((await db.query('SELECT id FROM school_years')).rows[0]!['id']);
    await expect(
      db.query(
        `INSERT INTO periods (id, school_year_id, number, label, starts_on, ends_on)
         VALUES (gen_random_uuid(), $1, 3, 'Chevauche', '2026-12-01', '2027-01-10')`,
        [year],
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('backfills the sections of the subjects from the catalogue', async () => {
    const rows = (await db.query(`SELECT id, sections FROM subjects ORDER BY id`)).rows;
    expect(rows).toEqual([
      { id: 'arabe', sections: ['nationale', 'bac'] },
      { id: 'espagnol', sections: ['bac'] },
      { id: 'mathematiques', sections: ['nationale', 'bac'] },
      { id: 'psychologie', sections: ['nationale'] },
    ]);
  });
});

/** Subject averages with the shared rules, then the general average, per student. */
function averagesOf(grades: readonly Row[], weights: readonly Row[]): Map<string, number | null> {
  const weightOf = new Map(weights.map((w) => [String(w['subject']), Number(w['coefficient'])]));
  const students = new Map<
    string,
    Map<string, { score: number; outOf: number; coefficient: number }[]>
  >();
  for (const g of grades) {
    const bySubject = students.get(String(g['student'])) ?? new Map();
    const list = bySubject.get(String(g['subject'])) ?? [];
    list.push({
      score: Number(g['score']),
      outOf: Number(g['out_of']),
      coefficient: Number(g['coefficient']),
    });
    bySubject.set(String(g['subject']), list);
    students.set(String(g['student']), bySubject);
  }
  const out = new Map<string, number | null>();
  for (const [student, bySubject] of [...students].sort(([a], [b]) => a.localeCompare(b))) {
    out.set(
      student,
      generalAverage(
        [...bySubject].map(([subject, list]) => ({
          average: averageOnTwenty(list),
          coefficient: weightOf.get(subject) ?? null,
        })),
      ),
    );
  }
  return out;
}
