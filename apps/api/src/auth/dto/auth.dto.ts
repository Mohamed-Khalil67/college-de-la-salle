import type { LoginRequest, Role, SessionResponse, SessionUser } from '@cdls/shared';
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
}

export class SessionDto implements SessionResponse {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: SessionUserDto;
}
