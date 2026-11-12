import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../access/access.service.js';
import { ActivityTypesService } from '../activity-types/activity-types.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TargetsService } from '../targets/targets.service.js';
import { GradesService } from './grades.service.js';
import {
  NO_OPEN_PERIOD,
  NOT_GRADABLE_TYPE,
  PERIOD_CLOSED,
  QuickGradingService,
} from './quick-grading.service.js';

// The archived-year guard reads the database (raw SQL); its own behaviour is covered by the e2e tests.
vi.mock('../school-years/year-guard.js', () => ({ assertClassWritable: vi.fn() }));
// Rows stay minimal: the mapper passes them through and `annotate` answers fixed DTOs.
vi.mock('../events/event.mapper.js', () => ({
  eventInclude: {},
  toEventDto: (row: unknown) => row,
}));

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
const ADMIN: AuthUser = { ...TEACHER, id: 'u-a', role: 'admin', teacherId: null };

const type = (flags: { gradable: boolean; homework: boolean }) => ({
  id: 'type-1',
  code: 'controle',
  label: 'Contrôle',
  colour: 'amber',
  icon: 'pencil',
  repeatable: false,
  isSystem: true,
  ownerTeacherId: null,
  sortOrder: 5,
  archivedAt: null,
  createdAt: new Date(),
  ...flags,
});

const eventDto = (id: string, concerned: number) => ({
  id,
  classId: 'c1',
  type: { gradable: true, homework: false },
  target: { whole: true, groups: [], studentIds: [], concerned },
});

describe('QuickGradingService', () => {
  const tx = { event: { create: vi.fn() } };
  const prisma = {
    $transaction: vi.fn((work: (t: typeof tx) => unknown) => work(tx)),
    activityType: { findFirst: vi.fn() },
    event: { findMany: vi.fn() },
    grade: { findMany: vi.fn() },
    auditLog: { createMany: vi.fn() },
  };
  // The audit helper writes through the transaction client.
  Object.assign(tx, { auditLog: prisma.auditLog });
  const access = { assertTeachesClass: vi.fn() };
  const types = { lockForEvent: vi.fn(), usable: vi.fn() };
  const periods = { resolveFor: vi.fn(), lockOpen: vi.fn() };
  const targets = { annotate: vi.fn() };
  const grades = { sheet: vi.fn() };
  let service: QuickGradingService;

  beforeEach(async () => {
    vi.clearAllMocks();
    access.assertTeachesClass.mockResolvedValue(undefined);
    types.usable.mockResolvedValue(type({ gradable: true, homework: false }));
    periods.resolveFor.mockResolvedValue({ id: 'p1', closedAt: null });
    prisma.activityType.findFirst.mockResolvedValue({ id: 'type-1' });
    tx.event.create.mockResolvedValue({ id: 'e-new' });
    grades.sheet.mockResolvedValue({ event: { id: 'e-new' }, rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuickGradingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        { provide: ActivityTypesService, useValue: types },
        { provide: PeriodsService, useValue: periods },
        { provide: TargetsService, useValue: targets },
        { provide: GradesService, useValue: grades },
      ],
    }).compile();
    service = moduleRef.get(QuickGradingService);
  });

  const body = { classId: 'c1', subjectId: 'mathematiques', title: 'Interrogation 3' };

  describe('create', () => {
    it('creates today’s whole-class event in the current period and answers its sheet', async () => {
      const sheet = await service.create({ ...body, coefficient: 2 }, TEACHER);

      expect(access.assertTeachesClass).toHaveBeenCalledWith(TEACHER, 'c1', 'mathematiques');
      expect(types.lockForEvent).toHaveBeenCalledWith(tx, 'type-1');
      expect(periods.lockOpen).toHaveBeenCalledWith(tx, 'p1');
      const data = tx.event.create.mock.calls[0]?.[0]?.data;
      expect(data).toMatchObject({
        activityTypeId: 'type-1',
        title: 'Interrogation 3',
        classId: 'c1',
        subjectId: 'mathematiques',
        periodId: 'p1',
        coefficient: 2,
        authorId: 't1',
      });
      expect(data).not.toHaveProperty('startTime');
      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ action: 'event.create', entityId: 'e-new' })],
      });
      expect(grades.sheet).toHaveBeenCalledWith('e-new', TEACHER);
      expect(sheet.event.id).toBe('e-new');
    });

    it('asks for the flags, not a code, for the default type, and defaults the coefficient to 1', async () => {
      await service.create(body, TEACHER);
      expect(prisma.activityType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ gradable: true, homework: false, repeatable: false }),
        }),
      );
      expect(tx.event.create.mock.calls[0]?.[0]?.data.coefficient).toBe(1);
    });

    it('uses the chosen type and refuses one that is not graded or is homework', async () => {
      await service.create({ ...body, activityTypeId: 'type-x' }, TEACHER);
      expect(prisma.activityType.findFirst).not.toHaveBeenCalled();
      expect(types.usable).toHaveBeenCalledWith('type-x', TEACHER);

      types.usable.mockResolvedValue(type({ gradable: true, homework: true }));
      await expect(service.create({ ...body, activityTypeId: 'type-x' }, TEACHER)).rejects.toThrow(
        new BadRequestException(NOT_GRADABLE_TYPE),
      );
      types.usable.mockResolvedValue(type({ gradable: false, homework: false }));
      await expect(service.create({ ...body, activityTypeId: 'type-x' }, TEACHER)).rejects.toThrow(
        NOT_GRADABLE_TYPE,
      );
    });

    it('refuses a teacher who does not teach the class and subject, before writing', async () => {
      access.assertTeachesClass.mockRejectedValue(new ForbiddenException());
      await expect(service.create(body, TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses the admin (only teachers author these events)', async () => {
      await expect(service.create(body, ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers 409 with a clear sentence when no period covers today or it is closed', async () => {
      periods.resolveFor.mockRejectedValue(new BadRequestException('x'));
      await expect(service.create(body, TEACHER)).rejects.toThrow(
        new ConflictException(NO_OPEN_PERIOD),
      );
      periods.resolveFor.mockRejectedValue(new ConflictException('x'));
      await expect(service.create(body, TEACHER)).rejects.toThrow(
        new ConflictException(PERIOD_CLOSED),
      );
      expect(tx.event.create).not.toHaveBeenCalled();
    });
  });

  describe('pending', () => {
    it('lists drafts and half-entered work, leaves out fully published work', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 'draft' }, { id: 'half' }, { id: 'done' }]);
      targets.annotate.mockResolvedValue([
        eventDto('draft', 3),
        eventDto('half', 3),
        eventDto('done', 2),
      ]);
      prisma.grade.findMany.mockResolvedValue([
        { eventId: 'draft', published: false, outOf: 10 },
        { eventId: 'half', published: true, outOf: 20 },
        { eventId: 'half', published: true, outOf: 20 },
        { eventId: 'done', published: true, outOf: 20 },
        { eventId: 'done', published: true, outOf: 20 },
      ]);

      const list = await callPending(service);

      expect(access.assertTeachesClass).toHaveBeenCalledWith(TEACHER, 'c1', 'mathematiques');
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            classId: 'c1',
            subjectId: 'mathematiques',
            activityType: { gradable: true },
            OR: [{ periodId: null }, { period: { closedAt: null } }],
          }),
        }),
      );
      expect(list.map((p) => [p.event.id, p.entered, p.total, p.published, p.outOf])).toEqual([
        ['draft', 1, 3, false, 10],
        ['half', 2, 3, true, 20],
      ]);
    });

    it('answers an empty list without querying grades when nothing is gradable', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      expect(await callPending(service)).toEqual([]);
      expect(prisma.grade.findMany).not.toHaveBeenCalled();
    });

    it('refuses a teacher of another class', async () => {
      access.assertTeachesClass.mockRejectedValue(new ForbiddenException());
      await expect(callPending(service)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });
  });
});

function callPending(service: QuickGradingService) {
  return service.pending({ classId: 'c1', subjectId: 'mathematiques' }, TEACHER);
}
