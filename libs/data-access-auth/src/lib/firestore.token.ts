import { InjectionToken, inject } from '@angular/core';
import { connectFirestoreEmulator, type Firestore, getFirestore } from 'firebase/firestore';
import { FIREBASE_APP, FIREBASE_PLATFORM_CONFIG } from './firebase.providers';

/** Firestore, created on first injection (i.e. in the lazy chunk that needs it). */
export const FIRESTORE = /* @__PURE__ */ new InjectionToken<Firestore>('FIRESTORE', {
  factory: () => {
    const { app, fresh } = inject(FIREBASE_APP);
    const config = inject(FIREBASE_PLATFORM_CONFIG);
    const firestore = getFirestore(app);
    if (config.emulators && fresh) {
      connectFirestoreEmulator(firestore, config.emulators.host, config.emulators.firestore);
    }
    return firestore;
  },
});
