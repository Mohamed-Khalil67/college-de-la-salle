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
  /** Students: their class in the current school year (null when not enrolled). */
  readonly classId: string | null;
  /** Teachers marked coordinateur: they also edit the year's structure. Read from the database on every request. */
  readonly isCoordinator: boolean;
}

export interface AuthedRequest {
  user?: AuthUser;
}
