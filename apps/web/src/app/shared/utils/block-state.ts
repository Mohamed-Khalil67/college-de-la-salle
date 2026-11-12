/**
 * The state of one block of a role's home page, as a single discriminated union (no loading/error flags
 * that can contradict each other). Plain functions, so every block's states are checked by Vitest; the
 * `HomeBlock` component renders the loading, error and empty states, the block renders `ready`.
 */

import type { Resource } from '@angular/core';

export const BLOCK_STATUSES = ['loading', 'error', 'empty', 'ready'] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

export type BlockState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly data: T };

/** What a block reads of a `resource()`: its error, else its value (undefined while it loads). */
export interface Snapshot<V> {
  readonly error: unknown;
  readonly value: V | undefined;
}

/** What a block reads of a `resource()`: its error, else its value (undefined while it loads). */
export function snapshotOf<V>(ref: Resource<V | undefined>): Snapshot<V> {
  return { error: ref.error(), value: ref.hasValue() ? ref.value() : undefined };
}

export const LOADING: Snapshot<never> = { error: undefined, value: undefined };

/**
 * Error first, then loading, then the block's own view of the value: `view` returns null when there is
 * nothing to show (the block's empty state).
 */
export function blockState<V, T>(snapshot: Snapshot<V>, view: (value: V) => T | null): BlockState<T> {
  if (snapshot.error) return { status: 'error', error: snapshot.error };
  if (snapshot.value === undefined) return { status: 'loading' };
  const data = view(snapshot.value);
  return data === null ? { status: 'empty' } : { status: 'ready', data };
}

/** Two sources read as one: the first error wins, and it loads until both have a value. */
export function bothOf<A, B>(a: Snapshot<A>, b: Snapshot<B>): Snapshot<readonly [A, B]> {
  const error = a.error || b.error;
  if (error) return { error, value: undefined };
  return { error: undefined, value: a.value === undefined || b.value === undefined ? undefined : [a.value, b.value] };
}

export interface BlockReport {
  readonly heading: string;
  readonly status: BlockStatus;
}

/**
 * The one sentence a page announces to assistive technology (a permanent polite region, updated with text):
 * nothing before any block reports, « Chargement… » while one loads, then « Page chargée. » or the blocks
 * that failed (their own alert says why).
 */
export function pageStatusMessage(reports: readonly BlockReport[]): string {
  if (!reports.length) return '';
  if (reports.some((r) => r.status === 'loading')) return 'Chargement de la page…';
  const failed = reports.filter((r) => r.status === 'error').map((r) => r.heading);
  if (!failed.length) return 'Page chargée.';
  return failed.length === 1
    ? `Page chargée. Le bloc « ${failed[0]} » n’a pas pu être chargé.`
    : `Page chargée. Ces blocs n’ont pas pu être chargés : ${failed.join(', ')}.`;
}
