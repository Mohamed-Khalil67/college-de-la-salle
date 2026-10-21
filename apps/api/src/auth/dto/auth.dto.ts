import {
  type ChangePasswordRequest,
  type LoginRequest,
  PASSWORD_MAX_LENGTH,
  type Role,
  type SectionId,
  type SessionResponse,
  type SessionUser,
} from '@cdls/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto implements LoginRequest {
  /** @example admin@demo.cdls.test */
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class SessionUserDto implements SessionUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  studentId: string | null;
  teacherId: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Students: their current class.' })
  classId: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Students: the label of their class.' })
  classLabel: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['nationale', 'bac'] })
  sectionCode: SectionId | null;
  /** True until the user chooses their own password (POST /auth/password). */
  mustChangePassword: boolean;
}

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  /** At least 10 characters, not the e-mail (checked by the service, with French messages). */
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class SessionDto implements SessionResponse {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: SessionUserDto;
}
