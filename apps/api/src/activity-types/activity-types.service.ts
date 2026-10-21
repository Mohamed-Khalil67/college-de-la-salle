import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { ActivityColour, ActivityIcon, ActivityTypeSummary } from '@cdls/shared';
import type { ActivityType, Prisma } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { conflictOnReference, forbidden, notFound } from '../common/errors.js';
import { uniqueSlug } from '../common/slug.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ActivityTypeDto,
  ActivityTypeListQueryDto,
  CreateActivityTypeDto,
  UpdateActivityTypeDto,
} from './dto/activity-type.dto.js';

const include = {
  owner: { include: { user: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.ActivityTypeInclude;

type Row = Prisma.ActivityTypeGetPayload<{ include: typeof include }>;

const FLAGS = ['gradable', 'repeatable', 'homework'] as const;
const IN_USE = 'Des événements utilisent ce type : archivez-le plutôt que de le supprimer.';

/**
 * Activity types. System and school-wide types (no owner) are seen by everyone; a teacher's own types are
 * private to them until the admin promotes them. Flags never change once events use a type, so the rules
 * that read them (grades, homework, repetition) stay true for existing events.
 */
@Injectable()
export class ActivityTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** School-wide types and the teacher's own; every type for the admin. System types first. */
  async list(query: ActivityTypeListQueryDto, user: AuthUser): Promise<ActivityTypeDto[]> {
    const rows = await this.prisma.activityType.findMany({
      where: {
        ...this.visibleTo(user),
        ...(query.includeArchived ? {} : { archivedAt: null }),
      },
      include,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toActivityTypeDto);
  }

  /** A teacher creates a private type; the admin a school-wide one. */
  async create(dto: CreateActivityTypeDto, user: AuthUser): Promise<ActivityTypeDto> {
    if (user.role !== 'admin' && !user.teacherId) throw forbidden();
    checkFlags(dto);
    const code = await uniqueSlug(
      dto.label,
      async (slug) => !!(await this.prisma.activityType.findUnique({ where: { code: slug } })),
    );
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.activityType.create({
        data: {
          code,
          label: dto.label,
          colour: dto.colour,
          icon: dto.icon,
          gradable: dto.gradable,
          repeatable: dto.repeatable,
          homework: dto.homework,
          ownerTeacherId: user.role === 'admin' ? null : user.teacherId,
        },
        include,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'activity_type.create',
          entity: 'activity_type',
          entityId: row.id,
          after: snapshot(row),
        },
      ]);
      return toActivityTypeDto(row);
    });
  }

  /**
   * The owner (private types) or the admin. System types keep their flags and can't be archived; any type
   * keeps its flags once events use it.
   */
  async update(id: string, dto: UpdateActivityTypeDto, user: AuthUser): Promise<ActivityTypeDto> {
    const current = await this.editable(id, user);
    const flagsChange = FLAGS.some((f) => dto[f] !== undefined && dto[f] !== current[f]);
    if (current.isSystem && (flagsChange || dto.archived))
      throw new BadRequestException(
        'Un type du système garde ses options et ne s’archive pas : seuls le nom, la couleur et l’icône changent.',
      );
    if (flagsChange) {
      checkFlags({ ...pickFlags(current), ...definedFlags(dto) });
      if (await this.prisma.event.count({ where: { activityTypeId: id } }))
        throw new ConflictException(
          'Des événements utilisent ce type : ses options (noté, hebdomadaire, devoir) ne peuvent plus changer.',
        );
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.activityType.update({
        where: { id },
        data: {
          label: dto.label,
          colour: dto.colour,
          icon: dto.icon,
          gradable: dto.gradable,
          repeatable: dto.repeatable,
          homework: dto.homework,
          archivedAt:
            dto.archived === undefined
              ? undefined
              : dto.archived
                ? (current.archivedAt ?? new Date())
                : null,
        },
        include,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'activity_type.update',
          entity: 'activity_type',
          entityId: id,
          before: snapshot(current),
          after: snapshot(row),
        },
      ]);
      return toActivityTypeDto(row);
    });
  }

  /** Deletes an unused, non-system type (owner or admin); 409 when events use it. */
  async remove(id: string, user: AuthUser): Promise<void> {
    const current = await this.editable(id, user);
    if (current.isSystem) throw new BadRequestException('Un type du système ne se supprime pas.');
    if (await this.prisma.event.count({ where: { activityTypeId: id } }))
      throw new ConflictException(IN_USE);
    const work = this.prisma.$transaction(async (tx) => {
      await tx.activityType.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'activity_type.delete',
          entity: 'activity_type',
          entityId: id,
          before: snapshot(current),
        },
      ]);
    });
    // An event created with it between the check and the delete (restrict foreign key).
    await conflictOnReference(work, IN_USE);
  }

  /** Admin: makes a teacher's private type school-wide (it then belongs to the school, not the teacher). */
  async promote(id: string, user: AuthUser): Promise<ActivityTypeDto> {
    const current = await this.prisma.activityType.findUnique({ where: { id }, include });
    if (!current) throw notFound('Type d’activité');
    if (!current.ownerTeacherId) throw new ConflictException('Ce type est déjà commun à l’école.');
    if (current.archivedAt) throw new ConflictException('Restaurez ce type avant de le partager.');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.activityType.update({
        where: { id },
        data: { ownerTeacherId: null },
        include,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'activity_type.promote',
          entity: 'activity_type',
          entityId: id,
          before: { ownerTeacherId: current.ownerTeacherId },
          after: { ownerTeacherId: null },
        },
      ]);
      return toActivityTypeDto(row);
    });
  }

  /**
   * The type an event may use: visible to the user and not archived (an event that already has it keeps
   * it). 404 for another teacher's private type.
   */
  async usable(id: string, user: AuthUser, keepId?: string): Promise<ActivityType> {
    const row = await this.prisma.activityType.findFirst({
      where: { id, ...this.visibleTo(user) },
    });
    if (!row) throw notFound('Type d’activité');
    if (row.archivedAt && row.id !== keepId)
      throw new BadRequestException('Ce type d’activité est archivé.');
    return row;
  }

  /** Teachers see school-wide types and their own; the admin sees all. */
  private visibleTo(user: AuthUser): Prisma.ActivityTypeWhereInput {
    if (user.role === 'admin') return {};
    return {
      OR: [
        { ownerTeacherId: null },
        ...(user.teacherId ? [{ ownerTeacherId: user.teacherId }] : []),
      ],
    };
  }

  /** The admin edits every type; a teacher only their own (another teacher's private type: 404). */
  private async editable(id: string, user: AuthUser): Promise<Row> {
    const row = await this.prisma.activityType.findFirst({
      where: { id, ...this.visibleTo(user) },
      include,
    });
    if (!row) throw notFound('Type d’activité');
    if (user.role !== 'admin' && row.ownerTeacherId !== user.teacherId) throw forbidden();
    return row;
  }
}

type Flags = Record<(typeof FLAGS)[number], boolean>;

function pickFlags(t: Flags): Flags {
  return { gradable: t.gradable, repeatable: t.repeatable, homework: t.homework };
}

function definedFlags(dto: Partial<Flags>): Partial<Flags> {
  return Object.fromEntries(FLAGS.filter((f) => dto[f] !== undefined).map((f) => [f, dto[f]]));
}

/** Homework is due on one day: it never repeats. */
function checkFlags(flags: Flags): void {
  if (flags.homework && flags.repeatable)
    throw new BadRequestException('Un devoir à rendre ne se répète pas chaque semaine.');
}

function snapshot(t: ActivityType) {
  return {
    code: t.code,
    label: t.label,
    colour: t.colour,
    icon: t.icon,
    ...pickFlags(t),
    ownerTeacherId: t.ownerTeacherId,
    archived: !!t.archivedAt,
  };
}

export function toActivityTypeSummary(t: ActivityType): ActivityTypeSummary {
  return {
    id: t.id,
    code: t.code,
    label: t.label,
    colour: t.colour as ActivityColour,
    icon: t.icon as ActivityIcon,
    ...pickFlags(t),
  };
}

export function toActivityTypeDto(t: Row): ActivityTypeDto {
  return {
    ...toActivityTypeSummary(t),
    isSystem: t.isSystem,
    ownerTeacherId: t.ownerTeacherId,
    ownerName: t.owner ? `${t.owner.user.firstName} ${t.owner.user.lastName}` : null,
    archived: !!t.archivedAt,
  };
}
