import { Component, computed, input } from '@angular/core';
import type { Resource } from '@angular/core';
import { apiMessage } from '../../core/api/api-client';
import { Alert } from '../ui';

/** The French message of a failed `resource()` (shared with the home-page blocks). */
export function resourceErrorMessage(error: unknown): string {
  // Errors that are not Error-like reach us wrapped, with the original as `cause`.
  const cause = error instanceof Error ? error.cause : undefined;
  const http = error instanceof Error && error.name === 'HttpErrorResponse';
  return apiMessage(http || !cause ? error : cause);
}

/**
 * The loading and error states of a `resource()`: a quiet line while the first value loads, a danger
 * alert (role="alert") with the API's French message when it fails. The caller renders the value.
 */
@Component({
  selector: 'app-load-state',
  imports: [Alert],
  template: `
    @if (failure(); as message) {
      <cdls-alert tone="danger">{{ message }}</cdls-alert>
    } @else if (loading()) {
      <p class="loading-line">{{ label() }}</p>
    }
  `,
})
export class LoadState {
  readonly ref = input.required<Resource<unknown>>();
  readonly label = input('Chargement…');

  protected readonly failure = computed(() => {
    const error = this.ref().error();
    return error ? resourceErrorMessage(error) : null;
  });
  protected readonly loading = computed(() => this.ref().isLoading() && !this.ref().hasValue());
}
