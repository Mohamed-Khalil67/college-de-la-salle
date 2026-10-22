import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ARCHIVE_OUTCOMES,
  type ArchiveOutcome,
  type ArchiveStudentsRequest,
  type ArchiveStudentsResponse,
  type CreatedUserResponse,
  type CreateUserRequest,
  IMPORT_ROLES,
  type ImportPreviewResponse,
  type ImportPreviewRow,
  type ImportRole,
  type ImportUsersQuery,
  type ImportUsersResponse,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type Role,
  ROLES,
  type SectionId,
  type UpdateUserRequest,
  type UserDto as UserContract,
  type UserListQuery,
  USER_STATUSES,
  type UserStatus,
} from '@cdls/shared';
import { IsDay } from '../../common/dates.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { lowerTrim, trim } from '../../common/transforms.js';

const SECTIONS: readonly SectionId[] = ['nationale', 'bac'];

export class UserDto implements UserContract {
  id: string;
  email: string;
  @ApiProperty({ enum: ROLES })
  role: Role;
  firstName: string;
  lastName: string;
  @ApiProperty({ enum: USER_STATUSES })
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  studentId: string | null;
  teacherId: string | null;
  studentNumber: string | null;
  classId: string | null;
  isCoordinator: boolean;
  @ApiProperty({ enum: SECTIONS, nullable: true })
  sectionCode: SectionId | null;
  @ApiProperty({ type: String, nullable: true, example: '2027-06-17' })
  graduatedOn: string | null;
}

export class UserListQueryDto extends PaginationQueryDto implements UserListQuery {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateUserDto implements CreateUserRequest {
  /** Leave out (or empty) to generate prenom.nom@<SCHOOL_EMAIL_DOMAIN>. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const v = lowerTrim({ value });
    return v === '' ? undefined : v;
  })
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role: Role;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[\w-]{1,32}$/)
  studentNumber?: string;

  @IsOptional()
  @IsDay()
  birthDate?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}

const EDITABLE_STATUSES = ['active', 'disabled'] as const;

export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  /** `active` also restores an archived account. */
  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: (typeof EDITABLE_STATUSES)[number];

  /** A new temporary password: signs the user out everywhere; they choose their own at next sign-in. */
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  /** Teachers only: coordinateur (edits the year's structure). */
  @IsOptional()
  @IsBoolean()
  isCoordinator?: boolean;
}

export class CreatedUserDto implements CreatedUserResponse {
  user: UserDto;
  /** Shown once; the user must replace it at first sign-in. */
  temporaryPassword: string;
}

export class ImportUsersQueryDto implements ImportUsersQuery {
  @ApiProperty({ enum: IMPORT_ROLES })
  @IsIn(IMPORT_ROLES)
  role: ImportRole;

  /** File lines to create although a person with the same name, section and class exists: `3,7`. */
  @ApiPropertyOptional({ type: String, example: '3,7' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim()
      ? value.split(',').map((n) => Number(n.trim()))
      : Array.isArray(value)
        ? value.map(Number)
        : undefined,
  )
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(2, { each: true })
  createAnyway?: number[];
}

class ImportPreviewRowDto implements ImportPreviewRow {
  line: number;
  lastName: string;
  firstName: string;
  email: string;
  emailNumber: number;
  @ApiProperty({ type: String, nullable: true })
  emailNote: string | null;
  alreadyImported: boolean;
  @ApiProperty({ enum: ['studentNumber', 'name'], nullable: true })
  matchedBy: 'studentNumber' | 'name' | null;
  createAnyway: boolean;
  @ApiProperty({ enum: SECTIONS, nullable: true })
  sectionCode: SectionId | null;
  @ApiProperty({ type: String, nullable: true })
  classLabel: string | null;
  @ApiProperty({ type: String, nullable: true })
  studentNumber: string | null;
  @ApiProperty({ type: String, nullable: true })
  birthDate: string | null;
}

class ImportErrorDto {
  line: number;
  message: string;
}

export class ImportPreviewDto implements ImportPreviewResponse {
  @ApiProperty({ enum: IMPORT_ROLES })
  role: ImportRole;
  @ApiProperty({ type: [ImportPreviewRowDto] })
  rows: ImportPreviewRowDto[];
  @ApiProperty({ type: [ImportErrorDto] })
  errors: ImportErrorDto[];
}

class ImportedUserDto {
  email: string;
  @ApiProperty({ enum: ROLES })
  role: Role;
  firstName: string;
  lastName: string;
  temporaryPassword: string;
}

export class ImportUsersDto implements ImportUsersResponse {
  @ApiProperty({ type: [ImportedUserDto] })
  created: ImportedUserDto[];
}

export class ArchiveStudentsDto implements ArchiveStudentsRequest {
  /** Students (not users) to archive; or give `classId`. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  studentIds?: string[];

  /** Every student enrolled in this class. */
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiProperty({ enum: ARCHIVE_OUTCOMES })
  @IsIn(ARCHIVE_OUTCOMES)
  outcome: ArchiveOutcome;

  /** @example 2027-06-17 */
  @IsDay()
  on: string;
}

export class ArchiveStudentsResultDto implements ArchiveStudentsResponse {
  archived: number;
}
