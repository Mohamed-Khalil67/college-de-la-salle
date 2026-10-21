import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SectionChangesService } from './section-changes.service.js';

const ADMIN: AuthUser = {
  id: 'admin-user',
  email: 'admin@demo.cdls.test',
  role: 'admin',
  firstName: 'Nadia',
  lastName: 'Fahmy',
  studentId: null,
  teacherId: null,
  classId: null,
  isCoordinator: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
};

const STUDENT: AuthUser = {
  ...ADMIN,
  id: 'student-user',
  role: 'student',
  studentId: 's1',
  sectionCode: 'nationale',
};

const REQUEST = {
  id: 'r1',
  studentId: 's1',
  fromSectionId: 'sec-nat',
  toSectionId: 'sec-bac',
  status: 'pending',
};

/** The row returned after a decision (toSectionChangeDto). */
const DTO_ROW = {
  ...REQUEST,
  status: 'approved',
  reason: 'Orientation',
  requestedById: 'student-user',
  decidedAt: new Date('2026-10-21T08:00:00Z'),
  decisionNote: '',
  createdAt: new Date('2026-10-20T08:00:00Z'),
  student: {
    userId: 'student-user',
    user: { firstName: 'Nour', lastName: 'Saad', email: 'nour.saad@demo.cdls.test' },
    enrollments: [{ schoolClass: { label: 'Seconde' } }],
  },
  fromSection: { code: 'nationale' },
  toSection: { code: 'bac' },
  requestedBy: { firstName: 'Nour', lastName: 'Saad' },
  decidedBy: { firstName: 'Nadia', lastName: 'Fahmy' },
  newClass: { label: 'Seconde' },
};

describe('SectionChangesService', () => {
  const createRequest = vi.fn();
  const tx = {
    sectionChangeRequest: { findUnique: vi.fn(), updateMany: vi.fn(), create: createRequest },
    student: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    schoolClass: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((work: (t: typeof tx) => unknown) => work(tx)),
    sectionChangeRequest: { findUnique: vi.fn(), findFirst: vi.fn(), create: createRequest },
    student: { findUnique: vi.fn() },
    section: { findUnique: vi.fn() },
  };
  let service: SectionChangesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    tx.sectionChangeRequest.findUnique.mockResolvedValue(REQUEST);
    tx.sectionChangeRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.student.findUniqueOrThrow.mockResolvedValue({
      id: 's1',
      sectionId: 'sec-nat',
      user: { status: 'active' },
    });
    tx.schoolClass.findUnique.mockResolvedValue({
      id: 'c-bac',
      sectionId: 'sec-bac',
      schoolYearId: 'y1',
      schoolYear: { isCurrent: true },
    });
    tx.enrollment.findFirst.mockResolvedValue({ id: 'e-old', classId: 'c-nat' });
    prisma.sectionChangeRequest.findUnique.mockResolvedValue(DTO_ROW);
    const moduleRef = await Test.createTestingModule({
      providers: [SectionChangesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SectionChangesService);
  });

  describe('approve', () => {
    it('moves the student in one transaction: claim, close, enrol, section, audit', async () => {
      const result = await service.approve('r1', { classId: 'c-bac', note: 'OK' }, ADMIN);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.sectionChangeRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'pending' },
        data: expect.objectContaining({
          status: 'approved',
          decidedById: 'admin-user',
          decisionNote: 'OK',
          newClassId: 'c-bac',
        }),
      });
      expect(tx.enrollment.findFirst).toHaveBeenCalledWith({
        where: { studentId: 's1', schoolYearId: 'y1', leftOn: null },
      });
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'e-old' },
        data: { leftOn: expect.any(Date) },
      });
      expect(tx.enrollment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ studentId: 's1', classId: 'c-bac', schoolYearId: 'y1' }),
      });
      expect(tx.student.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { sectionId: 'sec-bac' },
      });
      expect(tx.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            actorId: 'admin-user',
            action: 'student.section_change',
            entity: 'student',
            entityId: 's1',
            before: { sectionId: 'sec-nat', classId: 'c-nat' },
            after: { sectionId: 'sec-bac', classId: 'c-bac', requestId: 'r1' },
          }),
        ],
      });
      // Grades are never touched: the transaction client has no grade model at all.
      expect(result).toMatchObject({ status: 'approved', fromSection: 'nationale', toSection: 'bac' });
    });

    it('refuses a request that is already decided, before changing anything', async () => {
      tx.sectionChangeRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve('r1', { classId: 'c-bac' }, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.enrollment.create).not.toHaveBeenCalled();
      expect(tx.student.update).not.toHaveBeenCalled();
    });

    it('refuses a class outside the new section (the transaction is rolled back)', async () => {
      tx.schoolClass.findUnique.mockResolvedValue({
        id: 'c-nat-2',
        sectionId: 'sec-nat',
        schoolYearId: 'y1',
        schoolYear: { isCurrent: true },
      });
      await expect(service.approve('r1', { classId: 'c-nat-2' }, ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.enrollment.create).not.toHaveBeenCalled();
      expect(tx.auditLog.createMany).not.toHaveBeenCalled();
    });

    it('refuses when the student changed section since the request', async () => {
      tx.student.findUniqueOrThrow.mockResolvedValue({
        id: 's1',
        sectionId: 'sec-bac',
        user: { status: 'active' },
      });
      await expect(service.approve('r1', { classId: 'c-bac' }, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('enrols a student who had no open enrolment without closing anything', async () => {
      tx.enrollment.findFirst.mockResolvedValue(null);
      await service.approve('r1', { classId: 'c-bac' }, ADMIN);
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      expect(tx.enrollment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        id: 's1',
        sectionId: 'sec-nat',
        user: { status: 'active' },
      });
      prisma.section.findUnique.mockResolvedValue({ id: 'sec-bac', code: 'bac' });
      prisma.sectionChangeRequest.findFirst.mockResolvedValue(null);
      prisma.sectionChangeRequest.create.mockResolvedValue({ ...DTO_ROW, status: 'pending' });
    });

    it('lets a student ask only for themself', async () => {
      await expect(
        service.create({ studentId: 'someone-else', toSection: 'bac', reason: 'x' }, STUDENT),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await service.create({ toSection: 'bac', reason: 'Orientation' }, STUDENT);
      expect(prisma.sectionChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 's1',
            fromSectionId: 'sec-nat',
            toSectionId: 'sec-bac',
            requestedById: 'student-user',
          }),
        }),
      );
    });

    it('refuses a second pending request and the current section', async () => {
      prisma.sectionChangeRequest.findFirst.mockResolvedValue({ id: 'r0' });
      await expect(
        service.create({ toSection: 'bac', reason: 'x' }, STUDENT),
      ).rejects.toBeInstanceOf(ConflictException);
      prisma.section.findUnique.mockResolvedValue({ id: 'sec-nat', code: 'nationale' });
      await expect(
        service.create({ toSection: 'nationale', reason: 'x' }, STUDENT),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a concurrent duplicate (unique index) to 409', async () => {
      prisma.sectionChangeRequest.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.create({ studentId: 's1', toSection: 'bac', reason: 'x' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
