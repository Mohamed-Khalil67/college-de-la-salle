/**
 * Role-based access control, shared by the client, Cloud Functions and the rules tests.
 *
 * The role travels as the `role` custom claim on the Firebase ID token. Only Cloud Functions (and
 * the bootstrap script) set it, from the examiner directory:
 *
 *   examiner_directory/{entry}   entry = "teacher@school.edu" (one account) or "@school.edu" (a domain)
 *
 * Firestore rules trust the claim, never a client-supplied value.
 */
import type { EpochMillis, Uid } from './exam.contracts';
import { isValidEmail, normalizeEmail } from './delivery';

export type UserRole = 'super_admin' | 'examiner' | 'examinee';

/** Name of the custom claim that carries the role. */
export const ROLE_CLAIM = 'role';

/** Roles that may author, edit and grade exams. */
export const AUTHOR_ROLES: readonly UserRole[] = ['super_admin', 'examiner'];

const RANK: Readonly<Record<UserRole, number>> = { examinee: 0, examiner: 1, super_admin: 2 };

/** Unknown or missing claims are the least-privileged role. */
export function parseRole(value: unknown): UserRole {
  return value === 'super_admin' || value === 'examiner' ? value : 'examinee';
}

/** Hierarchical check: a super admin satisfies `examiner`, an examiner satisfies `examinee`. */
export function hasRole(actual: UserRole, required: UserRole): boolean {
  return RANK[actual] >= RANK[required];
}

export type DirectoryRole = Exclude<UserRole, 'examinee'>;
export type DirectoryStatus = 'ACTIVE' | 'REVOKED';
export type DirectoryKind = 'EMAIL' | 'DOMAIN';

export interface ExaminerDirectoryEntry {
  /** Document id: a lower-cased email, or "@domain". */
  readonly entry: string;
  readonly kind: DirectoryKind;
  readonly role: DirectoryRole;
  readonly status: DirectoryStatus;
  /** The account this entry was last applied to (EMAIL entries with an existing account). */
  readonly uid: Uid | null;
  readonly updatedAt: EpochMillis;
  readonly updatedBy: string | null;
}

export type RoleAction = 'grant' | 'revoke';

export interface ManageExaminerRoleRequest {
  /** An email, or "@domain" for every verified account of that domain. */
  readonly email: string;
  readonly action: RoleAction;
}

export interface ManageExaminerRoleResponse {
  readonly entry: string;
  readonly status: DirectoryStatus;
  /** Existing accounts whose claims changed now; others pick the role up at their next sign-in. */
  readonly accountsUpdated: number;
}

/** Re-evaluates the caller's role against the directory and refreshes their claims. */
export interface RefreshRoleResponse {
  readonly role: UserRole;
}

export type AuditAction = 'GRANT_EXAMINER' | 'REVOKE_EXAMINER' | 'BOOTSTRAP_SUPER_ADMIN';

/** One immutable line in `audit_logs`. */
export interface AuditLogEntry {
  readonly id: string;
  readonly action: AuditAction;
  readonly actorUid: Uid | null;
  readonly actorEmail: string | null;
  readonly target: string;
  readonly targetUids: readonly Uid[];
  readonly at: EpochMillis;
}

export interface DirectoryTarget {
  readonly entry: string;
  readonly kind: DirectoryKind;
}

const DOMAIN = /^@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Validates admin input: a full email or an "@domain" entry. Returns null when invalid. */
export function parseDirectoryTarget(raw: string): DirectoryTarget | null {
  const entry = normalizeEmail(raw);
  if (entry.startsWith('@')) return DOMAIN.test(entry) ? { entry, kind: 'DOMAIN' } : null;
  return isValidEmail(entry) && !entry.includes('/') ? { entry, kind: 'EMAIL' } : null;
}

/** Directory documents that can grant a role to `email`: its exact entry, then its domain. */
export function directoryKeysFor(email: string): readonly string[] {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at <= 0 || !isValidEmail(e)) return [];
  return [e, e.slice(at)];
}

/**
 * The role a verified account gets from its directory entries (exact entry first, then domain).
 * An exact REVOKED entry overrides an ACTIVE domain entry, so one person can be excluded from a
 * domain-wide grant. Super admin is only ever granted by an exact entry.
 */
export function resolveRole(
  exact: Pick<ExaminerDirectoryEntry, 'role' | 'status'> | null,
  domain: Pick<ExaminerDirectoryEntry, 'role' | 'status'> | null,
): UserRole {
  if (exact) return exact.status === 'ACTIVE' ? exact.role : 'examinee';
  if (domain?.status === 'ACTIVE') return 'examiner';
  return 'examinee';
}
