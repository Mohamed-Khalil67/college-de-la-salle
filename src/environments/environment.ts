import type { FirebasePlatformConfig } from '@exam/data-access-exams';

/**
 * Development: everything runs against the local Firebase Emulator Suite (`npm run emulators`).
 * The `demo-` project id tells the emulators no real Firebase project is needed.
 */
export const environment: FirebasePlatformConfig = {
  options: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-exam-platform.firebaseapp.com',
    projectId: 'demo-exam-platform',
    appId: 'demo-exam-platform',
  },
  functionsRegion: 'us-central1',
  examinerSignInFlow: 'popup',
  emulators: {
    host: '127.0.0.1',
    auth: 9099,
    firestore: 8080,
    functions: 5001,
  },
};
