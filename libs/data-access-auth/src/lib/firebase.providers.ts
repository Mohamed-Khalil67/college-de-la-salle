import { EnvironmentProviders, InjectionToken, inject, makeEnvironmentProviders } from '@angular/core';
import { type FirebaseApp, type FirebaseOptions, getApps, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';

export interface FirebasePlatformConfig {
  readonly options: FirebaseOptions;
  readonly functionsRegion: string;
  /** 'redirect' works in embedded browsers and on mobile, where popups are unreliable. */
  readonly examinerSignInFlow: 'popup' | 'redirect';
  readonly emulators: {
    readonly host: string;
    readonly auth: number;
    readonly firestore: number;
    readonly functions: number;
  } | null;
}

export const FIREBASE_PLATFORM_CONFIG = /* @__PURE__ */ new InjectionToken<FirebasePlatformConfig>(
  'FIREBASE_PLATFORM_CONFIG',
);

/**
 * True when this app instance created the default Firebase app. Emulator connections can be made
 * only once per SDK instance, so on HMR reloads (app already exists) they are skipped.
 */
export interface FirebaseAppHandle {
  readonly app: FirebaseApp;
  readonly fresh: boolean;
}

export const FIREBASE_APP = /* @__PURE__ */ new InjectionToken<FirebaseAppHandle>('FIREBASE_APP', {
  factory: () => {
    const config = inject(FIREBASE_PLATFORM_CONFIG);
    const existing = getApps()[0];
    return { app: existing ?? initializeApp(config.options), fresh: !existing };
  },
});

/** Auth is needed on every page (the header shows who is signed in), so it is eager. */
export const FIREBASE_AUTH = /* @__PURE__ */ new InjectionToken<Auth>('FIREBASE_AUTH', {
  factory: () => {
    const { app, fresh } = inject(FIREBASE_APP);
    const config = inject(FIREBASE_PLATFORM_CONFIG);
    const auth = getAuth(app);
    if (config.emulators && fresh) {
      connectAuthEmulator(auth, `http://${config.emulators.host}:${config.emulators.auth}`, {
        disableWarnings: true,
      });
    }
    return auth;
  },
});

/**
 * Wires the Firebase Modular SDK directly into Angular DI. No zone-patching wrapper library is
 * involved: every SDK callback is bridged into signals explicitly (see `firestore-resource.ts`),
 * which is exactly what zoneless change detection needs.
 *
 * Firestore (`FIRESTORE`, firestore.token.ts) and Cloud Functions (`FIREBASE_FUNCTIONS`,
 * functions.token.ts) live in their own modules so they are bundled only into the lazy chunks
 * that use them: the public portal ships with Auth alone.
 */
export function provideFirebasePlatform(config: FirebasePlatformConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: FIREBASE_PLATFORM_CONFIG, useValue: config }]);
}
