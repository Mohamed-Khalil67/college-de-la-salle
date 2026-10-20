import type { Role } from '@cdls/shared';

/** The signed-in user, attached to the request by JwtAuthGuard. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly firstName: string;
  readonly lastName: string;
  readonly studentId: string | null;
  readonly teacherId: string | null;
}

export interface AuthedRequest {
  user?: AuthUser;
}
