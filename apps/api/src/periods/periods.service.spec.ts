import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PeriodsService } from './periods.service.js';

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

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const period = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  schoolYearId: 'y1',
  kind: 'trimester',
  sectionId: null,
  number: 1,
  label: '1er trimestre',
  startsOn: day('2026-09-06'),
  endsOn: day('2026-12-17'),
  closedAt: null,
  ...over,
});
const YEAR = {
  id: 'y1',
  label: '2026-2027',
  startsOn: day('2026-09-01'),
  endsOn: day('2027-06-30'),
};

describe('PeriodsService', () => {
  const tx = {
    $executeRaw: vi.fn(),
    period: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    reportCard: { count: vi.fn() },
    grade: { count: vi.fn() },
    event: { count: vi.fn() },
    $queryRaw: vi.fn(),
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    schoolYear: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    section: { findUnique: vi.fn() },
    period: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    schoolClass: { findUnique: vi.fn() },
    event: { count: vi.fn() },
    reportCard: { count: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  let periods: PeriodsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    prisma.schoolYear.findUnique.mockResolvedValue(YEAR);
    prisma.schoolYear.findUniqueOrThrow.mockResolvedValue(YEAR);
    tx.period.count.mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [PeriodsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    periods = moduleRef.get(PeriodsService);
  });

  describe('create', () => {
    const dto = { number: 1, label: '1er trimestre', startsOn: '2026-09-06', endsOn: '2026-12-17' };

    it('defaults to a trimester of every section, audited', async () => {
      tx.period.create.mockResolvedValue(period());
      const created = await periods.create('y1', dto, ADMIN);
      expect(tx.period.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          schoolYearId: 'y1',
          kind: 'trimester',
          sectionId: null,
          number: 1,
        }),
      });
      expect(created).toMatchObject({ kind: 'trimester', sectionId: null, startsOn: '2026-09-06' });
      expect(tx.auditLog.createMany).toHaveBeenCalled();
    });

    it('takes the advisory lock of the year before it checks overlaps', async () => {
      tx.period.create.mockResolvedValue(period());
      await periods.create('y1', dto, ADMIN);
      expect(tx.$executeRaw.mock.invocationCallOrder[0]!).toBeLessThan(
        tx.period.count.mock.invocationCallOrder[0]!,
      );
    });

    it('refuses an overlap with 409 and a French message, writing nothing', async () => {
      tx.period.count.mockResolvedValue(1);
      await expect(periods.create('y1', dto, ADMIN)).rejects.toThrow(/chevauche/);
      await expect(periods.create('y1', dto, ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.period.create).not.toHaveBeenCalled();
    });

    it('compares a section period with the school-wide ones, and a school-wide one with all', async () => {
      tx.period.create.mockResolvedValue(period({ sectionId: 's1' }));
      prisma.section.findUnique.mockResolvedValue({ id: 's1' });
      await periods.create('y1', { ...dto, sectionId: 's1' }, ADMIN);
      expect(tx.period.count.mock.calls[0]![0].where).toMatchObject({
        OR: [{ sectionId: null }, { sectionId: 's1' }],
      });
      await periods.create('y1', dto, ADMIN);
      expect(tx.period.count.mock.calls[1]![0].where).not.toHaveProperty('OR');
    });

    it('turns the database exclusion constraints into the same 409', async () => {
      tx.period.create.mockRejectedValue(
        Object.assign(
          new Error('conflicting key value violates exclusion constraint "periods_no_overlap"'),
          {
            code: 'P2010',
          },
        ),
      );
      await expect(periods.create('y1', dto, ADMIN)).rejects.toThrow(/chevauche/);
      tx.period.create.mockRejectedValue(
        Object.assign(new Error('x'), {
          meta: {
            driverAdapterError: {
              cause: { originalCode: '23P01', constraint: 'periods_number_unique' },
            },
          },
        }),
      );
      await expect(periods.create('y1', dto, ADMIN)).rejects.toThrow(/existe déjà/);
    });

    it('keeps the period inside the school year and its end after its start', async () => {
      await expect(
        periods.create('y1', { ...dto, endsOn: '2026-09-05' }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(periods.create('y1', { ...dto, endsOn: '2027-07-15' }, ADMIN)).rejects.toThrow(
        /comprise dans l’année/,
      );
      await expect(
        periods.create('y1', { ...dto, startsOn: '2026-08-01' }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.period.create).not.toHaveBeenCalled();
    });

    it('404s for an unknown year or section', async () => {
      prisma.schoolYear.findUnique.mockResolvedValue(null);
      await expect(periods.create('nope', dto, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
      prisma.schoolYear.findUnique.mockResolvedValue(YEAR);
      prisma.section.findUnique.mockResolvedValue(null);
      await expect(
        periods.create('y1', { ...dto, sectionId: 'nope' }, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('refuses to touch a closed period', async () => {
      prisma.period.findUnique.mockResolvedValue(period({ closedAt: new Date() }));
      await expect(periods.update('p1', { label: 'x' }, ADMIN)).rejects.toThrow(/clôturée/);
      expect(tx.period.update).not.toHaveBeenCalled();
    });

    it('re-checks under the lock that the period was not closed meanwhile', async () => {
      prisma.period.findUnique.mockResolvedValue(period());
      tx.period.findUnique.mockResolvedValue(period({ closedAt: new Date() }));
      await expect(periods.update('p1', { label: 'x' }, ADMIN)).rejects.toThrow(/clôturée/);
      expect(tx.period.update).not.toHaveBeenCalled();
    });

    it('excludes itself from the overlap check and moves the dates only', async () => {
      prisma.period.findUnique.mockResolvedValue(period());
      tx.period.findUnique.mockResolvedValue(period());
      tx.period.update.mockResolvedValue(period({ endsOn: day('2026-12-10') }));
      await periods.update('p1', { endsOn: '2026-12-10' }, ADMIN);
      expect(tx.period.count.mock.calls[0]![0].where).toMatchObject({ NOT: { id: 'p1' } });
      // Grades follow Event.periodId: nothing here touches events or grades.
      expect(tx.event.count).not.toHaveBeenCalled();
      expect(tx.grade.count).not.toHaveBeenCalled();
    });

    it('does not change the kind or section of a period that graded events use', async () => {
      prisma.period.findUnique.mockResolvedValue(period());
      prisma.event.count.mockResolvedValue(3);
      await expect(periods.update('p1', { kind: 'semester' }, ADMIN)).rejects.toThrow(
        /ne peuvent plus changer/,
      );
    });
  });

  describe('close, remove', () => {
    it('closes and reopens, and keeps a period reopened only while no report card is published', async () => {
      prisma.period.findUnique.mockResolvedValue(period());
      tx.period.update.mockResolvedValue(period({ closedAt: new Date() }));
      expect((await periods.close('p1', true, ADMIN)).closedAt).not.toBeNull();

      prisma.period.findUnique.mockResolvedValue(period({ closedAt: new Date() }));
      prisma.reportCard.count.mockResolvedValue(2);
      await expect(periods.close('p1', false, ADMIN)).rejects.toThrow(/bulletins publiés/);
    });

    it('refuses to delete a period with report cards or grades, whatever its state', async () => {
      tx.period.findUnique.mockResolvedValue(period());
      tx.reportCard.count.mockResolvedValue(1);
      await expect(periods.remove('p1', ADMIN)).rejects.toThrow(/bulletins/);
      tx.reportCard.count.mockResolvedValue(0);
      tx.grade.count.mockResolvedValue(4);
      await expect(periods.remove('p1', ADMIN)).rejects.toThrow(/notes/);
      expect(tx.period.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a period that events still point at, and deletes an empty one', async () => {
      tx.period.findUnique.mockResolvedValue(period());
      tx.reportCard.count.mockResolvedValue(0);
      tx.grade.count.mockResolvedValue(0);
      tx.event.count.mockResolvedValue(2);
      await expect(periods.remove('p1', ADMIN)).rejects.toThrow(/événements notés sont rattachés/);
      expect(tx.period.delete).not.toHaveBeenCalled();
      tx.event.count.mockResolvedValue(0);
      await periods.remove('p1', ADMIN);
      expect(tx.period.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('lockOpen', () => {
    it('takes a share lock and refuses a period closed meanwhile', async () => {
      await expect(periods.lockOpen(tx as never, null)).resolves.toBeUndefined();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      tx.$queryRaw.mockResolvedValue([{ closed_at: null }]);
      await expect(periods.lockOpen(tx as never, 'p1')).resolves.toBeUndefined();
      tx.$queryRaw.mockResolvedValue([{ closed_at: new Date() }]);
      await expect(periods.lockOpen(tx as never, 'p1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('is the exclusive lock that close() takes before it writes', async () => {
      prisma.period.findUnique.mockResolvedValue(period());
      tx.period.update.mockResolvedValue(period({ closedAt: new Date() }));
      await periods.close('p1', true, ADMIN);
      expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
        tx.period.update.mock.invocationCallOrder[0]!,
      );
    });
  });

  describe('resolveFor', () => {
    const klass = { id: 'c1', schoolYearId: 'y1', sectionId: 's1' };

    it('picks the period containing the date, preferring the class section, then trimesters', async () => {
      prisma.schoolClass.findUnique.mockResolvedValue(klass);
      prisma.period.findMany.mockResolvedValue([
        period({ id: 'semester', kind: 'semester' }),
        period({ id: 'wide' }),
        period({ id: 'section', sectionId: 's1' }),
      ]);
      expect((await periods.resolveFor(prisma as never, 'c1', '2026-10-12', undefined)).id).toBe(
        'section',
      );
      prisma.period.findMany.mockResolvedValue([
        period({ id: 'semester', kind: 'semester' }),
        period({ id: 'wide' }),
      ]);
      expect((await periods.resolveFor(prisma as never, 'c1', '2026-10-12', null)).id).toBe('wide');
    });

    it('asks for periods of the class school year and section, or every section', async () => {
      prisma.schoolClass.findUnique.mockResolvedValue(klass);
      prisma.period.findMany.mockResolvedValue([period()]);
      await periods.resolveFor(prisma as never, 'c1', '2026-10-12', undefined);
      expect(prisma.period.findMany.mock.calls[0]![0].where).toMatchObject({
        schoolYearId: 'y1',
        OR: [{ sectionId: null }, { sectionId: 's1' }],
      });
    });

    it('is a 400 when no period covers the date, or the named period does not fit the class', async () => {
      prisma.schoolClass.findUnique.mockResolvedValue(klass);
      prisma.period.findMany.mockResolvedValue([]);
      await expect(
        periods.resolveFor(prisma as never, 'c1', '2026-07-01', undefined),
      ).rejects.toThrow(/Aucune période/);
      prisma.period.findFirst.mockResolvedValue(null);
      await expect(
        periods.resolveFor(prisma as never, 'c1', '2026-10-12', 'other-year'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is a 409 when the period is closed', async () => {
      prisma.schoolClass.findUnique.mockResolvedValue(klass);
      prisma.period.findMany.mockResolvedValue([period({ closedAt: new Date() })]);
      await expect(
        periods.resolveFor(prisma as never, 'c1', '2026-10-12', undefined),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('assertOpen', () => {
    it('lets null and open periods through, refuses closed ones', async () => {
      await expect(periods.assertOpen(prisma as never, null)).resolves.toBeUndefined();
      prisma.period.findUnique.mockResolvedValue({ closedAt: null });
      await expect(periods.assertOpen(prisma as never, 'p1')).resolves.toBeUndefined();
      prisma.period.findUnique.mockResolvedValue({ closedAt: new Date() });
      await expect(periods.assertOpen(prisma as never, 'p1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
