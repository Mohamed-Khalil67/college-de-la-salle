/**
 * Seeds the first Super-Admin. Idempotent: running it again changes nothing.
 *
 *   Emulator:    npm run bootstrap:superadmin -- admin@example.test
 *   Production:  GOOGLE_APPLICATION_CREDENTIALS=key.json npm run bootstrap:superadmin -- you@school.edu --project my-project
 *
 * Writes examiner_directory/{email} = super_admin (the source of truth). If the account already
 * exists, sets its `role` claim immediately; otherwise the role is applied by `refreshRole` at
 * the person's first sign-in. Every change is recorded in audit_logs.
 *
 * Runs on Node 22 with native type stripping; firebase-admin is loaded from functions/.
 */
import { createRequire } from 'node:module';
import type * as AdminApp from 'firebase-admin/app';
import type * as AdminAuth from 'firebase-admin/auth';
import type * as AdminFirestore from 'firebase-admin/firestore';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app') as typeof AdminApp;
const { getAuth } = require('firebase-admin/auth') as typeof AdminAuth;
const { FieldValue, getFirestore } = require('firebase-admin/firestore') as typeof AdminFirestore;

const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const projectId =
  (projectFlag >= 0 ? args[projectFlag + 1] : undefined) ?? process.env['GCLOUD_PROJECT'] ?? 'demo-exam-platform';
const projectValueIndex = projectFlag >= 0 ? projectFlag + 1 : -1;
const email = args.find((a, i) => !a.startsWith('--') && i !== projectValueIndex)?.trim().toLowerCase();

if (!email || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) {
  console.error('Usage: npm run bootstrap:superadmin -- <email> [--project <id>]');
  process.exit(1);
}

// demo-* projects only exist in the emulators: point the Admin SDK there by default.
if (projectId.startsWith('demo-')) {
  process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] ??= '127.0.0.1:9099';
}

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

const user = await auth.getUserByEmail(email).catch(() => null);
const directoryRef = db.collection('examiner_directory').doc(email);
const current = await directoryRef.get();
const claimSet = user?.customClaims?.['role'] === 'super_admin';
const entrySet = current.get('role') === 'super_admin' && current.get('status') === 'ACTIVE';

if (entrySet && (claimSet || !user)) {
  console.log(`${email} is already the super admin${user ? '' : ' (applies at first sign-in)'}. Nothing to do.`);
  process.exit(0);
}

await db.runTransaction(async (tx) => {
  tx.set(directoryRef, {
    entry: email,
    kind: 'EMAIL',
    role: 'super_admin',
    status: 'ACTIVE',
    uid: user?.uid ?? null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'bootstrap-superadmin',
  });
  tx.create(db.collection('audit_logs').doc(), {
    action: 'BOOTSTRAP_SUPER_ADMIN',
    actorUid: null,
    actorEmail: 'bootstrap-superadmin',
    target: email,
    targetUids: user ? [user.uid] : [],
    at: FieldValue.serverTimestamp(),
  });
});

if (user) {
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role: 'super_admin', teacher: true });
  await db.collection('user_metadata').doc(user.uid).delete();
  console.log(`${email} is now the super admin. They should sign out and in again (or refresh permissions).`);
} else {
  console.log(`${email} will become the super admin at their first sign-in.`);
}
process.exit(0);
