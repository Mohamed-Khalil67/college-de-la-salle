import type { TimetableConflictDto } from '@cdls/shared';
import type { OccupancyService } from '../occupancy/occupancy.service.js';
import { placeNewSlots } from './slot-placement.js';

const slot = (id: string) =>
  ({ id, classSubjectId: 'cs', teacherId: 't', activityTypeId: 'a', weekday: 1, startTime: '08:00', endTime: '09:00', validFrom: new Date(), validTo: new Date() }) as never;
const row = (slotId: string) => ({ slotId }) as never;
const clash = (message: string, withSlotId: string | null = null) => ({ message, withSlotId }) as TimetableConflictDto;

describe('placeNewSlots', () => {
  it('writes, checks and indexes the slots with a handful of queries, whatever their number', async () => {
    const tx = { timetableSlot: { createMany: vi.fn(), deleteMany: vi.fn() } };
    const occupancy = {
      entriesForSlots: vi.fn().mockResolvedValue([row('a'), row('b'), row('c')]),
      detectBySlot: vi.fn().mockResolvedValue(new Map()),
      insert: vi.fn(),
    };
    const done = await placeNewSlots(tx as never, occupancy as unknown as OccupancyService, [slot('a'), slot('b'), slot('c')]);
    expect(done).toEqual({ placed: ['a', 'b', 'c'], clashes: [] });
    expect(tx.timetableSlot.createMany).toHaveBeenCalledTimes(1);
    expect(occupancy.detectBySlot).toHaveBeenCalledTimes(1);
    expect(occupancy.insert).toHaveBeenCalledTimes(1);
  });

  it('drops a clashing slot, reports it, and checks the survivors again', async () => {
    const tx = { timetableSlot: { createMany: vi.fn(), deleteMany: vi.fn() } };
    const occupancy = {
      entriesForSlots: vi.fn().mockResolvedValue([row('a'), row('b')]),
      detectBySlot: vi
        .fn()
        .mockResolvedValueOnce(new Map([['a', [clash('La salle B1 est déjà prise.', 'old')]]]))
        .mockResolvedValueOnce(new Map()),
      insert: vi.fn(),
    };
    const done = await placeNewSlots(tx as never, occupancy as unknown as OccupancyService, [slot('a'), slot('b')]);
    expect(done.placed).toEqual(['b']);
    expect(done.clashes).toEqual([{ id: 'a', message: 'La salle B1 est déjà prise.' }]);
    expect(tx.timetableSlot.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a'] } } });
    expect(occupancy.detectBySlot).toHaveBeenCalledTimes(2);
    expect(occupancy.insert).toHaveBeenCalledWith(tx, [row('b')]);
  });

  it('drops the slots that clash with the index first, and only then the ones that clash with each other', async () => {
    const tx = { timetableSlot: { createMany: vi.fn(), deleteMany: vi.fn() } };
    const occupancy = {
      entriesForSlots: vi.fn().mockResolvedValue([row('a'), row('b'), row('c')]),
      detectBySlot: vi
        .fn()
        // a clashes with b (inside the batch), b also with an existing session: only b goes first.
        .mockResolvedValueOnce(
          new Map([
            ['a', [clash('a avec b', 'b')]],
            ['b', [clash('b avec a', 'a'), clash('b avec une séance', 'old')]],
          ]),
        )
        .mockResolvedValueOnce(new Map()),
      insert: vi.fn(),
    };
    const done = await placeNewSlots(tx as never, occupancy as unknown as OccupancyService, [slot('a'), slot('b'), slot('c')]);
    expect(done.placed).toEqual(['a', 'c']);
    expect(done.clashes).toEqual([{ id: 'b', message: 'b avec une séance' }]);
  });

  it('does nothing for no slots', async () => {
    expect(await placeNewSlots({} as never, {} as never, [])).toEqual({ placed: [], clashes: [] });
  });
});
