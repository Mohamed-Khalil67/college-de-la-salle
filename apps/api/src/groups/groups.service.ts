import { ConflictException, Injectable, BadRequestException } from '@nestjs/common';
import type { GroupDto as GroupContract } from '@cdls/shared';
import { canEditStructure } from '../access/grants.js';
import { AccessService } from '../access/access.service.js';
import { toStudentSummary } from '../classes/classes.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, schoolToday, toDay } from '../common/dates.js';
import {
  conflictOnReference,
  conflictOnUnique,
  forbidden,
  isUniqueViolation,
  notFound,
} from '../common/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertClassWritable } from '../school-years/year-guard.js';
import type {
  AddGroupMembersDto,
  CreateGroupDto,
  GroupDetailDto,
  GroupWithMembersDto,
  MyGroupDto,
  UpdateGroupDto,
} from './dto/group.dto.js';

type Db = Prisma.TransactionClient;

const groupInclude = {
  schoolClass: { select: { label: true } },
  members: { where: { leftOn: null }, select: { studentId: true } },
} satisfies Prisma.GroupInclude;
type GroupRow = Prisma.GroupGetPayload<{ include: typeof groupInclude }>;

const ONE_PER_DIVISION =
  'Un élève ne peut être que dans un groupe par division : retirez-le d’abord de l’autre groupe, ou déplacez-le.';
const HAS_SLOTS =
  'Ce groupe a des séances dans l’emploi du temps : supprimez-les ou changez leur groupe d’abord.';
const HAS_TARGETS =
  'Des devoirs ou des évaluations sont assignés à ce groupe : changez leur assignation d’abord.';

const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`;

/**
 * Groups of a class (TP A and TP B, LV2 Allemand and Espagnol). Admins and coordinators manage any group,
 * a teacher the groups of the classes they teach, a student reads only their own memberships. Every route
 * that names a group loads it first and authorises on ITS class, never on an id sent by the caller.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** The groups of a class with their current members' ids (the class's teachers, coordinators, admins). */
  async list(classId: string, user: AuthUser): Promise<GroupWithMembersDto[]> {
    await this.assertClass(classId);
    await this.authorize(user, classId);
    const rows = await this.prisma.group.findMany({
      where: { classId },
      include: groupInclude,
      orderBy: [{ division: 'asc' }, { label: 'asc' }],
    });
    return rows.map((r) => ({ ...toGroupDto(r), memberIds: r.members.map((m) => m.studentId) }));
  }

  async get(id: string, user: AuthUser): Promise<GroupDetailDto> {
    const row = await this.load(id);
    await this.authorize(user, row.classId);
    return this.detail(this.prisma, row);
  }

  async create(dto: CreateGroupDto, user: AuthUser): Promise<GroupDetailDto> {
    await this.assertClass(dto.classId);
    await this.authorize(user, dto.classId);
    const row = await conflictOnUnique(
      this.prisma.$transaction(async (tx) => {
        // An archived year is read-only: its groups are history.
        await assertClassWritable(tx, dto.classId);
        const made = await tx.group.create({
          data: { classId: dto.classId, division: dto.division, label: dto.label },
          include: groupInclude,
        });
        await audit(tx, [
          {
            actorId: user.id,
            action: 'group.create',
            entity: 'group',
            entityId: made.id,
            after: { classId: made.classId, division: made.division, label: made.label },
          },
        ]);
        return made;
      }),
      `Un groupe « ${dto.label} » existe déjà dans la division « ${dto.division} » de cette classe.`,
    );
    return this.detail(this.prisma, row);
  }

  async update(id: string, dto: UpdateGroupDto, user: AuthUser): Promise<GroupDetailDto> {
    const current = await this.load(id);
    await this.authorize(user, current.classId);
    const division = dto.division ?? current.division;
    const label = dto.label ?? current.label;
    if (division === current.division && label === current.label)
      return this.detail(this.prisma, current);
    try {
      await this.prisma.$transaction(async (tx) => {
        await assertClassWritable(tx, current.classId);
        if (division !== current.division) {
          // The group row is locked first: a session being added to it (which reads the group FOR SHARE)
          // waits, so no session keeps the old division.
          await tx.$queryRaw`SELECT id FROM groups WHERE id = ${id}::uuid FOR UPDATE`;
          if (await tx.timetableSlot.count({ where: { groupId: id } }))
            throw new ConflictException(
              `${HAS_SLOTS} (Changer la division d’un groupe change la façon dont ses séances se chevauchent.)`,
            );
          // A timed test for the group holds its division in the occupancy index.
          if (await tx.assessmentTarget.count({ where: { groupId: id } }))
            throw new ConflictException(
              `${HAS_TARGETS} (Changer la division d’un groupe change la façon dont ses évaluations se chevauchent avec les séances.)`,
            );
        }
        if (await tx.group.findFirst({ where: { classId: current.classId, division, label, id: { not: id } } }))
          throw new ConflictException(
            `Un groupe « ${label} » existe déjà dans la division « ${division} » de cette classe.`,
          );
        await tx.group.update({ where: { id }, data: { division, label } });
        if (division !== current.division)
          await tx.groupMember.updateMany({ where: { groupId: id }, data: { division } });
        await audit(tx, [
          {
            actorId: user.id,
            action: 'group.update',
            entity: 'group',
            entityId: id,
            before: { division: current.division, label: current.label },
            after: { division, label },
          },
        ]);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          division !== current.division
            ? `Des élèves de ce groupe sont déjà dans un autre groupe de la division « ${division} ». ${ONE_PER_DIVISION}`
            : `Un groupe « ${label} » existe déjà dans la division « ${division} » de cette classe.`,
        );
      throw error;
    }
    return this.detail(this.prisma, await this.load(id));
  }

  /** Deletes a group nobody uses: no timetable session and no work assigned to it (409 otherwise). */
  async remove(id: string, user: AuthUser): Promise<void> {
    const current = await this.load(id);
    await this.authorize(user, current.classId);
    const work = this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, current.classId);
      if (await tx.timetableSlot.count({ where: { groupId: id } }))
        throw new ConflictException(HAS_SLOTS);
      if (await tx.assessmentTarget.count({ where: { groupId: id } }))
        throw new ConflictException(HAS_TARGETS);
      await tx.group.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'group.delete',
          entity: 'group',
          entityId: id,
          before: { classId: current.classId, division: current.division, label: current.label },
        },
      ]);
    });
    await conflictOnReference(work, `${HAS_SLOTS} ${HAS_TARGETS}`);
  }

  /**
   * Adds students (enrolled in the group's class) to the group. A student already in ANOTHER group of the
   * same division is refused with the name of that group, unless `move` is set: then they leave it today.
   */
  async addMembers(id: string, dto: AddGroupMembersDto, user: AuthUser): Promise<GroupDetailDto> {
    const group = await this.load(id);
    await this.authorize(user, group.classId);
    const ids = [...new Set(dto.studentIds)];
    const today = fromDay(schoolToday());
    try {
      await this.prisma.$transaction(async (tx) => {
        await assertClassWritable(tx, group.classId);
        // Lock the enrolments: a student leaving the class at the same moment waits for this commit and
        // then leaves the group with the rest of their memberships.
        const enrolled = await tx.$queryRaw<{ student_id: string }[]>`
          SELECT student_id FROM enrollments
           WHERE class_id = ${group.classId}::uuid AND left_on IS NULL AND student_id = ANY(${ids}::uuid[])
             FOR SHARE`;
        const inClass = new Set(enrolled.map((e) => e.student_id));
        const people = await tx.student.findMany({
          where: { id: { in: ids } },
          include: { user: true },
        });
        if (people.length !== ids.length) throw notFound('Élève');
        const outside = people.find((p) => !inClass.has(p.id));
        if (outside)
          throw new BadRequestException(
            `${fullName(outside.user)} n’est pas inscrit(e) dans cette classe : un groupe ne réunit que des élèves de la classe.`,
          );

        const open = await tx.groupMember.findMany({
          where: { classId: group.classId, division: group.division, leftOn: null, studentId: { in: ids } },
          include: { group: true },
        });
        const elsewhere = open.filter((m) => m.groupId !== id);
        if (elsewhere.length && !dto.move) {
          const lines = elsewhere.map((m) => {
            const p = people.find((x) => x.id === m.studentId)!;
            return `${fullName(p.user)} est déjà dans « ${m.group.label} »`;
          });
          throw new ConflictException(
            `${lines.join(' ; ')} (division « ${group.division} »). ${ONE_PER_DIVISION}`,
          );
        }
        if (elsewhere.length) {
          await tx.$executeRaw`
            UPDATE group_members SET left_on = GREATEST(joined_on, ${today}::date)
             WHERE id = ANY(${elsewhere.map((m) => m.id)}::uuid[])`;
        }
        const already = new Set(open.filter((m) => m.groupId === id).map((m) => m.studentId));
        const fresh = ids.filter((s) => !already.has(s));
        if (fresh.length)
          await tx.groupMember.createMany({
            data: fresh.map((studentId) => ({
              groupId: id,
              studentId,
              classId: group.classId,
              division: group.division,
              joinedOn: today,
            })),
          });
        await audit(tx, [
          {
            actorId: user.id,
            action: 'group.members_add',
            entity: 'group',
            entityId: id,
            after: { added: fresh.length, moved: elsewhere.length, studentIds: fresh },
          },
        ]);
      });
    } catch (error) {
      // Two requests added the same student to two groups of one division at the same moment.
      if (isUniqueViolation(error)) throw new ConflictException(ONE_PER_DIVISION);
      throw error;
    }
    return this.detail(this.prisma, await this.load(id));
  }

  /** Takes a student out of the group today (soft: the membership stays as history). */
  async removeMember(id: string, studentId: string, user: AuthUser): Promise<GroupDetailDto> {
    const group = await this.load(id);
    await this.authorize(user, group.classId);
    const today = fromDay(schoolToday());
    await this.prisma.$transaction(async (tx) => {
      await assertClassWritable(tx, group.classId);
      const closed = await tx.$executeRaw`
        UPDATE group_members SET left_on = GREATEST(joined_on, ${today}::date)
         WHERE group_id = ${id}::uuid AND student_id = ${studentId}::uuid AND left_on IS NULL`;
      if (!closed) throw notFound('Membre');
      await audit(tx, [
        {
          actorId: user.id,
          action: 'group.member_remove',
          entity: 'group',
          entityId: id,
          after: { studentId },
        },
      ]);
    });
    return this.detail(this.prisma, await this.load(id));
  }

  /** The signed-in student's own groups (and nobody else's). */
  async mine(user: AuthUser): Promise<MyGroupDto[]> {
    if (!user.studentId) throw forbidden();
    const rows = await this.prisma.groupMember.findMany({
      where: { studentId: user.studentId, leftOn: null, group: { schoolClass: { schoolYear: { isCurrent: true } } } },
      include: { group: true },
      orderBy: [{ division: 'asc' }, { group: { label: 'asc' } }],
    });
    return rows.map((m) => ({
      id: m.group.id,
      classId: m.group.classId,
      division: m.group.division,
      label: m.group.label,
      joinedOn: toDay(m.joinedOn),
    }));
  }

  /* Internals --------------------------------------------------------------------------------- */

  private async load(id: string): Promise<GroupRow> {
    const row = await this.prisma.group.findUnique({ where: { id }, include: groupInclude });
    if (!row) throw notFound('Groupe');
    return row;
  }

  private async assertClass(classId: string): Promise<void> {
    if (!(await this.prisma.schoolClass.findUnique({ where: { id: classId }, select: { id: true } })))
      throw notFound('Classe');
  }

  /** Admins and coordinators: any class. A teacher: a class they teach. Everyone else: refused. */
  private async authorize(user: AuthUser, classId: string): Promise<void> {
    if (canEditStructure(user)) return;
    await this.access.assertTeachesClass(user, classId);
  }

  private async detail(db: Db, row: GroupRow): Promise<GroupDetailDto> {
    const members = await db.groupMember.findMany({
      where: { groupId: row.id, leftOn: null },
      include: { student: { include: { user: true } } },
      orderBy: [
        { student: { user: { lastName: 'asc' } } },
        { student: { user: { firstName: 'asc' } } },
      ],
    });
    return {
      ...toGroupDto(row),
      members: members.map((m) => {
        const s = toStudentSummary(m.student);
        return {
          id: s.id,
          userId: s.userId,
          firstName: s.firstName,
          lastName: s.lastName,
          studentNumber: s.studentNumber,
          joinedOn: toDay(m.joinedOn),
        };
      }),
    };
  }
}

function toGroupDto(r: GroupRow): GroupContract {
  return {
    id: r.id,
    classId: r.classId,
    classLabel: r.schoolClass.label,
    division: r.division,
    label: r.label,
    memberCount: r.members.length,
    createdAt: r.createdAt.toISOString(),
  };
}
