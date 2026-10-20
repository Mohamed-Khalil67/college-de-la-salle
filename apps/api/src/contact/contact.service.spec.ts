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
      update: vi.fn(),
    },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
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

  it('marks a message handled by the admin, keeps the first handler, and reopens it', async () => {
    prisma.contactMessage.findUnique.mockResolvedValue(row());
    prisma.contactMessage.update.mockResolvedValue(row());
    await contact.setHandled('m1', true, ADMIN);
    const first = prisma.contactMessage.update.mock.calls[0]![0] as {
      data: { handledAt: Date; handledById: string };
    };
    expect(first.data.handledAt).toBeInstanceOf(Date);
    expect(first.data.handledById).toBe('u-admin');

    const earlier = new Date('2026-10-19T10:00:00Z');
    prisma.contactMessage.findUnique.mockResolvedValue(
      row({ handledAt: earlier, handledById: 'u-other' }),
    );
    await contact.setHandled('m1', true, ADMIN);
    expect(prisma.contactMessage.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { handledAt: earlier, handledById: 'u-other' } }),
    );

    await contact.setHandled('m1', false, ADMIN);
    expect(prisma.contactMessage.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { handledAt: null, handledById: null } }),
    );
  });

  it('answers 404 for an unknown message', async () => {
    prisma.contactMessage.findUnique.mockResolvedValue(null);
    await expect(contact.setHandled('nope', true, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });
});
