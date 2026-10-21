import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import {
  describeSchoolEmails,
  type ImportRole,
  type Paginated,
  schoolEmailPrefix,
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
  identityKey,
  MAX_IMPORT_ROWS,
} from './roster-import.js';

const HASH_CONCURRENCY = 4;
const MALFORMED_CSV =
  'Le fichier CSV est illisible : vérifiez les guillemets et les colonnes, puis enregistrez-le de nouveau au format CSV (UTF-8).';
const ARCHIVED = 'Compte archivé : restaurez-le avant de le modifier.';

const include = {
  teacher: { select: { id: true, isCoordinator: true } },
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

type Db = PrismaService | Prisma.TransactionClient;

/** Takes the lock that serialises address numbering until the transaction ends. */
const EMAIL_LOCK_KEY = 4_242_001;
async function lockEmails(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EMAIL_LOCK_KEY})`;
}

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class UsersService {
  private readonly domain: string;
  private readonly temporaryPasswordDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.domain = config.get('SCHOOL_EMAIL_DOMAIN', { infer: true });
    this.temporaryPasswordDays = config.get('TEMP_PASSWORD_TTL_DAYS', { infer: true });
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
  async create(dto: CreateUserDto, actor: AuthUser): Promise<CreatedUserDto> {
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

    if (dto.email && (await this.prisma.user.findUnique({ where: { email: dto.email } }))) {
      throw new ConflictException('Un compte existe déjà avec cette adresse e-mail.');
    }
    const temporaryPassword = generatePassword();
    const passwordHash = await hash(temporaryPassword);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
      // A generated address is numbered under the same lock as the imports, so homonyms created at the
      // same moment never get the same one.
      let email = dto.email;
      if (!email) {
        await lockEmails(tx);
        email = await this.generatedEmail(tx, dto.firstName, dto.lastName);
      }
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: this.temporaryPasswordExpiry(),
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
      // Never the password: who made which account, with which role.
      await audit(tx, [
        {
          actorId: actor.id,
          action: 'user.create',
          entity: 'user',
          entityId: created.id,
          after: { email, role: dto.role, classId: dto.classId ?? null },
        },
      ]);
      return created;
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
    if (dto.isCoordinator !== undefined && current.role !== 'teacher')
      throw new BadRequestException('Seul un enseignant peut être coordinateur.');
    const restoring = current.status === 'archived' && dto.status === 'active';
    if (current.status === 'archived' && !restoring) throw new ConflictException(ARCHIVED);
    const coordinatorChange =
      dto.isCoordinator !== undefined &&
      dto.isCoordinator !== (current.teacher?.isCoordinator ?? false);

    const reset = dto.password !== undefined;
    // Disabling or restoring ends the sessions already issued: their access tokens carry the old version.
    const statusChanged = dto.status !== undefined && dto.status !== current.status;
    const passwordHash = reset ? await hash(dto.password!) : undefined;
    const user = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: dto.status,
          ...(restoring && current.student
            ? { student: { update: { graduatedOn: null } } }
            : {}),
          ...(coordinatorChange
            ? { teacher: { update: { isCoordinator: dto.isCoordinator } } }
            : {}),
          // A reset password is temporary: the user chooses their own at next sign-in.
          ...(reset
            ? {
                passwordHash,
                mustChangePassword: true,
                passwordChangedAt: new Date(),
                temporaryPasswordExpiresAt: this.temporaryPasswordExpiry(),
              }
            : statusChanged
              ? { passwordChangedAt: new Date() }
              : {}),
        },
        include,
      });
      if (reset)
        await audit(tx, [
          {
            actorId: actor.id,
            action: 'user.password_reset',
            entity: 'user',
            entityId: id,
            after: { mustChangePassword: true },
          },
        ]);
      if (dto.status !== undefined && dto.status !== current.status)
        await audit(tx, [
          {
            actorId: actor.id,
            action: 'user.status',
            entity: 'user',
            entityId: id,
            before: { status: current.status },
            after: { status: dto.status },
          },
        ]);
      // A permission change: keep a trace of who granted or removed it.
      if (coordinatorChange)
        await audit(tx, [
          {
            actorId: actor.id,
            action: dto.isCoordinator ? 'teacher.coordinator.grant' : 'teacher.coordinator.revoke',
            entity: 'user',
            entityId: id,
            before: { isCoordinator: current.teacher?.isCoordinator ?? false },
            after: { isCoordinator: dto.isCoordinator ?? false },
          },
        ]);
      return row;
    });
    if (reset || dto.status === 'disabled') await this.auth.revokeAll(id);
    return toUserDto(user);
  }

  /** Accounts are never hard-deleted (grades and logs point at them): disable and sign out. */
  async deactivate(id: string, actor: AuthUser): Promise<UserDto> {
    return this.update(id, { status: 'disabled' }, actor);
  }

  /** Checks a roster CSV and lists the accounts it would create, with their generated e-mails. */
  async previewImport(
    csv: Buffer | undefined,
    role: ImportRole,
    createAnyway: readonly number[] = [],
  ): Promise<ImportPreviewDto> {
    const checked = await this.checkImport(csv, role, createAnyway);
    return {
      role,
      rows: checked.rows.map(({ classId: _classId, ...row }) => row),
      errors: checked.errors,
    };
  }

  /** Roster CSV import, all or nothing: every account gets a generated e-mail and a temporary password. */
  async importCsv(
    csv: Buffer | undefined,
    role: ImportRole,
    actor: AuthUser,
    createAnyway: readonly number[] = [],
  ): Promise<ImportUsersDto> {
    const { rows, errors } = await this.checkImport(csv, role, createAnyway);
    if (errors.length)
      throw new BadRequestException({
        statusCode: 400,
        message: 'Import refusé : corrigez les lignes en erreur.',
        errors,
      });
    // People already in the school (same student number, or same name, section and class) are kept as
    // they are: a re-import never creates a second account or renumbers anyone, unless a line was
    // explicitly marked « créer quand même ».
    const fresh = rows.filter((row) => !row.alreadyImported);
    if (!fresh.length) return { created: [] };
    const sectionIds = await this.sectionIds();
    const schoolYearId = role === 'student' ? (await this.access.currentYear()).id : null;

    const passwords = fresh.map(() => generatePassword());
    const hashes: string[] = [];
    for (let i = 0; i < passwords.length; i += HASH_CONCURRENCY) {
      hashes.push(
        ...(await Promise.all(passwords.slice(i, i + HASH_CONCURRENCY).map((p) => hash(p)))),
      );
    }
    try {
      const emails = await this.prisma.$transaction(
        async (tx) => {
          // One import (or creation) at a time numbers the homonyms: take the lock, read the addresses
          // again, number from there. The unique index on the e-mail stays the last line of defence.
          await lockEmails(tx);
          const taken = await this.takenEmails(tx, fresh);
          const assigned = describeSchoolEmails(fresh, this.domain, taken);
          const created: string[] = [];
          for (const [i, row] of fresh.entries()) {
            const email = assigned[i]!.email;
            await tx.user.create({
              data: {
                email,
                passwordHash: hashes[i]!,
                role,
                firstName: row.firstName,
                lastName: row.lastName,
                mustChangePassword: true,
                temporaryPasswordExpiresAt: this.temporaryPasswordExpiry(),
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
            });
            created.push(email);
          }
          // One row for the whole import: a count, never the addresses, names or passwords.
          await audit(tx, [
            {
              actorId: actor.id,
              action: 'user.import',
              entity: 'user_import',
              entityId: randomUUID(),
              after: { role, created: created.length, skipped: rows.length - fresh.length },
            },
          ]);
          return created;
        },
        { timeout: 60_000 },
      );
      return {
        created: fresh.map((row, i) => ({
          email: emails[i]!,
          role,
          firstName: row.firstName,
          lastName: row.lastName,
          temporaryPassword: passwords[i]!,
        })),
      };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'Un compte a été créé entre-temps avec le même matricule : relancez l’import.',
        );
      throw error;
    }
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
      await tx.user.updateMany({
        where: { id: { in: userIds } },
        data: { status: 'archived', passwordChangedAt: now },
      });
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

  /** When a temporary password set now stops working. */
  private temporaryPasswordExpiry(): Date {
    return new Date(Date.now() + this.temporaryPasswordDays * 86_400_000);
  }

  private async row(id: string): Promise<UserRow> {
    const user = await this.prisma.user.findUnique({ where: { id }, include });
    if (!user) throw notFound('Utilisateur');
    return user;
  }

  /** The school e-mail for a name, numbered after the addresses already in use. */
  private async generatedEmail(
    db: Db,
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const [generated] = describeSchoolEmails([{ firstName, lastName }], this.domain, await this.takenEmails(db, [{ firstName, lastName }]));
    const email = generated?.email;
    if (!email)
      throw new BadRequestException(
        'Impossible de créer l’adresse e-mail : écrivez le nom et le prénom en lettres latines, ou saisissez l’adresse.',
      );
    return email;
  }

  /**
   * The addresses that could collide with these people's: only `prenom.nom%@domain` is read, not every
   * account of the school.
   */
  private async takenEmails(
    db: Db,
    people: readonly { firstName: string; lastName: string }[],
  ): Promise<Set<string>> {
    const prefixes = [
      ...new Set(people.map((p) => schoolEmailPrefix(p.firstName, p.lastName)).filter((p): p is string => !!p)),
    ];
    if (!prefixes.length) return new Set();
    const rows = await db.user.findMany({
      where: {
        email: { endsWith: `@${this.domain}` },
        OR: prefixes.map((prefix) => ({ email: { startsWith: prefix } })),
      },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email));
  }

  private async sectionIds(): Promise<Map<SectionId, string>> {
    const sections = await this.prisma.section.findMany();
    return new Map(sections.map((s) => [s.code as SectionId, s.id]));
  }

  private async checkImport(
    csv: Buffer | undefined,
    role: ImportRole,
    createAnyway: readonly number[],
  ): Promise<CheckedRoster> {
    if (!csv?.length) throw new BadRequestException('Fichier CSV manquant (champ « file »).');
    let headings: string[] = [];
    let parsed: { record: Record<string, string>; info: { lines: number }; raw: string }[];
    try {
      parsed = parse(csv, {
        columns: (header: string[]) => {
          headings = header.map((c) => c.trim());
          return headings.map((c) => columnName(c) ?? c);
        },
        bom: true,
        trim: true,
        skip_empty_lines: true,
        delimiter: [',', ';'],
        info: true,
        raw: true,
      });
    } catch {
      // The parser's own message is English and technical: say what to check instead.
      throw new BadRequestException(MALFORMED_CSV);
    }
    const records = parsed.map((p) => p.record);
    // The line each record starts on: `info.lines` is where it ends, and a quoted cell may span several.
    const lineNumbers = parsed.map((p) => {
      const body = p.raw.replace(/^[\r\n]+/, '').replace(/\r?\n?$/, '');
      return p.info.lines - (body.match(/\n/g)?.length ?? 0);
    });
    const header = headerProblems(headings, role);
    if (header.length)
      return { rows: [], errors: header.map((message) => ({ line: 1, message })) };
    if (!records.length) throw new BadRequestException('Le fichier ne contient aucune ligne.');
    if (records.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(`Au plus ${MAX_IMPORT_ROWS} lignes par import.`);

    const year = role === 'student' ? await this.access.currentYear() : null;
    const classes = year
      ? await this.prisma.schoolClass.findMany({
          where: { schoolYearId: year.id },
          include: { section: true },
        })
      : [];
    const numbers = records.map((r) => (r['studentNumber'] ?? '').trim()).filter(Boolean);
    const existingByNumber = new Map<string, string>(
      numbers.length
        ? (
            await this.prisma.student.findMany({
              where: { studentNumber: { in: numbers } },
              select: { studentNumber: true, user: { select: { email: true } } },
            })
          ).flatMap((s) => (s.studentNumber ? [[s.studentNumber, s.user.email] as const] : []))
        : [],
    );
    const people = records
      .map((r) => ({ firstName: (r['firstName'] ?? '').trim(), lastName: (r['lastName'] ?? '').trim() }))
      .filter((p) => p.firstName && p.lastName);
    return checkRoster(
      records,
      {
        role,
        domain: this.domain,
        classes: new Map(
          classes.map((c) => [`${c.section.code}/${c.code.toLowerCase()}`, { id: c.id, label: c.label }]),
        ),
        takenEmails: await this.takenEmails(this.prisma, people),
        existingByNumber,
        existingByIdentity: await this.existingByIdentity(role, people, year?.id ?? null),
        createAnyway: new Set(createAnyway),
      },
      lineNumbers,
    );
  }

  /**
   * Accounts that look like one of these people: same exact normalised name and, for students, the same
   * section and class this year. Candidates come from the `prenom.nom%` addresses and the exact names, then
   * are compared on the normalised name.
   */
  private async existingByIdentity(
    role: ImportRole,
    people: readonly { firstName: string; lastName: string }[],
    yearId: string | null,
  ): Promise<Map<string, string>> {
    const prefixes = [
      ...new Set(people.map((p) => schoolEmailPrefix(p.firstName, p.lastName)).filter((p): p is string => !!p)),
    ];
    if (!people.length) return new Map();
    const rows = await this.prisma.user.findMany({
      where: {
        role,
        OR: [
          ...prefixes.map((prefix) => ({ email: { startsWith: prefix } })),
          ...people.map((p) => ({
            firstName: { equals: p.firstName, mode: 'insensitive' as const },
            lastName: { equals: p.lastName, mode: 'insensitive' as const },
          })),
        ],
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        student: {
          select: {
            section: { select: { code: true } },
            enrollments: {
              where: { leftOn: null, ...(yearId ? { schoolYearId: yearId } : {}) },
              select: { classId: true },
              take: 1,
            },
          },
        },
      },
    });
    const found = new Map<string, string>();
    for (const row of rows) {
      const key = identityKey(
        role,
        row.firstName,
        row.lastName,
        row.student?.section?.code ?? null,
        row.student?.enrollments[0]?.classId ?? null,
      );
      if (key && !found.has(key)) found.set(key, row.email);
    }
    return found;
  }
}

/** No look-alike characters (0/O, 1/l/I) and no symbol: safe to read aloud, and never read as a spreadsheet formula. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** 16 letters and digits drawn uniformly (about 93 bits). */
export function generatePassword(): string {
  return Array.from({ length: 16 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('');
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
    isCoordinator: u.teacher?.isCoordinator ?? false,
    sectionCode: (u.student?.section?.code as SectionId | undefined) ?? null,
    graduatedOn: u.student?.graduatedOn ? toDay(u.student.graduatedOn) : null,
  };
}
