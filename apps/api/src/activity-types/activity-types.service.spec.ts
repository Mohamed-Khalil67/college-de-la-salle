import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityTypesService } from './activity-types.service.js';

const user = (role: AuthUser['role'], over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u',
  email: 'x@y.z',
  role,
  firstName: 'X',
  lastName: 'Y',
  studentId: null,
  teacherId: role === 'teacher' ? 't1' : null,
  classId: null,
  isCoordinator: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
  ...over,
});
const ADMIN = user('admin');
const TEACHER = user('teacher');

const type = (over: Record<string, unknown> = {}) => ({
  id: 'ty1',
  code: 'quiz',
  label: 'Quiz',
  colour: 'green',
  icon: 'check',
  gradable: true,
  repeatable: false,
  homework: false,
  isSystem: false,
  ownerTeacherId: 't1',
  owner: { user: { firstName: 'T', lastName: 'T' } },
  sortOrder: 100,
  archivedAt: null,
  ...over,
});
const dto = {
  label: 'Quiz',
  colour: 'green',
  icon: 'check',
  gradable: true,
  repeatable: false,
  homework: false,
} as const;

describe('ActivityTypesService', () => {
  const tx = {
    activityType: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    activityType: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    event: { count: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  let types: ActivityTypesService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    prisma.activityType.findUnique.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityTypesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    types = moduleRef.get(ActivityTypesService);
  });

  describe('visibility', () => {
    it('shows a teacher the school-wide types and their own; the admin everything', async () => {
      prisma.activityType.findMany.mockResolvedValue([]);
      await types.list({}, TEACHER);
      expect(prisma.activityType.findMany.mock.calls[0]![0].where).toMatchObject({
        OR: [{ ownerTeacherId: null }, { ownerTeacherId: 't1' }],
        archivedAt: null,
      });
      await types.list({ includeArchived: true }, ADMIN);
      expect(prisma.activityType.findMany.mock.calls[1]![0].where).toEqual({});
    });

    it('answers 404 for a type an event may not use, 400 for an archived one', async () => {
      prisma.activityType.findFirst.mockResolvedValue(null);
      await expect(types.usable('ty1', TEACHER)).rejects.toBeInstanceOf(NotFoundException);
      prisma.activityType.findFirst.mockResolvedValue(type({ archivedAt: new Date() }));
      await expect(types.usable('ty1', TEACHER)).rejects.toBeInstanceOf(BadRequestException);
      // An event that already has the archived type keeps it.
      await expect(types.usable('ty1', TEACHER, 'ty1')).resolves.toMatchObject({ id: 'ty1' });
    });
  });

  describe('create', () => {
    it('gives a teacher a private type and the admin a school-wide one', async () => {
      tx.activityType.create.mockResolvedValue(type());
      await types.create(dto, TEACHER);
      expect(tx.activityType.create.mock.calls[0]![0].data).toMatchObject({
        ownerTeacherId: 't1',
        code: 'quiz',
      });
      await types.create(dto, ADMIN);
      expect(tx.activityType.create.mock.calls[1]![0].data).toMatchObject({ ownerTeacherId: null });
    });

    it('numbers the code when the slug is taken', async () => {
      prisma.activityType.findUnique.mockResolvedValueOnce(type()).mockResolvedValue(null);
      tx.activityType.create.mockResolvedValue(type({ code: 'quiz-2' }));
      await types.create(dto, TEACHER);
      expect(tx.activityType.create.mock.calls[0]![0].data.code).toBe('quiz-2');
    });

    it('never makes homework repeat weekly, and refuses a student', async () => {
      await expect(
        types.create({ ...dto, homework: true, repeatable: true }, TEACHER),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(types.create(dto, user('student'))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update', () => {
    it('refuses another teacher’s private type', async () => {
      prisma.activityType.findFirst.mockResolvedValue(null);
      await expect(types.update('ty1', { label: 'Volé' }, TEACHER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets a teacher edit only their own, not a school-wide type', async () => {
      prisma.activityType.findFirst.mockResolvedValue(type({ ownerTeacherId: null }));
      await expect(types.update('ty1', { label: 'Mien' }, TEACHER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      prisma.activityType.findFirst.mockResolvedValue(type());
      tx.activityType.update.mockResolvedValue(type({ label: 'Mien' }));
      await expect(types.update('ty1', { label: 'Mien' }, TEACHER)).resolves.toMatchObject({
        label: 'Mien',
      });
    });

    it('keeps the flags of system types and never archives them', async () => {
      prisma.activityType.findFirst.mockResolvedValue(
        type({ isSystem: true, ownerTeacherId: null }),
      );
      await expect(types.update('ty1', { gradable: false }, ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(types.update('ty1', { archived: true }, ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      tx.activityType.update.mockResolvedValue(type({ isSystem: true, colour: 'red' }));
      await expect(
        types.update('ty1', { colour: 'red', gradable: true }, ADMIN),
      ).resolves.toMatchObject({ colour: 'red' });
    });

    it('locks the flags once events use the type', async () => {
      prisma.activityType.findFirst.mockResolvedValue(type());
      prisma.event.count.mockResolvedValue(2);
      await expect(types.update('ty1', { gradable: false }, TEACHER)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // Unchanged flags and cosmetic edits stay possible.
      tx.activityType.update.mockResolvedValue(type({ colour: 'navy' }));
      await expect(
        types.update('ty1', { gradable: true, colour: 'navy' }, TEACHER),
      ).resolves.toBeDefined();
    });
  });

  describe('promote', () => {
    it('makes a private type school-wide, audited', async () => {
      prisma.activityType.findUnique.mockResolvedValue(type());
      tx.activityType.update.mockResolvedValue(type({ ownerTeacherId: null, owner: null }));
      const promoted = await types.promote('ty1', ADMIN);
      expect(promoted).toMatchObject({ ownerTeacherId: null, ownerName: null });
      expect(tx.activityType.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ownerTeacherId: null } }),
      );
      expect(tx.auditLog.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        action: 'activity_type.promote',
      });
    });

    it('refuses a type that is already school-wide or archived, and an unknown one', async () => {
      prisma.activityType.findUnique.mockResolvedValue(type({ ownerTeacherId: null }));
      await expect(types.promote('ty1', ADMIN)).rejects.toBeInstanceOf(ConflictException);
      prisma.activityType.findUnique.mockResolvedValue(type({ archivedAt: new Date() }));
      await expect(types.promote('ty1', ADMIN)).rejects.toBeInstanceOf(ConflictException);
      prisma.activityType.findUnique.mockResolvedValue(null);
      await expect(types.promote('ty1', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('refuses system types and types in use, deletes the rest', async () => {
      prisma.activityType.findFirst.mockResolvedValue(
        type({ isSystem: true, ownerTeacherId: null }),
      );
      await expect(types.remove('ty1', ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      prisma.activityType.findFirst.mockResolvedValue(type());
      prisma.event.count.mockResolvedValue(1);
      await expect(types.remove('ty1', TEACHER)).rejects.toBeInstanceOf(ConflictException);
      prisma.event.count.mockResolvedValue(0);
      await types.remove('ty1', TEACHER);
      expect(tx.activityType.delete).toHaveBeenCalledWith({ where: { id: 'ty1' } });
    });
  });
});
