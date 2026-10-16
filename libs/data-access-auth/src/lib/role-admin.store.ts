import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type AuditAction,
  type AuditLogEntry,
  COLLECTIONS,
  type DirectoryKind,
  type DirectoryRole,
  type DirectoryStatus,
  type ExaminerDirectoryEntry,
  type ManageExaminerRoleRequest,
  type ManageExaminerRoleResponse,
  type RoleAction,
} from '@exam/contracts';
import {
  collection,
  type FirestoreDataConverter,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AuthStore } from './auth.store';
import { FIRESTORE } from './firestore.token';
import { FIREBASE_FUNCTIONS } from './functions.token';
import { firestoreQueryResource } from './firestore-resource';

const AUDIT_PAGE = 50;

const millis = (value: unknown): number => (value instanceof Timestamp ? value.toMillis() : 0);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const directoryConverter: FirestoreDataConverter<ExaminerDirectoryEntry> = {
  toFirestore: () => {
    throw new Error('The examiner directory is written only by Cloud Functions.');
  },
  fromFirestore: (snap: QueryDocumentSnapshot): ExaminerDirectoryEntry => {
    const d = snap.data();
    return {
      entry: snap.id,
      kind: (d['kind'] === 'DOMAIN' ? 'DOMAIN' : 'EMAIL') satisfies DirectoryKind,
      role: (d['role'] === 'super_admin' ? 'super_admin' : 'examiner') satisfies DirectoryRole,
      status: (d['status'] === 'ACTIVE' ? 'ACTIVE' : 'REVOKED') satisfies DirectoryStatus,
      uid: str(d['uid']),
      updatedAt: millis(d['updatedAt']),
      updatedBy: str(d['updatedBy']),
    };
  },
};

const AUDIT_ACTIONS: readonly AuditAction[] = ['GRANT_EXAMINER', 'REVOKE_EXAMINER', 'BOOTSTRAP_SUPER_ADMIN'];

const auditConverter: FirestoreDataConverter<AuditLogEntry> = {
  toFirestore: () => {
    throw new Error('Audit logs are immutable and written only by Cloud Functions.');
  },
  fromFirestore: (snap: QueryDocumentSnapshot): AuditLogEntry => {
    const d = snap.data();
    const action = AUDIT_ACTIONS.find((a) => a === d['action']) ?? 'GRANT_EXAMINER';
    return {
      id: snap.id,
      action,
      actorUid: str(d['actorUid']),
      actorEmail: str(d['actorEmail']),
      target: str(d['target']) ?? '',
      targetUids: Array.isArray(d['targetUids']) ? d['targetUids'].filter((u): u is string => typeof u === 'string') : [],
      at: millis(d['at']),
    };
  },
};

export type DirectoryFilter = 'ALL' | DirectoryStatus;

/**
 * Super-admin view model: the live examiner directory, the latest audit lines, and grant/revoke.
 * Provided by the admin page (not root) so listeners exist only while the page is open. Reads are
 * allowed by the rules for the super admin only; writes go exclusively through Cloud Functions.
 */
@Injectable()
export class RoleAdminStore {
  readonly #db = inject(FIRESTORE);
  readonly #functions = inject(FIREBASE_FUNCTIONS);
  readonly #auth = inject(AuthStore);

  readonly #directory = firestoreQueryResource({
    params: () => (this.#auth.isSuperAdmin() ? this.#auth.uid() : undefined),
    query: () =>
      query(
        collection(this.#db, COLLECTIONS.examinerDirectory).withConverter(directoryConverter),
        orderBy('updatedAt', 'desc'),
      ),
  });

  readonly #audit = firestoreQueryResource({
    params: () => (this.#auth.isSuperAdmin() ? this.#auth.uid() : undefined),
    query: () =>
      query(
        collection(this.#db, COLLECTIONS.auditLogs).withConverter(auditConverter),
        orderBy('at', 'desc'),
        limit(AUDIT_PAGE),
      ),
  });

  readonly search = signal('');
  readonly statusFilter = signal<DirectoryFilter>('ALL');

  readonly loading = computed(() => this.#directory.isLoading());
  readonly error = computed(() => this.#directory.error() ?? this.#audit.error() ?? null);
  readonly auditLog = computed(() => this.#audit.value());

  readonly entries = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.#directory
      .value()
      .filter((e) => (status === 'ALL' || e.status === status) && (!term || e.entry.includes(term)));
  });

  readonly counts = computed(() => {
    const all = this.#directory.value();
    return {
      active: all.filter((e) => e.status === 'ACTIVE' && e.role === 'examiner').length,
      revoked: all.filter((e) => e.status === 'REVOKED').length,
      admins: all.filter((e) => e.role === 'super_admin' && e.status === 'ACTIVE').length,
    };
  });

  /** Grants or revokes examiner access. The directory and audit log update live afterwards. */
  async manage(email: string, action: RoleAction): Promise<ManageExaminerRoleResponse> {
    const call = httpsCallable<ManageExaminerRoleRequest, ManageExaminerRoleResponse>(
      this.#functions,
      'manageExaminerRole',
    );
    return (await call({ email, action })).data;
  }
}
