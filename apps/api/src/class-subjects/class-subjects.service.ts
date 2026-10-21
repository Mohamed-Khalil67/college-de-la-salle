import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { conflictOnUnique, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ClassSubjectDto,
  CreateClassSubjectDto,
  UpdateClassSubjectDto,
} from './dto/class-subject.dto.js';

const include = {
  subject: true,
  assignments: { include: { teacher: { include: { user: true } } } },
} satisfies Prisma.ClassSubjectInclude;

type Row = Prisma.ClassSubjectGetPayload<{ include: typeof include }>;

const WEIGHTS_LOCKED =
  'Une période de cette classe est clôturée ou a des bulletins : les coefficients ne peuvent plus changer.';
const OWN_SUBJECT =
  'Seul un administrateur peut modifier le coefficient d’une matière que vous enseignez dans cette classe.';

const HAS_SLOTS = 'Des séances de l’emploi du temps utilisent cette matière dans la classe : supprimez-les d’abord.';
const HAS_TEACHERS = 'Cette matière a encore des enseignants dans la classe : retirez-les d’abord.';

/**
 * The subjects of a class and their coefficients: the weights of the class's general average (report
 * cards, student averages). Teaching assignments hang off them.
 */
@Injectable()
export class ClassSubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(classId: string): Promise<ClassSubjectDto[]> {
    await this.findClass(classId);
    return this.rows(classId);
  }

  /** Adds a subject that applies to the class's section and is not archived. */
  async create(
    classId: string,
    dto: CreateClassSubjectDto,
    user: AuthUser,
  ): Promise<ClassSubjectDto> {
    const schoolClass = await this.findClass(classId);
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) throw notFound('Matière');
    if (subject.archivedAt) throw new BadRequestException('Cette matière est archivée.');
    if (!subject.sections.includes(schoolClass.section.code))
      throw new BadRequestException(`« ${subject.name} » n’est pas enseignée dans cette section.`);
    if (
      await this.prisma.classSubject.findUnique({
        where: { classId_subjectId: { classId, subjectId: dto.subjectId } },
      })
    )
      throw new ConflictException(`La classe a déjà « ${subject.name} ».`);
    const work = this.prisma.$transaction(async (tx) => {
      const row = await tx.classSubject.create({
        data: {
          classId,
          subjectId: dto.subjectId,
          coefficient: dto.coefficient ?? 1,
          hoursPerWeek: dto.hoursPerWeek ?? null,
        },
        include,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'class_subject.create',
          entity: 'class_subject',
          entityId: row.id,
          after: snapshot(row),
        },
      ]);
      return toClassSubjectDto(row);
    });
    return conflictOnUnique(work, `La classe a déjà « ${subject.name} ».`);
  }

  /**
   * Changes the coefficient or the hours. The coefficient is frozen once a period of the class's section is
   * closed or has report cards (409), and only an admin may change one for a subject they teach themself.
   */
  async update(id: string, dto: UpdateClassSubjectDto, user: AuthUser): Promise<ClassSubjectDto> {
    const current = await this.find(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.coefficient !== undefined && dto.coefficient !== Number(current.coefficient)) {
        if (user.role !== 'admin' && current.assignments.some((a) => a.teacherId === user.teacherId))
          throw new ForbiddenException(OWN_SUBJECT);
        await this.assertWeightsEditable(tx, current.classId);
      }
      const row = await tx.classSubject.update({
        where: { id },
        data: { coefficient: dto.coefficient, hoursPerWeek: dto.hoursPerWeek },
        include,
      });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'class_subject.update',
          entity: 'class_subject',
          entityId: id,
          before: snapshot(current),
          after: snapshot(row),
        },
      ]);
      return toClassSubjectDto(row);
    });
  }

  /** Removes a subject from a class: refused while it has teachers or grades. */
  async remove(id: string, user: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Lock the row: a teacher assigned meanwhile waits, then fails on the deleted row.
      await tx.$queryRaw`SELECT id FROM class_subjects WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.classSubject.findUnique({ where: { id }, include });
      if (!current) throw notFound('Matière de la classe');
      if (current.assignments.length) throw new ConflictException(HAS_TEACHERS);
      if (await tx.timetableSlot.count({ where: { classSubjectId: id } })) throw new ConflictException(HAS_SLOTS);
      const grades = await tx.grade.count({
        where: { event: { classId: current.classId, subjectId: current.subjectId } },
      });
      if (grades)
        throw new ConflictException(
          'Des notes existent pour cette matière dans la classe : elle ne peut plus être retirée.',
        );
      if (
        await tx.event.count({
          where: {
            classId: current.classId,
            subjectId: current.subjectId,
            activityType: { gradable: true },
          },
        })
      )
        throw new ConflictException(
          'Des événements notés existent pour cette matière dans la classe : supprimez-les d’abord.',
        );
      await tx.classSubject.delete({ where: { id } });
      await audit(tx, [
        {
          actorId: user.id,
          action: 'class_subject.delete',
          entity: 'class_subject',
          entityId: id,
          before: snapshot(current),
        },
      ]);
    });
  }

  /**
   * « Copier depuis la classe… »: adds the source's subjects that the class lacks and aligns the coefficient
   * and hours of those it has. Archived subjects and subjects of another section are skipped; teachers are
   * not copied.
   */
  async copy(classId: string, fromClassId: string, user: AuthUser): Promise<ClassSubjectDto[]> {
    if (classId === fromClassId)
      throw new BadRequestException('Choisissez une autre classe à copier.');
    const target = await this.findClass(classId);
    await this.findClass(fromClassId);
    const source = await this.prisma.classSubject.findMany({
      where: { classId: fromClassId },
      include: { subject: true },
    });
    const copied = source.filter(
      (s) => !s.subject.archivedAt && s.subject.sections.includes(target.section.code),
    );
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.classSubject.findMany({
        where: { classId },
        include: { assignments: true },
      });
      const changing = existing.filter((e) => {
        const from = copied.find((s) => s.subjectId === e.subjectId);
        return from && !from.coefficient.equals(e.coefficient);
      });
      if (changing.length) {
        if (
          user.role !== 'admin' &&
          changing.some((e) => e.assignments.some((a) => a.teacherId === user.teacherId))
        )
          throw new ForbiddenException(OWN_SUBJECT);
        await this.assertWeightsEditable(tx, classId);
      }
      for (const s of copied) {
        const values = { coefficient: s.coefficient, hoursPerWeek: s.hoursPerWeek };
        await tx.classSubject.upsert({
          where: { classId_subjectId: { classId, subjectId: s.subjectId } },
          create: { classId, subjectId: s.subjectId, ...values },
          update: values,
        });
      }
      await audit(tx, [
        {
          actorId: user.id,
          action: 'class_subject.copy',
          entity: 'school_class',
          entityId: classId,
          after: { fromClassId, subjects: copied.map((s) => s.subjectId) },
        },
      ]);
    });
    return this.rows(classId);
  }

  /**
   * 409 when a period of the class's section and year is closed or has report cards for the class. Takes a
   * share lock on those periods, so closing one (exclusive lock) cannot slip in before the write commits.
   */
  private async assertWeightsEditable(tx: Prisma.TransactionClient, classId: string): Promise<void> {
    const schoolClass = await tx.schoolClass.findUniqueOrThrow({ where: { id: classId } });
    const periods = await tx.$queryRaw<{ id: string; closed_at: Date | null }[]>`
      SELECT id, closed_at FROM periods
      WHERE school_year_id = ${schoolClass.schoolYearId}::uuid
        AND (section_id IS NULL OR section_id = ${schoolClass.sectionId}::uuid)
      FOR SHARE`;
    if (periods.some((p) => p.closed_at)) throw new ConflictException(WEIGHTS_LOCKED);
    if (await tx.reportCard.count({ where: { classId } }))
      throw new ConflictException(WEIGHTS_LOCKED);
  }

  private async rows(classId: string): Promise<ClassSubjectDto[]> {
    const rows = await this.prisma.classSubject.findMany({
      where: { classId },
      include,
      orderBy: { subject: { name: 'asc' } },
    });
    return rows.map(toClassSubjectDto);
  }

  private async findClass(id: string) {
    const schoolClass = await this.prisma.schoolClass.findUnique({
      where: { id },
      include: { section: true },
    });
    if (!schoolClass) throw notFound('Classe');
    return schoolClass;
  }

  private async find(id: string): Promise<Row> {
    const row = await this.prisma.classSubject.findUnique({ where: { id }, include });
    if (!row) throw notFound('Matière de la classe');
    return row;
  }
}

function snapshot(r: Row) {
  return {
    classId: r.classId,
    subjectId: r.subjectId,
    coefficient: Number(r.coefficient),
    hoursPerWeek: r.hoursPerWeek === null ? null : Number(r.hoursPerWeek),
  };
}

export function toClassSubjectDto(r: Row): ClassSubjectDto {
  return {
    id: r.id,
    classId: r.classId,
    subjectId: r.subjectId,
    subjectName: r.subject.name,
    coefficient: Number(r.coefficient),
    hoursPerWeek: r.hoursPerWeek === null ? null : Number(r.hoursPerWeek),
    teachers: r.assignments
      .map((a) => ({
        assignmentId: a.id,
        teacherId: a.teacherId,
        teacherName: `${a.teacher.user.firstName} ${a.teacher.user.lastName}`,
      }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'fr')),
  };
}
