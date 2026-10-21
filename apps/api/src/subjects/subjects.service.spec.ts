import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { slugify, uniqueSlug } from '../common/slug.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubjectsService } from './subjects.service.js';

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
};
const subject = (over: Record<string, unknown> = {}) => ({
  id: 'maths',
  name: 'Mathématiques',
  group: 'Sciences',
  sections: ['nationale', 'bac'],
  archivedAt: null,
  ...over,
});

describe('slugify', () => {
  it('makes lower-case ASCII ids from French names', () => {
    expect(slugify('Physique-Chimie')).toBe('physique-chimie');
    expect(slugify('Éducation physique & sportive')).toBe('education-physique-sportive');
    expect(slugify('  Théâtre  ')).toBe('theatre');
    expect(slugify('الرياضيات')).toBe('x');
    expect(slugify('a'.repeat(80), 40)).toHaveLength(40);
  });

  it('numbers a slug that is taken', async () => {
    const taken = new Set(['arts', 'arts-2']);
    expect(await uniqueSlug('Arts', (s) => Promise.resolve(taken.has(s)))).toBe('arts-3');
    expect(await uniqueSlug('Danse', (s) => Promise.resolve(taken.has(s)))).toBe('danse');
  });
});

describe('SubjectsService', () => {
  const tx = { subject: { create: vi.fn(), update: vi.fn() }, auditLog: { createMany: vi.fn() } };
  const prisma = {
    subject: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    classSubject: { count: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  let subjects: SubjectsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    const moduleRef = await Test.createTestingModule({
      providers: [SubjectsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    subjects = moduleRef.get(SubjectsService);
  });

  it('hides archived subjects unless asked', async () => {
    prisma.subject.findMany.mockResolvedValue([]);
    await subjects.list({});
    expect(prisma.subject.findMany.mock.calls[0]![0].where).toEqual({ archivedAt: null });
    await subjects.list({ includeArchived: true });
    expect(prisma.subject.findMany.mock.calls[1]![0].where).toEqual({});
  });

  describe('create', () => {
    it('makes the id from the name, sections in school order', async () => {
      prisma.subject.findFirst.mockResolvedValue(null);
      prisma.subject.findUnique.mockResolvedValue(null);
      tx.subject.create.mockResolvedValue(
        subject({ id: 'theatre', name: 'Théâtre', sections: ['nationale', 'bac'] }),
      );
      const created = await subjects.create(
        { name: 'Théâtre', group: 'Arts', sections: ['bac', 'nationale'] },
        ADMIN,
      );
      expect(tx.subject.create.mock.calls[0]![0].data).toEqual({
        id: 'theatre',
        name: 'Théâtre',
        group: 'Arts',
        sections: ['nationale', 'bac'],
      });
      expect(created).toMatchObject({ id: 'theatre', archived: false });
    });

    it('refuses a name that exists (any case) and numbers a clashing id', async () => {
      prisma.subject.findFirst.mockResolvedValue(subject());
      await expect(
        subjects.create({ name: 'mathématiques', group: 'x', sections: ['bac'] }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      prisma.subject.findFirst.mockResolvedValue(null);
      prisma.subject.findUnique
        .mockResolvedValueOnce(subject({ id: 'arts' }))
        .mockResolvedValue(null);
      tx.subject.create.mockResolvedValue(subject({ id: 'arts-2' }));
      await subjects.create({ name: 'Arts', group: 'x', sections: ['bac'] }, ADMIN);
      expect(tx.subject.create.mock.calls[0]![0].data.id).toBe('arts-2');
    });
  });

  describe('update', () => {
    it('404s for an unknown subject', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expect(subjects.update('x', { name: 'y' }, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('renames without touching the id, audited', async () => {
      prisma.subject.findUnique.mockResolvedValue(subject());
      tx.subject.update.mockResolvedValue(subject({ name: 'Maths' }));
      await subjects.update('maths', { name: 'Maths' }, ADMIN);
      expect(tx.subject.update.mock.calls[0]![0]).toMatchObject({
        where: { id: 'maths' },
        data: { name: 'Maths' },
      });
      expect(tx.auditLog.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        action: 'subject.update',
        entityId: 'maths',
      });
    });

    it('refuses to remove a section while classes of that section have the subject', async () => {
      prisma.subject.findUnique.mockResolvedValue(subject());
      prisma.classSubject.count.mockResolvedValue(2);
      await expect(subjects.update('maths', { sections: ['nationale'] }, ADMIN)).rejects.toThrow(
        /classes de cette section/,
      );
      expect(prisma.classSubject.count.mock.calls[0]![0].where).toMatchObject({
        schoolClass: { section: { code: { in: ['bac'] } } },
      });
      expect(tx.subject.update).not.toHaveBeenCalled();
      prisma.classSubject.count.mockResolvedValue(0);
      tx.subject.update.mockResolvedValue(subject({ sections: ['nationale'] }));
      await expect(
        subjects.update('maths', { sections: ['nationale'] }, ADMIN),
      ).resolves.toMatchObject({ sections: ['nationale'] });
    });

    it('archives and restores, keeping the first archive date', async () => {
      const when = new Date('2026-10-01T00:00:00Z');
      prisma.subject.findUnique.mockResolvedValue(subject({ archivedAt: when }));
      tx.subject.update.mockResolvedValue(subject({ archivedAt: when }));
      await subjects.update('maths', { archived: true }, ADMIN);
      expect(tx.subject.update.mock.calls[0]![0].data.archivedAt).toBe(when);
      tx.subject.update.mockResolvedValue(subject());
      await subjects.update('maths', { archived: false }, ADMIN);
      expect(tx.subject.update.mock.calls[1]![0].data.archivedAt).toBeNull();
    });
  });
});
