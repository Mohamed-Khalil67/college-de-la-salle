import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../access/access.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TimetableService } from './timetable.service.js';
import { WarningsService } from './warnings.service.js';

// The archived-year guard reads the database (raw SQL); its own behaviour is covered by the e2e tests.
vi.mock('../school-years/year-guard.js', () => ({ assertClassWritable: vi.fn(), assertYearWritable: vi.fn() }));

const user = (over: Partial<AuthUser>): AuthUser => ({
  id: 'u1',
  email: 'x@y.z',
  role: 'teacher',
  firstName: 'A',
  lastName: 'B',
  studentId: null,
  teacherId: 't1',
  classId: null,
  isCoordinator: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
  ...over,
});
const TEACHER = user({});
const OTHER_TEACHER = user({ id: 'u2', teacherId: 't2' });
const COORDINATOR = user({ id: 'u3', teacherId: 't3', isCoordinator: true });
const ADMIN = user({ id: 'u4', role: 'admin', teacherId: null });

const row = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  classSubjectId: 'cs1',
  groupId: null,
  division: null,
  teacherId: 't1',
  roomId: 'r1',
  activityTypeId: 'ty1',
  weekday: 1,
  startTime: '08:00',
  endTime: '09:00',
  validFrom: new Date('2026-09-07T00:00:00Z'),
  validTo: new Date('2027-06-14T00:00:00Z'),
  weekParity: null,
  exceptions: [],
  classSubject: {
    id: 'cs1',
    classId: 'c1',
    subjectId: 'mathematiques',
    hoursPerWeek: null,
    schoolClass: {
      id: 'c1',
      code: 'premiere',
      label: 'Première',
      section: { code: 'bac' },
      schoolYear: { startsOn: new Date('2026-09-06T00:00:00Z') },
    },
  },
  ...over,
});

describe('TimetableService (rules checked before anything is written)', () => {
  const tx = {
    timetableSlot: { findUnique: vi.fn() },
    calendarDay: { findMany: vi.fn() },
    slotException: { upsert: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const access = { teaches: vi.fn() };
  const occupancy = { guard: vi.fn(), clearSlots: vi.fn() };
  let service: TimetableService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((work: (t: unknown) => unknown) => work(tx));
    occupancy.guard.mockImplementation((work: unknown) => work);
    tx.timetableSlot.findUnique.mockResolvedValue(row());
    tx.calendarDay.findMany.mockResolvedValue([]);
    access.teaches.mockImplementation((teacherId: string) => Promise.resolve(teacherId === 't1'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TimetableService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        { provide: OccupancyService, useValue: occupancy },
        { provide: WarningsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(TimetableService);
    vi.spyOn(service, 'today').mockReturnValue('2026-10-21');
  });

  const update = (u: AuthUser, body: Record<string, unknown>) =>
    service.update('s1', body as never, u);

  it('a teacher may only use the « this session » scope', async () => {
    await expect(
      update(TEACHER, { scope: 'following', date: '2026-11-02', changes: { roomId: 'r2' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      update(TEACHER, { scope: 'all', changes: { roomId: 'r2' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.slotException.upsert).not.toHaveBeenCalled();
  });

  it('a teacher cannot touch another teacher’s session, even one they could teach', async () => {
    await expect(
      update(OTHER_TEACHER, {
        scope: 'this',
        date: '2026-11-02',
        exception: { kind: 'cancelled' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a teacher cannot name a substitute (admins and coordinators can, past the permission check)', async () => {
    await expect(
      update(TEACHER, {
        scope: 'this',
        date: '2026-11-02',
        exception: { kind: 'substitute', newTeacherId: 't2' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      update(COORDINATOR, {
        scope: 'this',
        date: '2026-11-02',
        exception: { kind: 'substitute' },
      }),
    ).rejects.toThrow(/remplace/);
  });

  it('refuses to change a session already held, for every scope', async () => {
    await expect(
      update(ADMIN, { scope: 'this', date: '2026-10-19', exception: { kind: 'cancelled' } }),
    ).rejects.toThrow(/passées/);
    await expect(
      update(ADMIN, { scope: 'following', date: '2026-10-19', changes: { roomId: 'r2' } }),
    ).rejects.toThrow(/passées/);
    await expect(
      service.remove('s1', { scope: 'following', date: '2026-10-19' }, ADMIN),
    ).rejects.toThrow(/passées/);
  });

  it('refuses a date that is not a session of the series', async () => {
    // 2026-11-03 is a Tuesday; the slot runs on Mondays.
    await expect(
      update(ADMIN, { scope: 'following', date: '2026-11-03', changes: { roomId: 'r2' } }),
    ).rejects.toThrow(/pas une séance de la série/);
    await expect(
      update(ADMIN, { scope: 'this', date: '2026-11-03', exception: { kind: 'cancelled' } }),
    ).rejects.toThrow(/n’a pas lieu/);
  });

  it('refuses a series that is over, a start that moves after it began, and missing fields', async () => {
    tx.timetableSlot.findUnique.mockResolvedValue(
      row({ validTo: new Date('2026-10-01T00:00:00Z') }),
    );
    await expect(update(ADMIN, { scope: 'all', changes: { roomId: 'r2' } })).rejects.toThrow(
      /terminée/,
    );
    tx.timetableSlot.findUnique.mockResolvedValue(row());
    await expect(
      update(ADMIN, { scope: 'all', changes: { validFrom: '2026-11-01' } }),
    ).rejects.toThrow(/a commencé/);
    await expect(update(ADMIN, { scope: 'all' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(update(ADMIN, { scope: 'this', date: '2026-11-02' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      update(ADMIN, {
        scope: 'this',
        date: '2026-11-02',
        exception: { kind: 'cancelled' },
        changes: { roomId: 'r2' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only admins and coordinators delete or create', async () => {
    await expect(service.remove('s1', { scope: 'all' }, TEACHER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.create({} as never, TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
