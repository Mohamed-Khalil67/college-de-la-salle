import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../access/access.service.js';
import { ClassesService } from '../classes/classes.service.js';
import { PeriodsService } from '../periods/periods.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GradesService } from './grades.service.js';

// The archived-year guard reads the database (raw SQL); its own behaviour is covered by the e2e tests.
vi.mock('../school-years/year-guard.js', () => ({ assertClassWritable: vi.fn(), assertYearWritable: vi.fn() }));

const TEACHER: AuthUser = {
  id: 'u-t',
  email: 't@x.y',
  role: 'teacher',
  firstName: 'T',
  lastName: 'T',
  studentId: null,
  teacherId: 't1',
  classId: null,
  isCoordinator: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
};

const EXAM_TYPE = {
  id: 'type-examen',
  code: 'examen',
  label: 'Examen',
  colour: 'red',
  icon: 'file-text',
  gradable: true,
  repeatable: false,
  homework: false,
};

const event = (overrides = {}) => ({
  id: 'e1',
  activityTypeId: 'type-examen',
  activityType: EXAM_TYPE,
  periodId: 'p1',
  roomId: null,
  room: null,
  title: 'Examen',
  subjectId: 'mathematiques',
  classId: 'c1',
  sectionId: null,
  date: new Date('2026-10-13T00:00:00Z'),
  startTime: null,
  endTime: null,
  repeatUntil: null,
  place: '',
  description: '',
  attachments: [],
  coefficient: 2,
  authorId: 't1',
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { user: { firstName: 'T', lastName: 'T' } },
  schoolClass: null,
  section: null,
  ...overrides,
});

const grade = (studentId: string, score: number, published = false) => ({
  id: `g-${studentId}`,
  eventId: 'e1',
  studentId,
  score,
  outOf: 20,
  comment: '',
  published,
  gradedById: 't1',
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('GradesService', () => {
  const tx = {
    grade: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    event: { findUnique: vi.fn() },
    grade: { findMany: vi.fn().mockResolvedValue([]) },
    student: { findUnique: vi.fn() },
    period: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    classSubject: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const access = { assertTeachesClass: vi.fn(), assertCanReadStudent: vi.fn(), placement: vi.fn() };
  const classes = {
    roster: vi.fn().mockResolvedValue([
      { id: 's1', userId: 'u1', firstName: 'A', lastName: 'A', studentNumber: null },
      { id: 's2', userId: 'u2', firstName: 'B', lastName: 'B', studentNumber: null },
    ]),
  };
  const periods = { assertOpen: vi.fn(), lockOpen: vi.fn() };
  let grades: GradesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.event.findUnique.mockResolvedValue(event());
    access.assertTeachesClass.mockResolvedValue(undefined);
    periods.assertOpen.mockResolvedValue(undefined);
    periods.lockOpen.mockResolvedValue(undefined);
    tx.grade.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        GradesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        { provide: ClassesService, useValue: classes },
        { provide: PeriodsService, useValue: periods },
      ],
    }).compile();
    grades = moduleRef.get(GradesService);
  });

  it('checks that the user teaches the class and the subject', async () => {
    access.assertTeachesClass.mockRejectedValue(new ForbiddenException());
    await expect(grades.save('e1', { entries: [] }, TEACHER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(access.assertTeachesClass).toHaveBeenCalledWith(TEACHER, 'c1', 'mathematiques');
  });

  it('refuses events that are not graded, students outside the class and marks above the scale', async () => {
    prisma.event.findUnique.mockResolvedValueOnce(
      event({ activityType: { ...EXAM_TYPE, gradable: false } }),
    );
    await expect(grades.save('e1', { entries: [] }, TEACHER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      grades.save('e1', { entries: [{ studentId: 'intrus', score: 10 }] }, TEACHER),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      grades.save('e1', { entries: [{ studentId: 's1', score: 21 }] }, TEACHER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses grade changes once the event period is closed', async () => {
    periods.assertOpen.mockRejectedValue(new ConflictException('clôturée'));
    await expect(
      grades.save('e1', { entries: [{ studentId: 's1', score: 10 }] }, TEACHER),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(grades.publish('e1', { published: true }, TEACHER)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(periods.assertOpen).toHaveBeenCalledWith(prisma, 'p1');
    expect(tx.grade.create).not.toHaveBeenCalled();
  });

  it('re-checks the period under a lock inside the write, so a concurrent close wins', async () => {
    periods.lockOpen.mockRejectedValue(new ConflictException('clôturée'));
    await expect(
      grades.save('e1', { entries: [{ studentId: 's1', score: 10 }] }, TEACHER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(periods.lockOpen).toHaveBeenCalledWith(tx, 'p1');
    expect(tx.grade.create).not.toHaveBeenCalled();
    await expect(grades.publish('e1', { published: true }, TEACHER)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.grade.updateMany).not.toHaveBeenCalled();
  });

  it('creates, corrects and removes grades, with one audit row each', async () => {
    tx.grade.findMany.mockResolvedValue([grade('s1', 12, true), grade('s2', 9, true)]);
    tx.grade.update.mockResolvedValue(grade('s1', 14, true));
    await grades.save(
      'e1',
      {
        entries: [
          { studentId: 's1', score: 14 },
          { studentId: 's2', score: null },
        ],
      },
      TEACHER,
    );
    expect(tx.grade.update).toHaveBeenCalledWith({
      where: { id: 'g-s1' },
      data: { score: 14, outOf: 20, comment: '', gradedById: 't1' },
    });
    expect(tx.grade.delete).toHaveBeenCalledWith({ where: { id: 'g-s2' } });
    const rows = tx.auditLog.createMany.mock.calls[0]![0].data as {
      action: string;
      actorId: string;
    }[];
    expect(rows.map((r) => r.action)).toEqual(['grade.update', 'grade.delete']);
    expect(rows.every((r) => r.actorId === TEACHER.id)).toBe(true);
  });

  it('gives a late grade the published state of the others', async () => {
    tx.grade.findMany.mockResolvedValue([grade('s1', 12, true)]);
    tx.grade.create.mockResolvedValue(grade('s2', 11, true));
    await grades.save('e1', { entries: [{ studentId: 's2', score: 11 }] }, TEACHER);
    expect(tx.grade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ studentId: 's2', score: 11, published: true }),
    });
  });

  describe('forStudent', () => {
    const STUDENT: AuthUser = {
      ...TEACHER,
      id: 'u-s',
      role: 'student',
      studentId: 's1',
      teacherId: null,
      classId: 'c1',
    };
    const published = (subjectId: string, score: number) => ({
      ...grade('s1', score, true),
      id: `g-${subjectId}-${score}`,
      event: { ...event({ subjectId, coefficient: 1 }), id: `e-${subjectId}` },
    });

    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({ id: 's1' });
      prisma.grade.findMany.mockResolvedValue([
        published('mathematiques', 14),
        published('dessin', 12),
      ]);
      prisma.classSubject.findMany.mockResolvedValue([
        { classId: 'c1', subjectId: 'mathematiques', coefficient: 4, subject: { name: 'Mathématiques' } },
      ]);
    });

    it("gives each subject the coefficient of the student's current class, null when not taught there", async () => {
      access.placement.mockResolvedValue({ classId: 'c1' });
      const result = await grades.forStudent('s1', {}, STUDENT);
      expect(access.assertCanReadStudent).toHaveBeenCalledWith(STUDENT, 's1');
      expect(prisma.classSubject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { classId: { in: ['c1'] } } }),
      );
      expect(result.subjects.map((s) => [s.subjectId, s.average, s.coefficient])).toEqual([
        ['dessin', 12, null],
        ['mathematiques', 14, 4],
      ]);
    });

    it("uses the class of the period's school year, and the events' stored period", async () => {
      prisma.period.findUnique.mockResolvedValue({
        id: 'p0',
        schoolYearId: 'y0',
        startsOn: new Date('2025-09-01T00:00:00Z'),
        endsOn: new Date('2025-12-20T00:00:00Z'),
      });
      prisma.enrollment.findMany.mockResolvedValue([
        { classId: 'c-old', enrolledOn: new Date('2025-09-01T00:00:00Z'), leftOn: null },
      ]);
      prisma.classSubject.findMany.mockResolvedValue([
        { classId: 'c-old', subjectId: 'mathematiques', coefficient: 4, subject: { name: 'Mathématiques' } },
      ]);
      await grades.forStudent('s1', { periodId: 'p0' }, STUDENT);
      // By periodId, never by the period's dates (editing them must not move grades).
      expect(prisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: expect.objectContaining({ OR: [{ periodId: 'p0' }] }),
          }),
        }),
      );
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ studentId: 's1', schoolYearId: 'y0' }),
        }),
      );
      expect(prisma.classSubject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { classId: { in: ['c-old'] } } }),
      );
      expect(access.placement).not.toHaveBeenCalled();
    });

    it('has no coefficients for a student without a class', async () => {
      access.placement.mockResolvedValue(null);
      const result = await grades.forStudent('s1', {}, STUDENT);
      expect(result.subjects.every((s) => s.coefficient === null)).toBe(true);
      expect(prisma.classSubject.findMany).not.toHaveBeenCalled();
    });
  });
});
