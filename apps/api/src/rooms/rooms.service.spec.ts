import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoomsService } from './rooms.service.js';

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
const room = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Salle 12',
  capacity: 30,
  kind: 'classroom',
  active: true,
  ...over,
});

describe('RoomsService', () => {
  const tx = {
    room: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { createMany: vi.fn() },
  };
  const prisma = {
    room: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    event: { count: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  let rooms: RoomsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    const moduleRef = await Test.createTestingModule({
      providers: [RoomsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    rooms = moduleRef.get(RoomsService);
  });

  it('creates an active room, refusing a name that exists in any case', async () => {
    prisma.room.findFirst.mockResolvedValue(null);
    tx.room.create.mockResolvedValue(room());
    await expect(
      rooms.create({ name: 'Salle 12', kind: 'classroom', capacity: 30 }, ADMIN),
    ).resolves.toMatchObject({
      active: true,
      capacity: 30,
    });
    expect(tx.room.create.mock.calls[0]![0].data).toMatchObject({ active: true, capacity: 30 });
    prisma.room.findFirst.mockResolvedValue(room());
    await expect(rooms.create({ name: 'salle 12', kind: 'lab' }, ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps the capacity null when unknown', async () => {
    prisma.room.findFirst.mockResolvedValue(null);
    tx.room.create.mockResolvedValue(room({ capacity: null }));
    await rooms.create({ name: 'Cour', kind: 'hall' }, ADMIN);
    expect(tx.room.create.mock.calls[0]![0].data.capacity).toBeNull();
  });

  it('checks the name only when it changes', async () => {
    prisma.room.findUnique.mockResolvedValue(room());
    tx.room.update.mockResolvedValue(room({ name: 'SALLE 12' }));
    await rooms.update('r1', { name: 'SALLE 12' }, ADMIN);
    expect(prisma.room.findFirst).not.toHaveBeenCalled();
    prisma.room.findFirst.mockResolvedValue(room({ id: 'r2', name: 'Salle 14' }));
    await expect(rooms.update('r1', { name: 'Salle 14' }, ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('retires a room by setting it inactive, audited with before and after', async () => {
    prisma.room.findUnique.mockResolvedValue(room());
    tx.room.update.mockResolvedValue(room({ active: false }));
    await expect(rooms.update('r1', { active: false }, ADMIN)).resolves.toMatchObject({
      active: false,
    });
    expect(tx.auditLog.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      action: 'room.update',
      before: { active: true },
      after: { active: false },
    });
  });

  it('deletes a room no event uses, and 404s for an unknown one', async () => {
    prisma.room.findUnique.mockResolvedValue(room());
    prisma.event.count.mockResolvedValue(0);
    await rooms.remove('r1', ADMIN);
    expect(tx.room.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(rooms.remove('r1', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to delete a room events use, and turns a late booking into the same 409', async () => {
    prisma.room.findUnique.mockResolvedValue(room());
    prisma.event.count.mockResolvedValue(2);
    await expect(rooms.remove('r1', ADMIN)).rejects.toThrow(/désactivez-la/);
    prisma.event.count.mockResolvedValue(0);
    tx.room.delete.mockRejectedValue({ code: 'P2003' });
    await expect(rooms.remove('r1', ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });
});
