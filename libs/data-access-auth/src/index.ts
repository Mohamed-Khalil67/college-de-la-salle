/*
 * Identity and platform foundation (eager-safe: Firebase app + Auth only). Loaded by the app shell
 * on every page, including the prerendered public portal.
 *
 * Firestore, Cloud Functions and the super-admin directory are a separate entry point,
 * `@exam/data-access-auth/data`, so they are bundled only into the lazy chunks that use them.
 */
export * from './lib/firebase.providers';
export * from './lib/auth.store';
export * from './lib/role.guard';