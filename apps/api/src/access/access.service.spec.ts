import { ForbiddenException } from '@nestjs/common';
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
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
  ...ids,
});

describe('AccessService', () => {
  const prisma = {
    teachingAssignment: { count: vi.fn(), findMany: vi.fn() },
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
        where: { teacherId: 't1', classId: 'c1', subjectId: 'mathematiques' },
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
