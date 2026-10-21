import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  type CreatedUserResponse,
  type CreateUserRequest,
  type ImportUsersResponse,
  type Role,
  ROLES,
  type UpdateUserRequest,
  type UserDto as UserContract,
  type UserListQuery,
} from '@cdls/shared';
import { PaginationQueryDto } from '../../common/pagination.js';
import { lowerTrim, trim } from '../../common/transforms.js';

export class UserDto implements UserContract {
  id: string;
  email: string;
  @ApiProperty({ enum: ROLES })
  role: Role;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  studentId: string | null;
  teacherId: string | null;
  studentNumber: string | null;
  classId: string | null;
  isCoordinator: boolean;
}

export class UserListQueryDto extends PaginationQueryDto implements UserListQuery {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateUserDto implements CreateUserRequest {
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email: string;

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

  /** At least 10 characters. Omit to get a generated temporary password. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[\w-]{1,32}$/)
  studentNumber?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Sets a new password and signs the user out everywhere. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password?: string;

  /** Teachers only: coordinateur (edits the year's structure). */
  @IsOptional()
  @IsBoolean()
  isCoordinator?: boolean;
}

export class CreatedUserDto implements CreatedUserResponse {
  user: UserDto;
  temporaryPassword: string | null;
}

class ImportedUserDto {
  email: string;
  @ApiProperty({ enum: ROLES })
  role: Role;
  temporaryPassword: string;
}

export class ImportUsersDto implements ImportUsersResponse {
  @ApiProperty({ type: [ImportedUserDto] })
  created: ImportedUserDto[];
}
