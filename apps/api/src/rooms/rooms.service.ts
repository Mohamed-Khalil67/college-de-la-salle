import { ConflictException, Injectable } from '@nestjs/common';
import type { RoomKind } from '@cdls/shared';
import type { Room } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { conflictOnReference, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateRoomDto, RoomDto, UpdateRoomDto } from './dto/room.dto.js';

const IN_USE = 'Des événements utilisent cette salle : désactivez-la plutôt que de la supprimer.';

/** The school's rooms. Booking clashes are checked from phase 2 on (occupancy table). */
@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RoomDto[]> {
    const rows = await this.prisma.room.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toRoomDto);
  }

  async create(dto: CreateRoomDto, user: AuthUser): Promise<RoomDto> {
    await this.assertNameFree(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.room.create({
        data: {
          name: dto.name,
          capacity: dto.capacity ?? null,
          kind: dto.kind,
          active: dto.active ?? true,
        },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'room.create',
          entity: 'room',
          entityId: row.id,
          after: snapshot(row),
        },
      ]);
      return toRoomDto(row);
    });
  }

  async update(id: string, dto: UpdateRoomDto, user: AuthUser): Promise<RoomDto> {
    const current = await this.find(id);
    if (dto.name !== undefined && dto.name.toLowerCase() !== current.name.toLowerCase())
      await this.assertNameFree(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.room.update({
        where: { id },
        data: { name: dto.name, capacity: dto.capacity, kind: dto.kind, active: dto.active },
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'room.update',
          entity: 'room',
          entityId: id,
          before: snapshot(current),
          after: snapshot(row),
        },
      ]);
      return toRoomDto(row);
    });
  }

  /** Deletes a room no event uses; 409 otherwise (deactivate it instead). */
  async remove(id: string, user: AuthUser): Promise<void> {
    const current = await this.find(id);
    if (await this.prisma.event.count({ where: { roomId: id } }))
      throw new ConflictException(IN_USE);
    const work = this.prisma.$transaction(async (tx) => {
      await tx.room.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'room.delete',
          entity: 'room',
          entityId: id,
          before: snapshot(current),
        },
      ]);
    });
    // An event booked between the check and the delete (restrict foreign key).
    await conflictOnReference(work, IN_USE);
  }

  private async assertNameFree(name: string): Promise<void> {
    if (
      await this.prisma.room.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    )
      throw new ConflictException(`La salle « ${name} » existe déjà.`);
  }

  private async find(id: string): Promise<Room> {
    const row = await this.prisma.room.findUnique({ where: { id } });
    if (!row) throw notFound('Salle');
    return row;
  }
}

function snapshot(r: Room) {
  return { name: r.name, capacity: r.capacity, kind: r.kind, active: r.active };
}

export function toRoomDto(r: Room): RoomDto {
  return {
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    kind: r.kind as RoomKind,
    active: r.active,
  };
}
