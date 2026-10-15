import { EnvironmentProviders, InjectionToken, inject, makeEnvironmentProviders } from '@angular/core';
import { type FirebaseApp, type FirebaseOptions, getApps, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, type Functions, getFunctions } from 'firebase/functions';

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

interface FirebaseServices {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly functions: Functions;
}

export const FIREBASE_PLATFORM_CONFIG = new InjectionToken<FirebasePlatformConfig>(
  'FIREBASE_PLATFORM_CONFIG',
);

const FIREBASE_SERVICES = new InjectionToken<FirebaseServices>('FIREBASE_SERVICES');

export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH', {
  factory: () => inject(FIREBASE_SERVICES).auth,
});
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE', {
  factory: () => inject(FIREBASE_SERVICES).firestore,
});
export const FIREBASE_FUNCTIONS = new InjectionToken<Functions>('FIREBASE_FUNCTIONS', {
  factory: () => inject(FIREBASE_SERVICES).functions,
});

/**
 * Wires the Firebase Modular SDK directly into Angular DI. No zone-patching wrapper library is
 * involved: every SDK callback is bridged into signals explicitly (see `firestore-resource.ts`),
 * which is exactly what zoneless change detection needs.
 */
export function provideFirebasePlatform(config: FirebasePlatformConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FIREBASE_PLATFORM_CONFIG, useValue: config },
    { provide: FIREBASE_SERVICES, useFactory: () => createServices(config) },
  ]);
}

function createServices(config: FirebasePlatformConfig): FirebaseServices {
  // Re-use the default app across HMR reloads; emulator connections can only be made once.
  const existing = getApps()[0];
  const app = existing ?? initializeApp(config.options);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app, config.functionsRegion);

  if (config.emulators && !existing) {
    const { host } = config.emulators;
    connectAuthEmulator(auth, `http://${host}:${config.emulators.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, host, config.emulators.firestore);
    connectFunctionsEmulator(functions, host, config.emulators.functions);
  }

  return { app, auth, firestore, functions };
}
