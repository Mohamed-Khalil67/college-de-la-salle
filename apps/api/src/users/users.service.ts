import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  assignSchoolEmails,
  type ImportRole,
  type Paginated,
  type SectionId,
} from '@cdls/shared';
import { hash } from 'argon2';
import { parse } from 'csv-parse/sync';
import type { Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { AuthService } from '../auth/auth.service.js';
import { audit } from '../common/audit.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromDay, toDay, toIso } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { pageArgs, paginated } from '../common/pagination.js';
import type { Env } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ArchiveStudentsDto,
  ArchiveStudentsResultDto,
  CreatedUserDto,
  CreateUserDto,
  ImportPreviewDto,
  ImportUsersDto,
  UpdateUserDto,
  UserDto,
  UserListQueryDto,
} from './dto/user.dto.js';
import {
  type CheckedRoster,
  checkRoster,
  headerProblems,
  columnName,
  MAX_IMPORT_ROWS,
} from './roster-import.js';

const HASH_CONCURRENCY = 4;
const ARCHIVED = 'Compte archivé : restaurez-le avant de le modifier.';

const include = {
  teacher: { select: { id: true } },
  student: {
    select: {
      id: true,
      studentNumber: true,
      graduatedOn: true,
      section: { select: { code: true } },
      enrollments: {
        where: { schoolYear: { isCurrent: true }, leftOn: null },
        select: { classId: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof include }>;

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class UsersService {
  private readonly domain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.domain = config.get('SCHOOL_EMAIL_DOMAIN', { infer: true });
  }

  async list(query: UserListQueryDto): Promise<Paginated<UserDto>> {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(toUserDto), total, query);
  }

  async get(id: string): Promise<UserDto> {
    return toUserDto(await this.row(id));
  }

  /**
   * Creates one account with a temporary password (shown once). Without an e-mail, the school address
   * `prenom.nom@<domain>` is generated. A student's class sets their section.
   */
  async create(dto: CreateUserDto): Promise<CreatedUserDto> {
    if (dto.role !== 'student' && (dto.classId || dto.studentNumber || dto.birthDate)) {
      throw new BadRequestException(
        'Classe, matricule et date de naissance concernent uniquement les élèves.',
      );
    }
    const schoolClass = dto.classId
      ? await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } })
      : null;
    if (dto.classId && !schoolClass) throw notFound('Classe');
    if (dto.studentNumber && (await this.prisma.student.findUnique({ where: { studentNumber: dto.studentNumber } })))
      throw new ConflictException('Ce matricule est déjà utilisé.');

    const email = dto.email ?? (await this.generatedEmail(dto.firstName, dto.lastName));
    if (dto.email && (await this.prisma.user.findUnique({ where: { email: dto.email } }))) {
      throw new ConflictException('Un compte existe déjà avec cette adresse e-mail.');
    }
    const temporaryPassword = generatePassword();
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: await hash(temporaryPassword),
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
          mustChangePassword: true,
          ...(dto.role === 'teacher' ? { teacher: { create: {} } } : {}),
          ...(dto.role === 'student'
            ? {
                student: {
                  create: {
                    studentNumber: dto.studentNumber ?? null,
                    birthDate: dto.birthDate ? fromDay(dto.birthDate) : null,
                    sectionId: schoolClass?.sectionId ?? null,
                    ...(schoolClass
                      ? {
                          enrollments: {
                            create: {
                              classId: schoolClass.id,
                              schoolYearId: schoolClass.schoolYearId,
                            },
                          },
                        }
                      : {}),
                  },
                },
              }
            : {}),
        },
        include,
      });
      return { user: toUserDto(user), temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Ce compte existe déjà (e-mail ou matricule). Réessayez.');
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserDto> {
    const current = await this.row(id);
    if (id === actor.id && dto.status === 'disabled')
      throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte.');
    const restoring = current.status === 'archived' && dto.status === 'active';
    if (current.status === 'archived' && !restoring) throw new ConflictException(ARCHIVED);

    const reset = dto.password !== undefined;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: dto.status,
        ...(restoring && current.student
          ? { student: { update: { graduatedOn: null } } }
          : {}),
        // A reset password is temporary: the user chooses their own at next sign-in.
        ...(reset
          ? {
              passwordHash: await hash(dto.password!),
              mustChangePassword: true,
              passwordChangedAt: new Date(),
            }
          : {}),
      },
      include,
    });
    if (reset || dto.status === 'disabled') await this.auth.revokeAll(id);
    return toUserDto(user);
  }

  /** Accounts are never hard-deleted (grades and logs point at them): disable and sign out. */
  async deactivate(id: string, actor: AuthUser): Promise<UserDto> {
    return this.update(id, { status: 'disabled' }, actor);
  }

  /** Checks a roster CSV and lists the accounts it would create, with their generated e-mails. */
  async previewImport(csv: Buffer | undefined, role: ImportRole): Promise<ImportPreviewDto> {
    const checked = await this.checkImport(csv, role);
    return {
      role,
      rows: checked.rows.map(({ classId: _classId, ...row }) => row),
      errors: checked.errors,
    };
  }

  /** Roster CSV import, all or nothing: every account gets a generated e-mail and a temporary password. */
  async importCsv(csv: Buffer | undefined, role: ImportRole): Promise<ImportUsersDto> {
    const { rows, errors } = await this.checkImport(csv, role);
    if (errors.length)
      throw new BadRequestException({
        statusCode: 400,
        message: 'Import refusé : corrigez les lignes en erreur.',
        errors,
      });
    const sectionIds = await this.sectionIds();
    const schoolYearId = role === 'student' ? (await this.access.currentYear()).id : null;

    const passwords = rows.map(() => generatePassword());
    const hashes: string[] = [];
    for (let i = 0; i < passwords.length; i += HASH_CONCURRENCY) {
      hashes.push(
        ...(await Promise.all(passwords.slice(i, i + HASH_CONCURRENCY).map((p) => hash(p)))),
      );
    }
    try {
      await this.prisma.$transaction(
        rows.map((row, i) =>
          this.prisma.user.create({
            data: {
              email: row.email,
              passwordHash: hashes[i]!,
              role,
              firstName: row.firstName,
              lastName: row.lastName,
              mustChangePassword: true,
              ...(role === 'teacher'
                ? { teacher: { create: {} } }
                : {
                    student: {
                      create: {
                        studentNumber: row.studentNumber,
                        birthDate: row.birthDate ? fromDay(row.birthDate) : null,
                        sectionId: sectionIds.get(row.sectionCode!)!,
                        enrollments: {
                          create: { classId: row.classId!, schoolYearId: schoolYearId! },
                        },
                      },
                    },
                  }),
            },
          }),
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'Un compte a été créé entre-temps avec la même adresse ou le même matricule : relancez l’import.',
        );
      throw error;
    }
    return {
      created: rows.map((row, i) => ({
        email: row.email,
        role,
        firstName: row.firstName,
        lastName: row.lastName,
        temporaryPassword: passwords[i]!,
      })),
    };
  }

  /**
   * Students who graduated or left: archives their accounts, closes their open enrolments on `on`,
   * rejects their pending section-change requests and signs them out, in one transaction with audit rows.
   */
  async archiveStudents(dto: ArchiveStudentsDto, actor: AuthUser): Promise<ArchiveStudentsResultDto> {
    if (!!dto.classId === !!dto.studentIds?.length)
      throw new BadRequestException('Indiquez soit des élèves, soit une classe.');
    const students = dto.classId
      ? await this.prisma.student.findMany({
          where: { enrollments: { some: { classId: dto.classId, leftOn: null } } },
          select: { id: true, userId: true, user: { select: { status: true } } },
        })
      : await this.prisma.student.findMany({
          where: { id: { in: [...new Set(dto.studentIds)] } },
          select: { id: true, userId: true, user: { select: { status: true } } },
        });
    if (dto.studentIds && students.length !== new Set(dto.studentIds).size) throw notFound('Élève');
    const targets = students.filter((s) => s.user.status !== 'archived');
    if (!targets.length) return { archived: 0 };

    const on = fromDay(dto.on);
    const now = new Date();
    const studentIds = targets.map((s) => s.id);
    const userIds = targets.map((s) => s.userId);
    const note =
      dto.outcome === 'graduated'
        ? 'Demande close : l’élève a obtenu son diplôme.'
        : 'Demande close : l’élève a quitté le collège.';
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'archived' } });
      await tx.student.updateMany({
        where: { id: { in: studentIds } },
        data: { graduatedOn: dto.outcome === 'graduated' ? on : null },
      });
      await tx.enrollment.updateMany({
        where: { studentId: { in: studentIds }, leftOn: null },
        data: { leftOn: on },
      });
      await tx.sectionChangeRequest.updateMany({
        where: { studentId: { in: studentIds }, status: 'pending' },
        data: { status: 'rejected', decidedById: actor.id, decidedAt: now, decisionNote: note },
      });
      await tx.refreshToken.updateMany({
        where: { userId: { in: userIds }, revokedAt: null },
        data: { revokedAt: now },
      });
      await audit(
        tx,
        targets.map((s) => ({
          actorId: actor.id,
          action: `student.${dto.outcome}`,
          entity: 'student',
          entityId: s.id,
          before: { status: s.user.status },
          after: { status: 'archived', outcome: dto.outcome, on: dto.on },
        })),
      );
    });
    return { archived: targets.length };
  }

  private async row(id: string): Promise<UserRow> {
    const user = await this.prisma.user.findUnique({ where: { id }, include });
    if (!user) throw notFound('Utilisateur');
    return user;
  }

  /** The school e-mail for a name, numbered after the addresses already in use. */
  private async generatedEmail(firstName: string, lastName: string): Promise<string> {
    const [email] = assignSchoolEmails([{ firstName, lastName }], this.domain, await this.takenEmails());
    if (!email)
      throw new BadRequestException(
        'Impossible de créer l’adresse e-mail : écrivez le nom et le prénom en lettres latines, ou saisissez l’adresse.',
      );
    return email;
  }

  private async takenEmails(): Promise<Set<string>> {
    const rows = await this.prisma.user.findMany({
      where: { email: { endsWith: `@${this.domain}` } },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email));
  }

  private async sectionIds(): Promise<Map<SectionId, string>> {
    const sections = await this.prisma.section.findMany();
    return new Map(sections.map((s) => [s.code as SectionId, s.id]));
  }

  private async checkImport(csv: Buffer | undefined, role: ImportRole): Promise<CheckedRoster> {
    if (!csv?.length) throw new BadRequestException('Fichier CSV manquant (champ « file »).');
    let headings: string[] = [];
    let records: Record<string, string>[];
    try {
      records = parse(csv, {
        columns: (header: string[]) => {
          headings = header.map((c) => c.trim());
          return headings.map((c) => columnName(c) ?? c);
        },
        bom: true,
        trim: true,
        skip_empty_lines: true,
        delimiter: [',', ';'],
      });
    } catch (error) {
      throw new BadRequestException(
        `CSV illisible : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const header = headerProblems(headings, role);
    if (header.length)
      return { rows: [], errors: header.map((message) => ({ line: 1, message })) };
    if (!records.length) throw new BadRequestException('Le fichier ne contient aucune ligne.');
    if (records.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(`Au plus ${MAX_IMPORT_ROWS} lignes par import.`);

    const classes =
      role === 'student'
        ? await this.prisma.schoolClass.findMany({
            where: { schoolYearId: (await this.access.currentYear()).id },
            include: { section: true },
          })
        : [];
    const numbers = records.map((r) => (r['studentNumber'] ?? '').trim()).filter(Boolean);
    const takenNumbers = numbers.length
      ? (
          await this.prisma.student.findMany({
            where: { studentNumber: { in: numbers } },
            select: { studentNumber: true },
          })
        ).flatMap((s) => (s.studentNumber ? [s.studentNumber] : []))
      : [];
    return checkRoster(records, {
      role,
      domain: this.domain,
      classes: new Map(
        classes.map((c) => [`${c.section.code}/${c.code.toLowerCase()}`, { id: c.id, label: c.label }]),
      ),
      takenEmails: await this.takenEmails(),
      takenNumbers: new Set(takenNumbers),
    });
  }
}

/** 16 URL-safe characters (96 bits). */
function generatePassword(): string {
  return randomBytes(12).toString('base64url');
}

export function toUserDto(u: UserRow): UserDto {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: toIso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
    studentId: u.student?.id ?? null,
    teacherId: u.teacher?.id ?? null,
    studentNumber: u.student?.studentNumber ?? null,
    classId: u.student?.enrollments[0]?.classId ?? null,
    sectionCode: (u.student?.section?.code as SectionId | undefined) ?? null,
    graduatedOn: u.student?.graduatedOn ? toDay(u.student.graduatedOn) : null,
  };
}
