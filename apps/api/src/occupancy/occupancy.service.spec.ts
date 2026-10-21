import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
        new Error('conflicting key value violates exclusion constraint "occupancy_room_no_overlap"'),
      );
      await expect(service.guard(raced)).rejects.toBeInstanceOf(ConflictException);
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
