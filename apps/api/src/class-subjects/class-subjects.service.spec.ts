import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClassSubjectsService } from './class-subjects.service.js';

const ADMIN: AuthUser = {
  id: 'u1',
  email: 'a@x.y',
  role: 'admin',
  firstName: 'A',
  lastName: 'A',
  studentId: null,
  teacherId: null,
  classId: null,
  isCoordinator: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
};

const klass = (id: string, section = 'bac') => ({ id, section: { code: section } });
const subject = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  archivedAt: null,
  sections: ['nationale', 'bac'],
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'cs1',
  classId: 'c1',
  subjectId: 'maths',
  coefficient: 4,
  hoursPerWeek: null,
  subject: { name: 'maths' },
  assignments: [],
  ...over,
});

describe('ClassSubjectsService', () => {
  const tx = {
    $queryRaw: vi.fn(),
    classSubject: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    grade: { count: vi.fn() },
    event: { count: vi.fn() },
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    schoolClass: { findUnique: vi.fn() },
    subject: { findUnique: vi.fn() },
    classSubject: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  let service: ClassSubjectsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    prisma.schoolClass.findUnique.mockResolvedValue(klass('c1'));
    prisma.classSubject.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [ClassSubjectsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ClassSubjectsService);
  });

  describe('create', () => {
    it('adds a subject with a default coefficient of 1', async () => {
      prisma.subject.findUnique.mockResolvedValue(subject('maths'));
      prisma.classSubject.findUnique.mockResolvedValue(null);
      tx.classSubject.create.mockResolvedValue(row({ coefficient: 1 }));
      await service.create('c1', { subjectId: 'maths' }, ADMIN);
      expect(tx.classSubject.create.mock.calls[0]![0].data).toMatchObject({
        coefficient: 1,
        hoursPerWeek: null,
      });
    });

    it('refuses unknown, archived, off-section and duplicate subjects', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expect(service.create('c1', { subjectId: 'x' }, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      prisma.subject.findUnique.mockResolvedValue(subject('x', { archivedAt: new Date() }));
      await expect(service.create('c1', { subjectId: 'x' }, ADMIN)).rejects.toThrow(/archivée/);
      prisma.subject.findUnique.mockResolvedValue(subject('x', { sections: ['nationale'] }));
      await expect(service.create('c1', { subjectId: 'x' }, ADMIN)).rejects.toThrow(
        /pas enseignée dans cette section/,
      );
      prisma.subject.findUnique.mockResolvedValue(subject('maths'));
      prisma.classSubject.findUnique.mockResolvedValue(row());
      await expect(service.create('c1', { subjectId: 'maths' }, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.classSubject.create).not.toHaveBeenCalled();
    });

    it('404s for an unknown class', async () => {
      prisma.schoolClass.findUnique.mockResolvedValue(null);
      await expect(service.create('nope', { subjectId: 'maths' }, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('changes coefficient and hours and audits before and after', async () => {
      prisma.classSubject.findUnique.mockResolvedValue(row());
      tx.classSubject.update.mockResolvedValue(row({ coefficient: 6, hoursPerWeek: 2 }));
      const updated = await service.update('cs1', { coefficient: 6, hoursPerWeek: 2 }, ADMIN);
      expect(updated).toMatchObject({ coefficient: 6, hoursPerWeek: 2 });
      expect(tx.auditLog.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        action: 'class_subject.update',
        before: { coefficient: 4 },
        after: { coefficient: 6 },
      });
    });
  });

  describe('remove', () => {
    beforeEach(() => tx.classSubject.findUnique.mockResolvedValue(row()));

    it('refuses while a teacher is assigned or grades exist', async () => {
      tx.classSubject.findUnique.mockResolvedValue(
        row({
          assignments: [
            { id: 'a1', teacherId: 't1', teacher: { user: { firstName: 'T', lastName: 'T' } } },
          ],
        }),
      );
      await expect(service.remove('cs1', ADMIN)).rejects.toThrow(/encore des enseignants/);
      tx.classSubject.findUnique.mockResolvedValue(row());
      tx.grade.count.mockResolvedValue(3);
      await expect(service.remove('cs1', ADMIN)).rejects.toThrow(/notes existent/);
      expect(tx.classSubject.delete).not.toHaveBeenCalled();
    });

    it('refuses while graded events of that subject exist in the class', async () => {
      tx.grade.count.mockResolvedValue(0);
      tx.event.count.mockResolvedValue(2);
      await expect(service.remove('cs1', ADMIN)).rejects.toThrow(/événements notés/);
      expect(tx.event.count.mock.calls[0]![0].where).toMatchObject({
        classId: 'c1',
        subjectId: 'maths',
        activityType: { gradable: true },
      });
      expect(tx.classSubject.delete).not.toHaveBeenCalled();
    });

    it('locks the row, then deletes it, audited', async () => {
      tx.grade.count.mockResolvedValue(0);
      tx.event.count.mockResolvedValue(0);
      await service.remove('cs1', ADMIN);
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.classSubject.delete).toHaveBeenCalledWith({ where: { id: 'cs1' } });
      expect(tx.auditLog.createMany).toHaveBeenCalled();
    });
  });

  describe('copy', () => {
    const source = (
      id: string,
      coefficient: number,
      hours: number | null,
      over: Record<string, unknown> = {},
    ) => ({
      subjectId: id,
      coefficient,
      hoursPerWeek: hours,
      subject: subject(id, over),
    });

    it('upserts the source subjects with their coefficient and hours, without teachers', async () => {
      prisma.schoolClass.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        klass(where.id),
      );
      prisma.classSubject.findMany
        .mockResolvedValueOnce([source('maths', 4, 5), source('arabe', 2, null)])
        .mockResolvedValueOnce([]);
      await service.copy('c2', 'c1', ADMIN);
      expect(tx.classSubject.upsert).toHaveBeenCalledTimes(2);
      expect(tx.classSubject.upsert.mock.calls[0]![0]).toMatchObject({
        where: { classId_subjectId: { classId: 'c2', subjectId: 'maths' } },
        create: { classId: 'c2', subjectId: 'maths', coefficient: 4, hoursPerWeek: 5 },
        update: { coefficient: 4, hoursPerWeek: 5 },
      });
      expect(JSON.stringify(tx.classSubject.upsert.mock.calls)).not.toContain('assignments');
    });

    it('skips archived subjects and those of another section', async () => {
      prisma.schoolClass.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        klass(where.id, 'bac'),
      );
      prisma.classSubject.findMany
        .mockResolvedValueOnce([
          source('maths', 4, null),
          source('old', 1, null, { archivedAt: new Date() }),
          source('religion', 1, null, { sections: ['nationale'] }),
        ])
        .mockResolvedValueOnce([]);
      await service.copy('c2', 'c1', ADMIN);
      expect(tx.classSubject.upsert.mock.calls.map((c) => c[0].create.subjectId)).toEqual([
        'maths',
      ]);
    });

    it('refuses to copy a class onto itself', async () => {
      await expect(service.copy('c1', 'c1', ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
