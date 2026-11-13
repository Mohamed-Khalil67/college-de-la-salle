import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessService } from './access.service.js';

const user = (role: AuthUser['role'], ids: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u',
  email: 'x@y.z',
  role,
  firstName: 'X',
  lastName: 'Y',
  studentId: null,
  teacherId: null,
  classId: null,
  isPlanner: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
  ...ids,
});

describe('AccessService', () => {
  const prisma = {
    teachingAssignment: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    enrollment: { findFirst: vi.fn() },
    schoolYear: { findFirst: vi.fn() },
  };
  let access: AccessService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AccessService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    access = moduleRef.get(AccessService);
  });

  describe('assertTeachesClass', () => {
    it('lets admins through without a lookup', async () => {
      await expect(access.assertTeachesClass(user('admin'), 'c1')).resolves.toBeUndefined();
      expect(prisma.teachingAssignment.count).not.toHaveBeenCalled();
    });

    it('checks the class and the subject of a teacher', async () => {
      prisma.teachingAssignment.count.mockResolvedValue(1);
      await access.assertTeachesClass(user('teacher', { teacherId: 't1' }), 'c1', 'mathematiques');
      expect(prisma.teachingAssignment.count).toHaveBeenCalledWith({
        where: { teacherId: 't1', classSubject: { classId: 'c1', subjectId: 'mathematiques' } },
      });
    });

    it("refuses a teacher who doesn't teach the class, and every student", async () => {
      prisma.teachingAssignment.count.mockResolvedValue(0);
      await expect(
        access.assertTeachesClass(user('teacher', { teacherId: 't1' }), 'c1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        access.assertTeachesClass(user('student', { studentId: 's1' }), 'c1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCanSchedule (exams for any class)', () => {
    const planner = user('teacher', { teacherId: 't9', isPlanner: true });
    const adminPlanner = user('admin', { isPlanner: true });

    it('lets the admin and a planner set an exam or a test for a class they do not teach', async () => {
      prisma.teachingAssignment.count.mockResolvedValue(0);
      await expect(access.assertCanSchedule(planner, 'c1', 'maths', 'examen')).resolves.toBeUndefined();
      await expect(access.assertCanSchedule(planner, 'c1', 'maths', 'controle')).resolves.toBeUndefined();
      await expect(access.assertCanSchedule(adminPlanner, 'c1', 'maths', 'examen')).resolves.toBeUndefined();
      await expect(access.assertCanSchedule(user('admin'), 'c1', 'maths', 'examen')).resolves.toBeUndefined();
    });

    it('keeps every other type of another class with its teachers, even for a planner', async () => {
      prisma.teachingAssignment.count.mockResolvedValue(0);
      await expect(access.assertCanSchedule(planner, 'c1', 'maths', 'devoir')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a teacher who is not a planner and a student, exam type or not', async () => {
      prisma.teachingAssignment.count.mockResolvedValue(0);
      const teacher = user('teacher', { teacherId: 't1' });
      await expect(access.assertCanSchedule(teacher, 'c1', 'maths', 'examen')).rejects.toBeInstanceOf(ForbiddenException);
      const student = user('student', { studentId: 's1' });
      await expect(access.assertCanSchedule(student, 'c1', 'maths', 'examen')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        access.assertCanSchedule(user('student', { studentId: 's1', isPlanner: true }), 'c1', 'maths', 'examen'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('still lets a teacher set their own class\'s exam', async () => {
      prisma.teachingAssignment.count.mockResolvedValue(1);
      await expect(
        access.assertCanSchedule(user('teacher', { teacherId: 't1' }), 'c1', 'maths', 'examen'),
      ).resolves.toBeUndefined();
    });
  });

  describe('recorderFor', () => {
    const event = { authorId: null, classId: 'c1', subjectId: 'maths' };
    it('prefers the signed-in teacher, then the author', async () => {
      expect(await access.recorderFor(user('teacher', { teacherId: 't1' }), event)).toBe('t1');
      expect(await access.recorderFor(user('admin'), { ...event, authorId: 't2' })).toBe('t2');
    });
    it('falls back to a teacher of the class and subject, or says there is none', async () => {
      prisma.teachingAssignment.findFirst.mockResolvedValueOnce({ teacherId: 't3' });
      expect(await access.recorderFor(user('admin'), event)).toBe('t3');
      prisma.teachingAssignment.findFirst.mockResolvedValueOnce(null);
      await expect(access.recorderFor(user('admin'), event)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('assertCanReadStudent', () => {
    it('lets a student read only themselves', async () => {
      const me = user('student', { studentId: 's1' });
      await expect(access.assertCanReadStudent(me, 's1')).resolves.toBeUndefined();
      await expect(access.assertCanReadStudent(me, 's2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets a teacher read the students of their classes only', async () => {
      prisma.enrollment.findFirst.mockResolvedValue({
        schoolYearId: 'y',
        schoolClass: { id: 'c1', code: 'premiere', sectionId: 'sec', section: { code: 'bac' } },
      });
      prisma.teachingAssignment.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      const teacher = user('teacher', { teacherId: 't1' });
      await expect(access.assertCanReadStudent(teacher, 's1')).resolves.toBeUndefined();
      await expect(access.assertCanReadStudent(teacher, 's1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('audienceFor', () => {
    it('is the whole school, the section and the class', () => {
      const where = access.audienceFor({
        classId: 'c1',
        classCode: 'premiere',
        sectionId: 'sec',
        sectionCode: 'bac',
        schoolYearId: 'y',
      });
      expect(where).toEqual({
        OR: [
          { classId: null, sectionId: null },
          { classId: null, sectionId: 'sec' },
          { classId: 'c1' },
        ],
      });
    });

    it('is only the whole school for a student without a class', () => {
      expect(access.audienceFor(null)).toEqual({ classId: null, sectionId: null });
    });
  });
});
