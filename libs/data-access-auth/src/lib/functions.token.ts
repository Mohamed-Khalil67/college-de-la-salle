import { InjectionToken, inject } from '@angular/core';
import { type FirebaseApp } from 'firebase/app';
import { connectFunctionsEmulator, type Functions, getFunctions } from 'firebase/functions';
import { FIREBASE_APP, FIREBASE_PLATFORM_CONFIG, type FirebasePlatformConfig } from './firebase.providers';

const instances = new WeakMap<FirebaseApp, Functions>();

/** One Functions client per app, whether reached through DI or a dynamic import (AuthStore). */
export function createFunctions(app: FirebaseApp, fresh: boolean, config: FirebasePlatformConfig): Functions {
  const existing = instances.get(app);
  if (existing) return existing;
  const functions = getFunctions(app, config.functionsRegion);
  if (config.emulators && fresh) {
    connectFunctionsEmulator(functions, config.emulators.host, config.emulators.functions);
  }
  instances.set(app, functions);
  return functions;
}

/** Cloud Functions client, created on first injection (lazy chunks only). */
export const FIREBASE_FUNCTIONS = /* @__PURE__ */ new InjectionToken<Functions>('FIREBASE_FUNCTIONS', {
  factory: () => {
    const { app, fresh } = inject(FIREBASE_APP);
    return createFunctions(app, fresh, inject(FIREBASE_PLATFORM_CONFIG));
  },
});
