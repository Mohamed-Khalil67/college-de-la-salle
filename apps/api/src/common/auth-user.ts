import type { Role, SectionId } from '@cdls/shared';

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
  /** Students: the label of that class. */
  readonly classLabel: string | null;
  /** Students: their section. */
  readonly sectionCode: SectionId | null;
  /** Still on a temporary password: only the routes marked @AllowDuringPasswordChange() are open. */
  readonly mustChangePassword: boolean;
}

export interface AuthedRequest {
  user?: AuthUser;
}
