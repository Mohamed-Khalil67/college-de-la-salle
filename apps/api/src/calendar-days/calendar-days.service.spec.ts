import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarDaysService } from './calendar-days.service.js';

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
const row = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  schoolYearId: 'y1',
  type: 'holiday',
  label: 'Vacances',
  startsOn: day('2026-12-20'),
  endsOn: day('2027-01-02'),
  sectionId: null,
  classes: [],
  section: null,
  schoolYear: {},
  ...over,
});
const YEAR = {
  id: 'y1',
  label: '2026-2027',
  startsOn: day('2026-09-06'),
  endsOn: day('2027-06-17'),
};
const dto = {
  schoolYearId: 'y1',
  type: 'holiday',
  label: 'Vacances',
  startsOn: '2026-12-20',
  endsOn: '2027-01-02',
} as const;

describe('CalendarDaysService', () => {
  const tx = {
    calendarDay: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    calendarDay: { findMany: vi.fn(), findUnique: vi.fn() },
    schoolYear: { findUnique: vi.fn() },
    section: { findUnique: vi.fn() },
    schoolClass: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  let days: CalendarDaysService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    prisma.schoolYear.findUnique.mockResolvedValue(YEAR);
    const moduleRef = await Test.createTestingModule({
      providers: [CalendarDaysService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    days = moduleRef.get(CalendarDaysService);
  });

  describe('create', () => {
    it('creates a whole-school day, audited', async () => {
      tx.calendarDay.create.mockResolvedValue(row());
      expect(await days.create(dto, ADMIN)).toMatchObject({
        type: 'holiday',
        sectionId: null,
        classIds: [],
      });
      expect(tx.auditLog.createMany.mock.calls[0]![0].data[0]).toMatchObject({
        action: 'calendar_day.create',
      });
    });

    it('keeps the days inside the school year, the end after the start', async () => {
      await expect(days.create({ ...dto, startsOn: '2026-08-01' }, ADMIN)).rejects.toThrow(
        /comprises dans l’année/,
      );
      await expect(days.create({ ...dto, endsOn: '2027-07-01' }, ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(days.create({ ...dto, startsOn: '2027-01-03' }, ADMIN)).rejects.toThrow(
        /fin ne peut pas précéder/,
      );
      // One single day is fine.
      tx.calendarDay.create.mockResolvedValue(row());
      await expect(days.create({ ...dto, endsOn: '2026-12-20' }, ADMIN)).resolves.toBeDefined();
    });

    it('404s for an unknown year or section', async () => {
      prisma.schoolYear.findUnique.mockResolvedValue(null);
      await expect(days.create(dto, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
      prisma.schoolYear.findUnique.mockResolvedValue(YEAR);
      prisma.section.findUnique.mockResolvedValue(null);
      await expect(days.create({ ...dto, sectionId: 's9' }, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('takes only classes of that year (and section)', async () => {
      prisma.schoolClass.findMany.mockResolvedValue([{ id: 'c1' }]);
      await expect(days.create({ ...dto, classIds: ['c1', 'c2'] }, ADMIN)).rejects.toThrow(
        /appartenir à cette année/,
      );
      expect(prisma.schoolClass.findMany.mock.calls[0]![0].where).toMatchObject({
        schoolYearId: 'y1',
      });
      prisma.section.findUnique.mockResolvedValue({ id: 's1' });
      prisma.schoolClass.findMany.mockResolvedValue([{ id: 'c1' }]);
      tx.calendarDay.create.mockResolvedValue(
        row({ sectionId: 's1', classes: [{ classId: 'c1' }] }),
      );
      await days.create({ ...dto, sectionId: 's1', classIds: ['c1'] }, ADMIN);
      expect(prisma.schoolClass.findMany.mock.calls[1]![0].where).toMatchObject({
        sectionId: 's1',
      });
    });
  });

  describe('update', () => {
    it('re-checks the merged dates against the year', async () => {
      prisma.calendarDay.findUnique.mockResolvedValue(row());
      await expect(days.update('d1', { endsOn: '2027-07-01' }, ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(days.update('d1', { startsOn: '2027-01-05' }, ADMIN)).rejects.toThrow(
        /fin ne peut pas précéder/,
      );
      tx.calendarDay.update.mockResolvedValue(row({ label: 'Hiver' }));
      await expect(days.update('d1', { label: 'Hiver' }, ADMIN)).resolves.toMatchObject({
        label: 'Hiver',
      });
    });

    it('replaces the classes only when they are sent', async () => {
      prisma.calendarDay.findUnique.mockResolvedValue(row({ classes: [{ classId: 'c1' }] }));
      prisma.schoolClass.findMany.mockResolvedValue([{ id: 'c2' }]);
      tx.calendarDay.update.mockResolvedValue(row({ classes: [{ classId: 'c2' }] }));
      await days.update('d1', { classIds: ['c2'] }, ADMIN);
      expect(tx.calendarDay.update.mock.calls[0]![0].data.classes).toEqual({
        deleteMany: {},
        create: [{ classId: 'c2' }],
      });
      prisma.schoolClass.findMany.mockResolvedValue([{ id: 'c1' }]);
      await days.update('d1', { label: 'x' }, ADMIN);
      expect(tx.calendarDay.update.mock.calls[1]![0].data).not.toHaveProperty('classes');
    });

    it('404s for an unknown day', async () => {
      prisma.calendarDay.findUnique.mockResolvedValue(null);
      await expect(days.update('d1', { label: 'x' }, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(days.remove('d1', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('closures', () => {
    it('lists only days without classes, as audiences of the shared model', async () => {
      prisma.calendarDay.findMany.mockResolvedValue([
        row(),
        row({ section: { code: 'bac' }, sectionId: 's1', type: 'no_classes' }),
        row({
          classes: [
            { classId: 'c1', schoolClass: { code: 'premiere', section: { code: 'bac' } } },
            {
              classId: 'c2',
              schoolClass: { code: 'secondaire-1', section: { code: 'nationale' } },
            },
          ],
        }),
      ]);
      const closures = await days.closures('2026-12-01', '2027-01-31');
      expect(prisma.calendarDay.findMany.mock.calls[0]![0].where).toMatchObject({
        type: { in: ['holiday', 'no_classes'] },
        startsOn: { lte: day('2027-01-31') },
        endsOn: { gte: day('2026-12-01') },
      });
      expect(closures).toEqual([
        { startsOn: '2026-12-20', endsOn: '2027-01-02', targets: ['all'] },
        { startsOn: '2026-12-20', endsOn: '2027-01-02', targets: ['bac'] },
        {
          startsOn: '2026-12-20',
          endsOn: '2027-01-02',
          targets: ['bac-premiere', 'nationale-secondaire-1'],
        },
      ]);
    });
  });
});
