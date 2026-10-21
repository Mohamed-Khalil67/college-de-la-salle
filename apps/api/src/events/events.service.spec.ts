import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../access/access.service.js';
import { ActivityTypesService } from '../activity-types/activity-types.service.js';
import { CalendarDaysService } from '../calendar-days/calendar-days.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PeriodsService } from '../periods/periods.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from './events.service.js';

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

const type = (over: Record<string, unknown> = {}) => ({
  id: 'ty-cours',
  code: 'cours',
  label: 'Cours',
  colour: 'navy',
  icon: 'book',
  gradable: false,
  repeatable: true,
  homework: false,
  ...over,
});
const EXAM = type({
  id: 'ty-exam',
  code: 'examen',
  label: 'Examen',
  gradable: true,
  repeatable: false,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  activityTypeId: 'ty-exam',
  activityType: EXAM,
  title: 'Examen',
  subjectId: 'mathematiques',
  classId: 'c1',
  sectionId: null,
  date: new Date('2026-10-13T00:00:00Z'),
  startTime: null,
  endTime: null,
  repeatUntil: null,
  roomId: null,
  room: null,
  place: '',
  periodId: 'p1',
  description: '',
  attachments: [],
  coefficient: 2,
  authorId: 't1',
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { user: { firstName: 'T', lastName: 'T' } },
  schoolClass: null,
  section: null,
  ...over,
});

const dto = {
  activityTypeId: 'ty-exam',
  title: 'Examen',
  subjectId: 'mathematiques',
  classId: 'c1',
  date: '2026-10-13',
  coefficient: 2,
};

describe('EventsService', () => {
  const prisma = {
    event: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    grade: { count: vi.fn() },
    subject: { findUnique: vi.fn() },
    section: { findUnique: vi.fn() },
    schoolClass: { findUnique: vi.fn() },
    room: { findUnique: vi.fn() },
    classSubject: { findUnique: vi.fn() },
    // The write transaction runs on the same mocks.
    $transaction: vi.fn(),
  };
  const access = { assertTeachesClass: vi.fn(), audienceFor: vi.fn(), placement: vi.fn() };
  const types = { usable: vi.fn(), lockForEvent: vi.fn() };
  const periods = { resolveFor: vi.fn(), assertOpen: vi.fn(), find: vi.fn() };
  const calendarDays = { closures: vi.fn() };
  let events: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof prisma) => Promise<unknown>) => fn(prisma));
    prisma.subject.findUnique.mockResolvedValue({ id: 'mathematiques' });
    prisma.schoolClass.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.grade.count.mockResolvedValue(0);
    prisma.classSubject.findUnique.mockResolvedValue({ id: 'cs1' });
    periods.find.mockResolvedValue({
      id: 'p1',
      startsOn: new Date('2026-09-06T00:00:00Z'),
      endsOn: new Date('2026-12-17T00:00:00Z'),
    });
    types.usable.mockImplementation((id: string) =>
      Promise.resolve(id === 'ty-exam' ? EXAM : type()),
    );
    periods.resolveFor.mockResolvedValue({ id: 'p1' });
    periods.assertOpen.mockResolvedValue(undefined);
    calendarDays.closures.mockResolvedValue([]);
    prisma.event.create.mockResolvedValue(row());
    prisma.event.update.mockResolvedValue(row());
    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        { provide: ActivityTypesService, useValue: types },
        { provide: PeriodsService, useValue: periods },
        { provide: CalendarDaysService, useValue: calendarDays },
      ],
    }).compile();
    events = moduleRef.get(EventsService);
  });

  describe('create', () => {
    it('stores the period of a gradable event, resolved from the class and the date', async () => {
      await events.create(dto, TEACHER);
      expect(periods.resolveFor).toHaveBeenCalledWith(prisma, 'c1', '2026-10-13', null);
      expect(prisma.event.create.mock.calls[0]![0].data).toMatchObject({
        activityTypeId: 'ty-exam',
        periodId: 'p1',
        authorId: 't1',
      });
    });

    it('passes the period the teacher picked', async () => {
      await events.create({ ...dto, periodId: 'p9' }, TEACHER);
      expect(periods.resolveFor).toHaveBeenCalledWith(prisma, 'c1', '2026-10-13', 'p9');
    });

    it('gives no period to an event whose type is not gradable, and ignores the one sent', async () => {
      await events.create(
        { ...dto, activityTypeId: 'ty-cours', coefficient: undefined, periodId: 'p9' },
        TEACHER,
      );
      expect(periods.resolveFor).not.toHaveBeenCalled();
      expect(prisma.event.create.mock.calls[0]![0].data.periodId).toBeNull();
    });

    it('decides by the flags of the type: weekly only for repeatable types', async () => {
      const weekly = { ...dto, repeatUntil: '2026-11-13' };
      await expect(events.create(weekly, TEACHER)).rejects.toThrow(/ne se répète pas/);
      await expect(
        events.create({ ...weekly, activityTypeId: 'ty-cours', coefficient: undefined }, TEACHER),
      ).resolves.toBeDefined();
    });

    it('needs a class for gradable types, and a coefficient of 1 for the others', async () => {
      await expect(events.create({ ...dto, classId: undefined }, TEACHER)).rejects.toThrow(
        /vise une classe/,
      );
      await expect(
        events.create({ ...dto, activityTypeId: 'ty-cours', coefficient: 3 }, TEACHER),
      ).rejects.toThrow(/coefficient/);
    });

    it('lets the type service say no (another teacher’s private type, archived type)', async () => {
      types.usable.mockRejectedValue(new NotFoundException());
      await expect(events.create(dto, TEACHER)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('books only an active room of the school', async () => {
      const withRoom = { ...dto, roomId: 'r1' };
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(events.create(withRoom, TEACHER)).rejects.toBeInstanceOf(NotFoundException);
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', active: false });
      await expect(events.create(withRoom, TEACHER)).rejects.toThrow(/n’est plus utilisée/);
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', active: true });
      await events.create({ ...withRoom, place: 'Cour' }, TEACHER);
      expect(prisma.event.create.mock.calls[0]![0].data).toMatchObject({
        roomId: 'r1',
        place: 'Cour',
      });
    });

    it('counts a graded event in a subject the class has, since report cards only weigh those', async () => {
      prisma.classSubject.findUnique.mockResolvedValue(null);
      await expect(events.create(dto, TEACHER)).rejects.toThrow(/pas enseignée dans cette classe/);
      await expect(events.create({ ...dto, subjectId: undefined }, TEACHER)).rejects.toThrow(
        /besoin d’une matière/,
      );
      expect(prisma.classSubject.findUnique).toHaveBeenCalledWith({
        where: { classId_subjectId: { classId: 'c1', subjectId: 'mathematiques' } },
      });
      expect(prisma.event.create).not.toHaveBeenCalled();
      // Ungraded events need no subject of the class.
      await expect(
        events.create({ ...dto, activityTypeId: 'ty-cours', coefficient: undefined }, TEACHER),
      ).resolves.toBeDefined();
    });

    it('checks that the teacher teaches the class and the subject', async () => {
      await events.create(dto, TEACHER);
      expect(access.assertTeachesClass).toHaveBeenCalledWith(TEACHER, 'c1', 'mathematiques');
    });
  });

  describe('update', () => {
    beforeEach(() => prisma.event.findUnique.mockResolvedValue(row()));

    it('refuses to touch an event of a closed period', async () => {
      periods.assertOpen.mockRejectedValue(new ConflictException('clôturée'));
      await expect(events.update('e1', { title: 'x' }, TEACHER)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
      await expect(events.remove('e1', TEACHER)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.event.delete).not.toHaveBeenCalled();
      expect(periods.assertOpen).toHaveBeenCalledWith(prisma, 'p1');
    });

    it('keeps the stored period when the date and class do not change', async () => {
      await events.update('e1', { title: 'Autre titre' }, TEACHER);
      expect(periods.resolveFor).toHaveBeenCalledWith(prisma, 'c1', '2026-10-13', 'p1');
    });

    it('keeps an explicit period (a semester picked by hand) while the new date is still inside it', async () => {
      await events.update('e1', { date: '2026-11-20' }, TEACHER);
      expect(periods.resolveFor).toHaveBeenCalledWith(prisma, 'c1', '2026-11-20', 'p1');
    });

    it('lets an old graded event without a period change its title, but derives one for a new date', async () => {
      prisma.event.findUnique.mockResolvedValue(row({ periodId: null }));
      await events.update('e1', { title: 'Corrigé' }, TEACHER);
      expect(periods.resolveFor).not.toHaveBeenCalled();
      expect(prisma.event.update.mock.calls[0]![0].data.periodId).toBeNull();
      await events.update('e1', { date: '2026-10-20' }, TEACHER);
      expect(periods.resolveFor).toHaveBeenCalledWith(prisma, 'c1', '2026-10-20', null);
    });

    it('resets the coefficient when the type becomes ungraded', async () => {
      await events.update('e1', { activityTypeId: 'ty-cours' }, TEACHER);
      expect(prisma.event.update.mock.calls[0]![0].data).toMatchObject({
        activityTypeId: 'ty-cours',
        coefficient: 1,
        periodId: null,
      });
    });

    it('derives the period again from a new date', async () => {
      periods.resolveFor.mockResolvedValue({ id: 'p2' });
      await events.update('e1', { date: '2027-02-10' }, TEACHER);
      expect(periods.resolveFor).toHaveBeenCalledWith(prisma, 'c1', '2027-02-10', null);
      expect(prisma.event.update.mock.calls[0]![0].data.periodId).toBe('p2');
    });

    it('takes the period named with a new date', async () => {
      await events.update('e1', { date: '2027-02-10', periodId: 'p3' }, TEACHER);
      expect(periods.resolveFor).toHaveBeenCalledWith(prisma, 'c1', '2027-02-10', 'p3');
    });

    it('keeps graded events in their period, type and class', async () => {
      prisma.grade.count.mockResolvedValue(5);
      periods.resolveFor.mockResolvedValue({ id: 'p2' });
      await expect(events.update('e1', { date: '2027-02-10' }, TEACHER)).rejects.toThrow(
        /ne peut plus changer de période/,
      );
      await expect(
        events.update('e1', { activityTypeId: 'ty-cours', coefficient: 1 }, TEACHER),
      ).rejects.toThrow(/le type, la classe et la matière/);
      await expect(events.update('e1', { subjectId: 'arabe' }, TEACHER)).rejects.toThrow(
        /la matière/,
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
      // Retitling is fine: the stored period is asked for again and comes back the same.
      periods.resolveFor.mockResolvedValue({ id: 'p1' });
      await expect(events.update('e1', { title: 'Corrigé' }, TEACHER)).resolves.toBeDefined();
    });

    it('lets a teacher edit only their own events', async () => {
      prisma.event.findUnique.mockResolvedValue(row({ authorId: 't2' }));
      await expect(events.update('e1', { title: 'x' }, TEACHER)).rejects.toThrow(/non autorisée/);
    });

    it('does not ask for a room check when the room is unchanged', async () => {
      prisma.event.findUnique.mockResolvedValue(row({ roomId: 'r1', room: { name: 'Salle 12' } }));
      await events.update('e1', { title: 'x' }, TEACHER);
      expect(prisma.room.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('occurrences', () => {
    it('skips weekly sessions on the closed days of the audience', async () => {
      const weekly = row({
        activityTypeId: 'ty-cours',
        activityType: type(),
        date: new Date('2027-02-02T00:00:00Z'),
        repeatUntil: new Date('2027-02-23T00:00:00Z'),
        startTime: '14:00',
        schoolClass: { code: 'premiere', section: { code: 'bac' } },
      });
      prisma.event.findMany.mockResolvedValue([weekly]);
      calendarDays.closures.mockResolvedValue([
        { startsOn: '2027-02-09', endsOn: '2027-02-10', targets: ['bac'] },
      ]);
      const list = await events.occurrences({ from: '2027-02-01', to: '2027-02-28' }, TEACHER);
      expect(list.map((o) => o.day)).toEqual(['2027-02-02', '2027-02-16', '2027-02-23']);
      expect(calendarDays.closures).toHaveBeenCalledWith('2027-02-01', '2027-02-28');
    });
  });

  describe('ics', () => {
    it('adds an EXDATE for each session cancelled by a closed day', async () => {
      prisma.event.findFirst.mockResolvedValue(
        row({
          activityTypeId: 'ty-cours',
          activityType: type(),
          date: new Date('2027-02-02T00:00:00Z'),
          repeatUntil: new Date('2027-02-23T00:00:00Z'),
          startTime: '14:00',
          endTime: '15:00',
        }),
      );
      calendarDays.closures.mockResolvedValue([
        { startsOn: '2027-02-16', endsOn: '2027-02-16', targets: ['all'] },
      ]);
      const ics = await events.ics('e1', TEACHER);
      expect(ics).toContain('EXDATE:20270216T140000');
      expect(ics).not.toContain('EXDATE:20270209');
      expect(calendarDays.closures).toHaveBeenCalledWith('2027-02-02', '2027-02-23');
    });
  });

  it('rejects a range of more than 186 days', async () => {
    await expect(
      events.list({ from: '2026-01-01', to: '2026-12-31' }, TEACHER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
