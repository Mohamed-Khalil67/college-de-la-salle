import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContactService } from './contact.service.js';

const ADMIN: AuthUser = {
  id: 'u-admin',
  email: 'admin@x.y',
  role: 'admin',
  firstName: 'A',
  lastName: 'D',
  studentId: null,
  teacherId: null,
  classId: null,
  isCoordinator: false,
  classLabel: null,
  sectionCode: null,
  mustChangePassword: false,
};

const row = (overrides = {}) => ({
  id: 'm1',
  name: 'Mariam Saad',
  email: 'mariam@example.com',
  phone: '',
  subject: 'Demande d’inscription',
  track: '',
  message: 'Bonjour',
  createdAt: new Date('2026-10-20T08:00:00Z'),
  handledAt: null,
  handledById: null,
  handledBy: null,
  ...overrides,
});

describe('ContactService', () => {
  const prisma = {
    contactMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { createMany: vi.fn() },
    // Array form (list) or interactive form (setHandled, run against this same mock).
    $transaction: vi.fn((work: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
      typeof work === 'function' ? work(prisma) : Promise.all(work),
    ),
  };
  let contact: ContactService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [ContactService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    contact = moduleRef.get(ContactService);
  });

  it('stores a message with empty optional fields', async () => {
    await contact.create({
      name: 'Mariam Saad',
      email: 'mariam@example.com',
      subject: 'Autre question',
      message: 'Bonjour',
    });
    expect(prisma.contactMessage.create).toHaveBeenCalledWith({
      data: {
        name: 'Mariam Saad',
        email: 'mariam@example.com',
        subject: 'Autre question',
        message: 'Bonjour',
        phone: '',
        track: '',
      },
    });
  });

  it('drops a message whose honeypot is filled in, with the same answer', async () => {
    await expect(
      contact.create({
        name: 'Bot',
        email: 'bot@example.com',
        subject: 'Promo',
        message: 'Buy now',
        website: 'https://spam.example',
      }),
    ).resolves.toBeUndefined();
    expect(prisma.contactMessage.create).not.toHaveBeenCalled();
  });

  it('lists newest first, filtered by state, paginated', async () => {
    prisma.contactMessage.findMany.mockResolvedValue([
      row({
        handledAt: new Date('2026-10-20T09:00:00Z'),
        handledById: 'u-admin',
        handledBy: { firstName: 'Nadia', lastName: 'Farid' },
      }),
    ]);
    prisma.contactMessage.count.mockResolvedValue(21);
    const page = await contact.list({ page: 2, pageSize: 20, handled: true });
    expect(prisma.contactMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { handledAt: { not: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 20,
      }),
    );
    expect(page).toMatchObject({ total: 21, page: 2, pageSize: 20 });
    expect(page.items[0]).toMatchObject({
      handledAt: '2026-10-20T09:00:00.000Z',
      handledByName: 'Nadia Farid',
    });

    await contact.list({ page: 1, pageSize: 20, handled: false });
    expect(prisma.contactMessage.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { handledAt: null } }),
    );
    await contact.list({ page: 1, pageSize: 20 });
    expect(prisma.contactMessage.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('marks a message handled by the admin (audited), keeps an earlier handler, and reopens it', async () => {
    prisma.contactMessage.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.contactMessage.findUniqueOrThrow.mockResolvedValue(row());
    prisma.contactMessage.updateMany.mockResolvedValue({ count: 1 });
    await contact.setHandled('m1', true, ADMIN);
    const first = prisma.contactMessage.updateMany.mock.calls[0]![0] as {
      where: object;
      data: { handledAt: Date; handledById: string };
    };
    // Only a waiting message is marked: a concurrent admin who got there first stays the handler.
    expect(first.where).toEqual({ id: 'm1', handledAt: null });
    expect(first.data.handledAt).toBeInstanceOf(Date);
    expect(first.data.handledById).toBe('u-admin');
    expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          actorId: 'u-admin',
          action: 'contact_message.handle',
          entity: 'contact_message',
          entityId: 'm1',
        },
      ],
    });

    // Already handled: nothing changes, nothing is audited.
    vi.clearAllMocks();
    prisma.contactMessage.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.contactMessage.findUniqueOrThrow.mockResolvedValue(row());
    prisma.contactMessage.updateMany.mockResolvedValue({ count: 0 });
    await contact.setHandled('m1', true, ADMIN);
    expect(prisma.auditLog.createMany).not.toHaveBeenCalled();

    prisma.contactMessage.updateMany.mockResolvedValue({ count: 1 });
    await contact.setHandled('m1', false, ADMIN);
    expect(prisma.contactMessage.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'm1', handledAt: { not: null } },
      data: { handledAt: null, handledById: null },
    });
    expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: 'contact_message.reopen' })],
    });
  });

  it('answers 404 for an unknown message', async () => {
    prisma.contactMessage.findUnique.mockResolvedValue(null);
    await expect(contact.setHandled('nope', true, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });
});
