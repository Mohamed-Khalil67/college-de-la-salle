import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mapException } from '../common/error-response.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OccupancyService } from './occupancy.service.js';

describe('OccupancyService', () => {
  let service: OccupancyService;
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [OccupancyService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = moduleRef.get(OccupancyService);
  });

  const event = {
    id: 'e1',
    date: '2026-11-03',
    startTime: '09:00',
    endTime: '11:00',
    repeatUntil: null,
    roomId: 'r1',
    classId: 'c1',
    homework: false,
  };

  describe('eventRows', () => {
    it('holds the room and the class of a one-off timed event', () => {
      expect(service.eventRows(event)).toEqual([
        expect.objectContaining({
          source: 'event',
          eventId: 'e1',
          roomId: 'r1',
          classId: 'c1',
          teacherId: null,
          startsAt: '2026-11-03 09:00',
          endsAt: '2026-11-03 11:00',
        }),
      ]);
    });

    it.each([
      ['an all-day event', { startTime: null, endTime: null }],
      ['a weekly (legacy) event', { repeatUntil: '2026-12-01' }],
      ['homework', { homework: true }],
      ['an event with neither room nor class', { roomId: null, classId: null }],
    ])('holds nothing for %s', (_, over) => {
      expect(service.eventRows({ ...event, ...over })).toEqual([]);
    });

    it('holds only the division of its class when it is addressed to groups of one division', () => {
      const row = service.eventRows({ ...event, hold: { divisionKey: 'TP', groupId: 'g-b' } })[0];
      expect(row).toMatchObject({ roomId: 'r1', classId: 'c1', divisionKey: 'TP', groupId: 'g-b' });
      // Whole class: no division, no group.
      expect(service.eventRows(event)[0]).toMatchObject({ divisionKey: null, groupId: null });
    });

    it('holds only the room, or only the class, when that is all it has', () => {
      expect(service.eventRows({ ...event, classId: null })[0]).toMatchObject({
        roomId: 'r1',
        classId: null,
      });
      expect(service.eventRows({ ...event, roomId: null })[0]).toMatchObject({
        roomId: null,
        classId: 'c1',
      });
    });
  });

  describe('guard', () => {
    it('turns the exclusion error of a lost race into a 409', async () => {
      const raced = Promise.reject(
        new Error(
          'conflicting key value violates exclusion constraint "occupancy_room_no_overlap"',
        ),
      );
      await expect(service.guard(raced)).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes a deadlock inside a raw query (P2010, 40P01) on, so the filter answers a retryable 409', async () => {
      // The shape Prisma 7 with the pg adapter throws when the occupancy INSERT deadlocks.
      const deadlock = Object.assign(
        new Error('Raw query failed. Code: `40P01`. Message: `deadlock detected`'),
        {
          name: 'PrismaClientKnownRequestError',
          code: 'P2010',
          meta: {
            driverAdapterError: Object.assign(new Error('deadlock detected'), {
              cause: { originalCode: '40P01', kind: 'TransactionWriteConflict' },
            }),
          },
        },
      );
      const thrown: unknown = await service.guard(Promise.reject(deadlock)).catch((e: unknown) => e);
      expect(thrown).toBe(deadlock);
      expect(thrown).not.toBeInstanceOf(ConflictException);
      expect(mapException(thrown)).toMatchObject({
        status: 409,
        body: { code: 'SERIALIZATION_FAILURE', retryable: true },
        headers: { 'Retry-After': '1' },
      });
    });

    it('lets other errors and values through', async () => {
      await expect(service.guard(Promise.resolve(3))).resolves.toBe(3);
      await expect(service.guard(Promise.reject(new Error('boom')))).rejects.toThrow('boom');
      await expect(
        service.guard(
          Promise.reject(new Error('violates exclusion constraint "periods_no_overlap"')),
        ),
      ).rejects.toThrow('periods_no_overlap');
    });
  });
});
