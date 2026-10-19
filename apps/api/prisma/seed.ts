/**
 * Demo data for the school (and the sales demo): one school year with three terms, both sections and
 * every class from CLASSES, the subject catalogue, an admin, nine teachers, ten students per class,
 * a timetable, an exam with published grades, a draft test, homework, attendance and announcements.
 *
 * Run with `npm run db:seed` (also runs after `prisma migrate reset`). It wipes the tables first.
 * Passwords are random on every run and written only to apps/api/demo-credentials.local.md (gitignored).
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { CLASSES, MATIERES, matieresFor, SECTION_LABELS, type SectionId } from '@cdls/shared';
import { hash } from 'argon2';
import { PrismaClient, Role, type Prisma } from '../src/generated/prisma/client.js';

const CREDENTIALS_FILE = fileURLToPath(new URL('../demo-credentials.local.md', import.meta.url));
const DOMAIN = 'demo.cdls.test';
const STUDENTS_PER_CLASS = 10;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

/** Deterministic pseudo-random numbers (mulberry32), so the demo looks the same on every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(2026);
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const password = () => randomBytes(12).toString('base64url');
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');

const TEACHERS: readonly { first: string; last: string; subjects: readonly string[] }[] = [
  { first: 'Hany', last: 'Mansour', subjects: ['mathematiques'] },
  { first: 'Claire', last: 'Dubois', subjects: ['francais', 'humanites'] },
  { first: 'Mona', last: 'Abdelmalek', subjects: ['arabe', 'education-religieuse'] },
  { first: 'Peter', last: 'Ghali', subjects: ['anglais', 'espagnol'] },
  { first: 'Sherif', last: 'Nassar', subjects: ['physique-chimie'] },
  { first: 'Rania', last: 'Youssef', subjects: ['svt'] },
  {
    first: 'Marc',
    last: 'Lefèvre',
    subjects: ['histoire-geographie', 'education-civique', 'philosophie'],
  },
  { first: 'Ingy', last: 'Samir', subjects: ['informatique', 'ses'] },
  { first: 'Karim', last: 'Fawzy', subjects: ['eps', 'arts', 'psychologie'] },
];

const COEFFICIENTS: Readonly<Record<string, number>> = {
  mathematiques: 4,
  'physique-chimie': 3,
  francais: 3,
  arabe: 3,
  svt: 2,
  anglais: 2,
  philosophie: 2,
  'histoire-geographie': 2,
};

const FIRST_NAMES = [
  'Youssef',
  'Mariam',
  'Omar',
  'Nour',
  'Adam',
  'Salma',
  'Karim',
  'Laila',
  'Ziad',
  'Farida',
  'Marc',
  'Sarah',
  'Hassan',
  'Yasmine',
  'Ali',
  'Jana',
  'Tarek',
  'Malak',
  'Philippe',
  'Hana',
  'Seif',
  'Habiba',
  'Mina',
  'Carine',
];
const LAST_NAMES = [
  'Hassan',
  'Ibrahim',
  'Mahmoud',
  'Saad',
  'Khalil',
  'Fahmy',
  'Gerges',
  'Naguib',
  'Rizk',
  'Sabry',
  'Wahba',
  'Hanna',
  'Shenouda',
  'Mostafa',
  'Farag',
  'Tadros',
  'Amin',
  'Zaki',
];

const YEAR = { label: '2026-2027', startsOn: '2026-09-06', endsOn: '2027-06-17' };
const TERMS = [
  { number: 1, label: '1er trimestre', startsOn: '2026-09-06', endsOn: '2026-12-17' },
  { number: 2, label: '2e trimestre', startsOn: '2027-01-03', endsOn: '2027-03-25' },
  { number: 3, label: '3e trimestre', startsOn: '2027-04-04', endsOn: '2027-06-17' },
];

async function wipe(): Promise<void> {
  // Children before parents.
  await prisma.auditLog.deleteMany();
  await prisma.reportCard.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.homeworkCompletion.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.event.deleteMany();
  await prisma.post.deleteMany();
  await prisma.teachingAssignment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.schoolClass.deleteMany();
  await prisma.term.deleteMany();
  await prisma.schoolYear.deleteMany();
  await prisma.section.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  await wipe();
  const credentials = { admin: password(), teacher: password(), student: password() };

  // School structure --------------------------------------------------------------------------------
  const year = await prisma.schoolYear.create({
    data: {
      label: YEAR.label,
      startsOn: day(YEAR.startsOn),
      endsOn: day(YEAR.endsOn),
      isCurrent: true,
      terms: {
        create: TERMS.map((t) => ({ ...t, startsOn: day(t.startsOn), endsOn: day(t.endsOn) })),
      },
    },
  });
  const term1 = TERMS[0]!;

  const sections = new Map<SectionId, string>();
  for (const code of Object.keys(SECTION_LABELS) as SectionId[]) {
    const section = await prisma.section.create({ data: { code, label: SECTION_LABELS[code] } });
    sections.set(code, section.id);
  }

  await prisma.subject.createMany({
    data: MATIERES.map((m) => ({ id: m.id, name: m.name, group: m.group })),
  });

  // People ------------------------------------------------------------------------------------------
  const admin = await prisma.user.create({
    data: {
      email: `admin@${DOMAIN}`,
      passwordHash: await hash(credentials.admin),
      role: Role.admin,
      firstName: 'Nadia',
      lastName: 'Fahmy',
    },
  });

  const teacherBySubject = new Map<string, { id: string; userId: string }>();
  const teacherEmails: string[] = [];
  for (const t of TEACHERS) {
    const email = `${slug(t.first)}.${slug(t.last)}@${DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(credentials.teacher),
        role: Role.teacher,
        firstName: t.first,
        lastName: t.last,
        teacher: { create: {} },
      },
      include: { teacher: true },
    });
    teacherEmails.push(`${email} (${t.subjects.join(', ')})`);
    for (const s of t.subjects) teacherBySubject.set(s, { id: user.teacher!.id, userId: user.id });
  }
  const teacherFor = (subject: string) => {
    const t = teacherBySubject.get(subject);
    if (!t) throw new Error(`No demo teacher for subject ${subject}`);
    return t;
  };

  // Classes, assignments, students -------------------------------------------------------------------
  const studentEmails: string[] = [];
  const usedEmails = new Set<string>();
  let studentNumber = 0;
  const events: Prisma.EventCreateManyInput[] = [];
  const classRosters: { classId: string; students: string[]; section: SectionId; code: string }[] =
    [];

  for (const [code, sectionId] of sections) {
    for (const option of CLASSES[code]) {
      const schoolClass = await prisma.schoolClass.create({
        data: { schoolYearId: year.id, sectionId, code: option.value, label: option.label },
      });

      await prisma.teachingAssignment.createMany({
        data: matieresFor(code).map((m) => ({
          teacherId: teacherFor(m.id).id,
          classId: schoolClass.id,
          subjectId: m.id,
          coefficient: COEFFICIENTS[m.id] ?? 1,
        })),
      });

      const students: string[] = [];
      for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
        const first = pick(FIRST_NAMES);
        const last = pick(LAST_NAMES);
        let email = `${slug(first)}.${slug(last)}@${DOMAIN}`;
        for (let n = 2; usedEmails.has(email); n++)
          email = `${slug(first)}.${slug(last)}${n}@${DOMAIN}`;
        usedEmails.add(email);
        studentNumber++;
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash: await hash(credentials.student),
            role: Role.student,
            firstName: first,
            lastName: last,
            student: {
              create: {
                studentNumber: `CDLS-2026-${String(studentNumber).padStart(4, '0')}`,
                enrollments: {
                  create: {
                    classId: schoolClass.id,
                    schoolYearId: year.id,
                    enrolledOn: day(YEAR.startsOn),
                  },
                },
              },
            },
          },
          include: { student: true },
        });
        students.push(user.student!.id);
        if (i < 2) studentEmails.push(`${email} (${SECTION_LABELS[code]} — ${option.label})`);
      }
      classRosters.push({ classId: schoolClass.id, students, section: code, code: option.value });

      // Timetable and assessments for this class.
      const second = code === 'bac' ? 'francais' : 'arabe';
      events.push(
        {
          kind: 'cours',
          title: 'Mathématiques',
          subjectId: 'mathematiques',
          classId: schoolClass.id,
          date: day('2026-09-06'),
          startTime: '08:30',
          endTime: '10:00',
          repeatUntil: day(term1.endsOn),
          place: 'Salle 12',
          authorId: teacherFor('mathematiques').id,
        },
        {
          kind: 'cours',
          title: second === 'francais' ? 'Français' : 'Langue arabe',
          subjectId: second,
          classId: schoolClass.id,
          date: day('2026-09-07'),
          startTime: '10:15',
          endTime: '11:45',
          repeatUntil: day(term1.endsOn),
          place: 'Salle 8',
          authorId: teacherFor(second).id,
        },
        {
          kind: 'examen',
          title: 'Examen de mathématiques n° 1',
          subjectId: 'mathematiques',
          classId: schoolClass.id,
          date: day('2026-10-13'),
          startTime: '09:00',
          endTime: '11:00',
          place: 'Salle 12',
          description: 'Chapitres 1 à 3. Calculatrice autorisée.',
          coefficient: 2,
          authorId: teacherFor('mathematiques').id,
        },
        {
          kind: 'controle',
          title: second === 'francais' ? 'Contrôle de français' : "Contrôle d'arabe",
          subjectId: second,
          classId: schoolClass.id,
          date: day('2026-10-15'),
          startTime: '10:15',
          endTime: '11:15',
          authorId: teacherFor(second).id,
        },
        {
          kind: 'devoir',
          title: 'Exercices 4 à 9 page 52',
          subjectId: 'physique-chimie',
          classId: schoolClass.id,
          date: day('2026-10-26'),
          description: 'À rendre en début de cours.',
          authorId: teacherFor('physique-chimie').id,
        },
      );
    }
  }

  events.push(
    {
      kind: 'reunion',
      title: "Réunion d'information sur le Bac français",
      sectionId: sections.get('bac')!,
      date: day('2026-11-02'),
      startTime: '14:00',
      endTime: '15:30',
      place: 'Grande salle',
      authorId: teacherFor('francais').id,
    },
    {
      kind: 'activite',
      title: 'Journée sportive',
      date: day('2026-11-05'),
      place: 'Terrain de sport',
      description:
        "Tenue de sport obligatoire. Tournois de football, basket et course d'orientation.",
      authorId: teacherFor('eps').id,
    },
  );
  const createdEvents = await prisma.event.createManyAndReturn({ data: events });

  // Grades, homework, attendance ----------------------------------------------------------------------
  const grades: Prisma.GradeCreateManyInput[] = [];
  const completions: Prisma.HomeworkCompletionCreateManyInput[] = [];
  const attendance: Prisma.AttendanceCreateManyInput[] = [];
  const mark = () => Math.round((8 + random() * 12) * 2) / 2; // 8 to 20, by halves

  for (const roster of classRosters) {
    const ofClass = createdEvents.filter((e) => e.classId === roster.classId);
    const exam = ofClass.find((e) => e.kind === 'examen')!;
    const test = ofClass.find((e) => e.kind === 'controle')!;
    const homework = ofClass.find((e) => e.kind === 'devoir')!;
    const mathsCourse = ofClass.find((e) => e.kind === 'cours' && e.subjectId === 'mathematiques')!;

    roster.students.forEach((studentId, i) => {
      grades.push(
        {
          eventId: exam.id,
          studentId,
          score: mark(),
          outOf: 20,
          published: true,
          gradedById: exam.authorId,
        },
        {
          eventId: test.id,
          studentId,
          score: Math.round(random() * 20) / 2,
          outOf: 10,
          published: false,
          gradedById: test.authorId,
        },
      );
      if (i % 2 === 0) completions.push({ eventId: homework.id, studentId });
      attendance.push({
        eventId: mathsCourse.id,
        studentId,
        date: day('2026-10-11'),
        status: i === 0 ? 'absent' : i === 1 ? 'late' : 'present',
        minutesLate: i === 1 ? 10 : null,
        recordedById: mathsCourse.authorId,
      });
    });
  }
  await prisma.grade.createMany({ data: grades });
  await prisma.homeworkCompletion.createMany({ data: completions });
  await prisma.attendance.createMany({ data: attendance });

  // Announcements -----------------------------------------------------------------------------------
  await prisma.post.createMany({
    data: [
      {
        title: "Bienvenue dans l'espace élèves",
        body: 'Retrouvez ici votre emploi du temps, vos devoirs, vos notes et vos absences. Bonne année scolaire à toutes et à tous !',
        authorId: admin.id,
      },
      {
        title: 'Calculatrices pour le Bac nationale',
        body: 'Les modèles autorisés aux examens sont affichés au secrétariat.',
        sectionId: sections.get('nationale')!,
        subjectId: 'mathematiques',
        authorId: teacherFor('mathematiques').userId,
      },
      {
        title: 'Lectures du trimestre',
        body: 'Procurez-vous « Le Petit Prince » pour la rentrée de novembre.',
        classId: classRosters.find((r) => r.section === 'bac' && r.code === 'seconde')!.classId,
        subjectId: 'francais',
        authorId: teacherFor('francais').userId,
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: 'seed.run',
      entity: 'database',
      entityId: 'demo',
      after: { students: studentNumber },
    },
  });

  writeFileSync(
    CREDENTIALS_FILE,
    [
      '# CDLS demo accounts (local only, never commit)',
      '',
      `Generated by \`npm run db:seed\` on ${new Date().toISOString()}. Re-seeding changes every password.`,
      '',
      '| Role | E-mail | Password |',
      '|---|---|---|',
      `| admin | admin@${DOMAIN} | ${credentials.admin} |`,
      `| teacher (all ${TEACHERS.length}) | see below | ${credentials.teacher} |`,
      `| student (all ${studentNumber}) | see below | ${credentials.student} |`,
      '',
      '## Teachers',
      ...teacherEmails.map((e) => `- ${e}`),
      '',
      '## Students (two per class)',
      ...studentEmails.map((e) => `- ${e}`),
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o600 },
  );

  console.log(
    `Seeded ${YEAR.label}: ${classRosters.length} classes, ${TEACHERS.length} teachers, ${studentNumber} students, ` +
      `${createdEvents.length} events, ${grades.length} grades. Demo credentials written to apps/api/demo-credentials.local.md`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
