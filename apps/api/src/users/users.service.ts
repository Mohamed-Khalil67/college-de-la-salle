import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  CLASSES,
  type ImportUsersError,
  type Paginated,
  type Role,
  ROLES,
  type SectionId,
} from '@cdls/shared';
import { hash } from 'argon2';
import { parse } from 'csv-parse/sync';
import { isEmail } from 'class-validator';
import type { Prisma } from '../generated/prisma/client.js';
import { AccessService } from '../access/access.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { audit } from '../common/audit.js';
import { toIso } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { pageArgs, paginated } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreatedUserDto,
  CreateUserDto,
  ImportUsersDto,
  UpdateUserDto,
  UserDto,
  UserListQueryDto,
} from './dto/user.dto.js';

const MAX_IMPORT_ROWS = 2000;
const HASH_CONCURRENCY = 4;

const include = {
  teacher: { select: { id: true, isCoordinator: true } },
  student: {
    select: {
      id: true,
      studentNumber: true,
      enrollments: {
        where: { schoolYear: { isCurrent: true }, leftOn: null },
        select: { classId: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof include }>;

interface ImportRow {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  studentNumber: string | null;
  classId: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly auth: AuthService,
  ) {}

  async list(query: UserListQueryDto): Promise<Paginated<UserDto>> {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
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
    const user = await this.prisma.user.findUnique({ where: { id }, include });
    if (!user) throw notFound('Utilisateur');
    return toUserDto(user);
  }

  async create(dto: CreateUserDto): Promise<CreatedUserDto> {
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('Un compte existe déjà avec cette adresse e-mail.');
    }
    if (dto.role !== 'student' && (dto.classId || dto.studentNumber)) {
      throw new BadRequestException('Classe et matricule concernent uniquement les élèves.');
    }
    const schoolYearId = dto.classId ? await this.classYear(dto.classId) : null;
    const temporaryPassword = dto.password ? null : generatePassword();
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await hash(dto.password ?? temporaryPassword!),
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        ...profile(dto.role, dto.studentNumber ?? null, dto.classId ?? null, schoolYearId),
      },
      include,
    });
    return { user: toUserDto(user), temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserDto> {
    const current = await this.get(id);
    if (id === actor.id && dto.isActive === false)
      throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte.');
    if (dto.isCoordinator !== undefined && current.role !== 'teacher')
      throw new BadRequestException('Seul un enseignant peut être coordinateur.');
    const coordinatorChange =
      dto.isCoordinator !== undefined && dto.isCoordinator !== current.isCoordinator;
    const passwordHash = dto.password ? await hash(dto.password) : undefined;
    const user = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          isActive: dto.isActive,
          passwordHash,
          ...(coordinatorChange
            ? { teacher: { update: { isCoordinator: dto.isCoordinator } } }
            : {}),
        },
        include,
      });
      // A permission change: keep a trace of who granted or removed it.
      if (coordinatorChange)
        await audit(tx, [
          {
            actorId: actor.id,
            action: dto.isCoordinator ? 'teacher.coordinator.grant' : 'teacher.coordinator.revoke',
            entity: 'user',
            entityId: id,
            before: { isCoordinator: current.isCoordinator },
            after: { isCoordinator: dto.isCoordinator ?? false },
          },
        ]);
      return row;
    });
    if (dto.password || dto.isActive === false) await this.auth.revokeAll(id);
    return toUserDto(user);
  }

  /** Accounts are never hard-deleted (grades and logs point at them): deactivate and sign out. */
  async deactivate(id: string, actor: AuthUser): Promise<UserDto> {
    return this.update(id, { isActive: false }, actor);
  }

  /** CSV import, all or nothing. See ImportUsersResponse in packages/shared for the format. */
  async importCsv(csv: Buffer | undefined): Promise<ImportUsersDto> {
    if (!csv?.length) throw new BadRequestException('Fichier CSV manquant (champ « file »).');
    let records: Record<string, string>[];
    try {
      records = parse(csv, {
        columns: (h: string[]) => h.map((c) => c.trim()),
        bom: true,
        trim: true,
        skip_empty_lines: true,
      });
    } catch (error) {
      throw new BadRequestException(
        `CSV illisible : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!records.length) throw new BadRequestException('Le fichier ne contient aucune ligne.');
    if (records.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(`Au plus ${MAX_IMPORT_ROWS} lignes par import.`);

    const year = await this.access.currentYear();
    const classes = await this.prisma.schoolClass.findMany({
      where: { schoolYearId: year.id },
      include: { section: true },
    });
    const classByCode = new Map(classes.map((c) => [`${c.section.code}/${c.code}`, c.id]));
    const emails = records.map((r) => (r['email'] ?? '').toLowerCase());
    const existing = new Set(
      (
        await this.prisma.user.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      ).map((u) => u.email),
    );
    const numbers = records.map((r) => r['studentNumber'] ?? '').filter(Boolean);
    const existingNumbers = new Set(
      (
        await this.prisma.student.findMany({
          where: { studentNumber: { in: numbers } },
          select: { studentNumber: true },
        })
      ).map((s) => s.studentNumber),
    );

    const errors: ImportUsersError[] = [];
    const rows: ImportRow[] = [];
    const seen = new Set<string>();
    records.forEach((r, i) => {
      const line = i + 2; // header is line 1
      const fail = (message: string) => errors.push({ line, message });
      const email = (r['email'] ?? '').toLowerCase();
      const role = r['role'] as Role;
      const firstName = r['firstName'] ?? '';
      const lastName = r['lastName'] ?? '';
      const studentNumber = r['studentNumber'] || null;
      if (!isEmail(email)) return fail('e-mail invalide');
      if (existing.has(email) || seen.has(email)) return fail(`${email} existe déjà`);
      seen.add(email);
      if (!ROLES.includes(role))
        return fail(`rôle inconnu « ${r['role'] ?? ''} » (admin, teacher, student)`);
      if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80)
        return fail('prénom et nom requis (80 caractères max.)');
      if (
        studentNumber &&
        (!/^[\w-]{1,32}$/.test(studentNumber) || existingNumbers.has(studentNumber))
      ) {
        return fail(`matricule invalide ou déjà utilisé : ${studentNumber}`);
      }
      let classId: string | null = null;
      if (role === 'student') {
        const section = r['section'] as SectionId;
        const code = r['class'] ?? '';
        if (!(section in CLASSES)) return fail('section requise pour un élève (nationale ou bac)');
        classId = classByCode.get(`${section}/${code}`) ?? null;
        if (!classId) return fail(`classe inconnue « ${code} » en ${section} pour ${year.label}`);
      }
      rows.push({
        line,
        email,
        firstName,
        lastName,
        role,
        studentNumber: role === 'student' ? studentNumber : null,
        classId,
      });
    });
    if (errors.length)
      throw new BadRequestException({
        statusCode: 400,
        message: 'Import refusé : corrigez les lignes en erreur.',
        errors,
      });

    const passwords = rows.map(() => generatePassword());
    const hashes: string[] = [];
    for (let i = 0; i < passwords.length; i += HASH_CONCURRENCY) {
      hashes.push(
        ...(await Promise.all(passwords.slice(i, i + HASH_CONCURRENCY).map((p) => hash(p)))),
      );
    }
    await this.prisma.$transaction(
      rows.map((row, i) =>
        this.prisma.user.create({
          data: {
            email: row.email,
            passwordHash: hashes[i]!,
            role: row.role,
            firstName: row.firstName,
            lastName: row.lastName,
            ...profile(row.role, row.studentNumber, row.classId, row.classId ? year.id : null),
          },
        }),
      ),
    );
    return {
      created: rows.map((row, i) => ({
        email: row.email,
        role: row.role,
        temporaryPassword: passwords[i]!,
      })),
    };
  }

  private async classYear(classId: string): Promise<string> {
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: classId } });
    if (!schoolClass) throw notFound('Classe');
    return schoolClass.schoolYearId;
  }
}

function profile(
  role: Role,
  studentNumber: string | null,
  classId: string | null,
  schoolYearId: string | null,
) {
  if (role === 'teacher') return { teacher: { create: {} } };
  if (role !== 'student') return {};
  return {
    student: {
      create: {
        studentNumber,
        ...(classId && schoolYearId ? { enrollments: { create: { classId, schoolYearId } } } : {}),
      },
    },
  };
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
    isActive: u.isActive,
    lastLoginAt: toIso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
    studentId: u.student?.id ?? null,
    teacherId: u.teacher?.id ?? null,
    studentNumber: u.student?.studentNumber ?? null,
    classId: u.student?.enrollments[0]?.classId ?? null,
    isCoordinator: u.teacher?.isCoordinator ?? false,
  };
}
