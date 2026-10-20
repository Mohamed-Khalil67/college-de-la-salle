import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../access/access.service.js';
import { ClassesService } from '../classes/classes.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GradesService } from './grades.service.js';

const TEACHER: AuthUser = {
  id: 'u-t',
  email: 't@x.y',
  role: 'teacher',
  firstName: 'T',
  lastName: 'T',
  studentId: null,
  teacherId: 't1',
};

const event = (overrides = {}) => ({
  id: 'e1',
  kind: 'examen',
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
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const access = { assertTeachesClass: vi.fn() };
  const classes = {
    roster: vi.fn().mockResolvedValue([
      { id: 's1', userId: 'u1', firstName: 'A', lastName: 'A', studentNumber: null },
      { id: 's2', userId: 'u2', firstName: 'B', lastName: 'B', studentNumber: null },
    ]),
  };
  let grades: GradesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.event.findUnique.mockResolvedValue(event());
    access.assertTeachesClass.mockResolvedValue(undefined);
    tx.grade.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        GradesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        { provide: ClassesService, useValue: classes },
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
    prisma.event.findUnique.mockResolvedValueOnce(event({ kind: 'cours' }));
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
});
