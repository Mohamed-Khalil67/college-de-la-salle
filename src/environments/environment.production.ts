import type { FirebasePlatformConfig } from '@exam/data-access-auth';

/**
 * Production: replace with your Firebase web app config (Firebase console → Project settings).
 * These values are public identifiers, not secrets — security is enforced by firestore.rules.
 */
export const environment: FirebasePlatformConfig = {
  options: {
    apiKey: 'REPLACE_ME',
    authDomain: 'REPLACE_ME.firebaseapp.com',
    projectId: 'REPLACE_ME',
    appId: 'REPLACE_ME',
  },
  functionsRegion: 'us-central1',
  examinerSignInFlow: 'popup',
  emulators: null,
};
