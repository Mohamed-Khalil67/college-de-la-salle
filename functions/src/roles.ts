import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  type AuditAction,
  COLLECTIONS,
  directoryKeysFor,
  type DirectoryStatus,
  type ExaminerDirectoryEntry,
  hasRole,
  type ManageExaminerRoleRequest,
  type ManageExaminerRoleResponse,
  parseDirectoryTarget,
  parseRole,
  type RefreshRoleResponse,
  resolveRole,
  ROLE_CLAIM,
  TEACHER_CLAIM,
  type UserRole,
} from './contracts';

/*
 * Zero-trust RBAC.
 *
 *  - The `role` custom claim is the only thing firestore.rules trust. Only this file (and the
 *    bootstrap script) sets it, always derived from `examiner_directory`.
 *  - Every role change is written to `audit_logs` in the same transaction as the directory change.
 *  - Downgrades revoke refresh tokens AND record `user_metadata/{uid}.revokeTime`; the rules reject
 *    any ID token whose `auth_time` predates it, so a stale token can't keep examiner access for
 *    the rest of its hour.
 */

const db = () => getFirestore();
const directory = () => db().collection(COLLECTIONS.examinerDirectory);

type EntryState = Pick<ExaminerDirectoryEntry, 'role' | 'status'>;

/* ---------------------------------------------------------------------------------------------- */
/* refreshRole — the caller's own role, recomputed from the directory.                            */
/* ---------------------------------------------------------------------------------------------- */

export const refreshRole = onCall<void, Promise<RefreshRoleResponse>>(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'سجِّل الدخول أولًا.');
  const user = await getAuth().getUser(auth.uid);
  return { role: await reconcileUser(user) };
});

/* ---------------------------------------------------------------------------------------------- */
/* manageExaminerRole — super admin grants or revokes examiner access by email or @domain.        */
/* ---------------------------------------------------------------------------------------------- */

export const manageExaminerRole = onCall<
  ManageExaminerRoleRequest,
  Promise<ManageExaminerRoleResponse>
>(async (request) => {
  const actor = requireSuperAdmin(request);
  const { email, action } = (request.data ?? {}) as Partial<ManageExaminerRoleRequest>;
  if (action !== 'grant' && action !== 'revoke') {
    throw new HttpsError('invalid-argument', 'الإجراء المطلوب غير معروف.');
  }
  const target = parseDirectoryTarget(typeof email === 'string' ? email : '');
  if (!target) {
    throw new HttpsError('invalid-argument', 'أدخِل بريدًا إلكترونيًّا صحيحًا أو نطاقًا يبدأ بـ @.');
  }
  if (target.entry === actor.email) {
    throw new HttpsError('failed-precondition', 'لا يمكنك تعديل صلاحيات حسابك بنفسك.');
  }

  const status: DirectoryStatus = action === 'grant' ? 'ACTIVE' : 'REVOKED';
  const accounts = await accountsFor(target.entry, target.kind);
  const ref = directory().doc(target.entry);

  await db().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.get('role') === 'super_admin') {
      throw new HttpsError('failed-precondition', 'لا يمكن تعديل صلاحيات مشرف عام من هذه الصفحة.');
    }
    tx.set(ref, {
      entry: target.entry,
      kind: target.kind,
      role: 'examiner',
      status,
      uid: target.kind === 'EMAIL' ? (accounts[0]?.uid ?? null) : null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.email,
    });
    writeAudit(tx, action === 'grant' ? 'GRANT_EXAMINER' : 'REVOKE_EXAMINER', actor, target.entry, accounts);
  });

  // Apply to existing accounts now; anyone else gets it at their next sign-in (refreshRole).
  let accountsUpdated = 0;
  for (const user of accounts) {
    const before = parseRole(user.customClaims?.[ROLE_CLAIM]);
    if ((await reconcileUser(user)) !== before) accountsUpdated++;
  }
  logger.info('Role change', { actor: actor.uid, entry: target.entry, action, accountsUpdated });
  return { entry: target.entry, status, accountsUpdated };
});

/* ---------------------------------------------------------------------------------------------- */
/* Shared                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Sets the account's claim to what the directory says. Anonymous or unverified accounts are always
 * examinees. A downgrade revokes the account's refresh tokens and stamps `revokeTime`.
 */
export async function reconcileUser(user: UserRecord): Promise<UserRole> {
  const current = parseRole(user.customClaims?.[ROLE_CLAIM]);
  const next = await roleFromDirectory(user);
  const teacher = hasRole(next, 'examiner');
  const claimOk = (user.customClaims?.[TEACHER_CLAIM] === true) === teacher;
  if (next === current && claimOk) return next;

  await getAuth().setCustomUserClaims(user.uid, {
    ...user.customClaims,
    [ROLE_CLAIM]: next,
    [TEACHER_CLAIM]: teacher,
  });
  if (next === current) return next; // only the teacher flag was missing (older accounts)
  const metadata = db().collection(COLLECTIONS.userMetadata).doc(user.uid);
  if (hasRole(current, next)) {
    // Downgrade: close the stale-token window.
    await getAuth().revokeRefreshTokens(user.uid);
    const fresh = await getAuth().getUser(user.uid);
    const revokeTime = Math.floor(Date.parse(fresh.tokensValidAfterTime ?? new Date().toUTCString()) / 1000);
    await metadata.set({ revokeTime });
  } else {
    // Upgrade (or re-grant): an old revocation must not block the newly granted role.
    await metadata.delete();
  }
  return next;
}

async function roleFromDirectory(user: UserRecord): Promise<UserRole> {
  const anonymous = user.providerData.length === 0 && !user.email;
  if (anonymous || !user.email || !user.emailVerified) return 'examinee';
  const [exactKey, domainKey] = directoryKeysFor(user.email);
  if (!exactKey || !domainKey) return 'examinee';
  const [exact, domain] = await db().getAll(directory().doc(exactKey), directory().doc(domainKey));
  return resolveRole(entryState(exact), entryState(domain));
}

function entryState(snap: FirebaseFirestore.DocumentSnapshot): EntryState | null {
  if (!snap.exists) return null;
  const role = snap.get('role');
  const status = snap.get('status');
  if ((role !== 'examiner' && role !== 'super_admin') || (status !== 'ACTIVE' && status !== 'REVOKED')) {
    return null;
  }
  return { role, status };
}

/** Existing accounts an entry applies to: the one account, or every verified account of a domain. */
async function accountsFor(entry: string, kind: 'EMAIL' | 'DOMAIN'): Promise<UserRecord[]> {
  if (kind === 'EMAIL') {
    try {
      return [await getAuth().getUserByEmail(entry)];
    } catch {
      return []; // No account yet: the directory entry applies at first sign-in.
    }
  }
  const matches: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.email?.toLowerCase().endsWith(entry) && user.emailVerified) matches.push(user);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return matches;
}

interface Actor {
  readonly uid: string;
  readonly email: string;
}

/**
 * Examiner-only callables: the role claim must allow authoring, and the token must not predate a
 * revocation (same check as the rules' `tokenFresh()`). Returns the caller's uid.
 */
export async function requireAuthor(request: CallableRequest): Promise<string> {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'سجِّل الدخول أولًا.');
  if (auth.token[TEACHER_CLAIM] !== true) {
    throw new HttpsError('permission-denied', 'هذا الإجراء مقصور على المعلّمين.');
  }
  const metadata = await db().collection(COLLECTIONS.userMetadata).doc(auth.uid).get();
  const revokeTime = metadata.get('revokeTime');
  if (typeof revokeTime === 'number' && auth.token.auth_time <= revokeTime) {
    throw new HttpsError('unauthenticated', 'انتهت صلاحية جلستك. سجِّل الدخول من جديد.');
  }
  return auth.uid;
}

function requireSuperAdmin(request: CallableRequest): Actor {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'سجِّل الدخول أولًا.');
  if (auth.token[ROLE_CLAIM] !== 'super_admin') {
    throw new HttpsError('permission-denied', 'هذا الإجراء مقصور على المشرف العام.');
  }
  return { uid: auth.uid, email: String(auth.token.email ?? '').toLowerCase() };
}

function writeAudit(
  tx: Transaction,
  action: AuditAction,
  actor: Actor,
  target: string,
  accounts: readonly UserRecord[],
): void {
  tx.create(db().collection(COLLECTIONS.auditLogs).doc(), {
    action,
    actorUid: actor.uid,
    actorEmail: actor.email,
    target,
    targetUids: accounts.map((u) => u.uid),
    at: FieldValue.serverTimestamp(),
  });
}
