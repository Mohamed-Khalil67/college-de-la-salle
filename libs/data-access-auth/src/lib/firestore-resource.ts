import {
  type ResourceRef,
  type ResourceStreamItem,
  type Signal,
  type WritableSignal,
  resource,
  signal,
} from '@angular/core';
import {
  type DocumentReference,
  type FirestoreError,
  onSnapshot,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';

/**
 * Bridges a Firestore snapshot listener into an Angular streaming `resource`.
 *
 * - Re-subscribes whenever `params()` changes, and stays idle while it is `undefined`.
 * - Unsubscribes on param change or owner destruction via the resource's `abortSignal`.
 * - No zone, no RxJS: snapshots write straight into a signal, which schedules zoneless CD.
 */
export function firestoreQueryResource<T, P>(options: {
  params: () => P | undefined;
  query: (params: P) => Query<T>;
}): ResourceRef<readonly T[]> {
  return resource({
    params: options.params,
    defaultValue: [] as readonly T[],
    stream: ({ params, abortSignal }) =>
      streamSnapshots<readonly T[]>(abortSignal, (next, fail) =>
        onSnapshot(
          options.query(params as P),
          (snap) => next(snap.docs.map((d) => d.data())),
          fail,
        ),
      ),
  });
}

export function firestoreDocResource<T, P>(options: {
  params: () => P | undefined;
  ref: (params: P) => DocumentReference<T>;
}): ResourceRef<T | null | undefined> {
  return resource({
    params: options.params,
    stream: ({ params, abortSignal }) =>
      streamSnapshots<T | null>(abortSignal, (next, fail) =>
        onSnapshot(
          options.ref(params as P),
          (snap) => next(snap.exists() ? snap.data() : null),
          fail,
        ),
      ),
  });
}

function streamSnapshots<T>(
  abortSignal: AbortSignal,
  subscribe: (next: (value: T) => void, fail: (error: FirestoreError) => void) => Unsubscribe,
): Promise<Signal<ResourceStreamItem<T>>> {
  return new Promise((resolve) => {
    let state: WritableSignal<ResourceStreamItem<T>> | undefined;
    const emit = (item: ResourceStreamItem<T>) => {
      if (state) {
        state.set(item);
      } else {
        state = signal(item);
        resolve(state);
      }
    };
    const unsubscribe = subscribe(
      (value) => emit({ value }),
      (error) => emit({ error }),
    );
    abortSignal.addEventListener('abort', unsubscribe, { once: true });
  });
}
