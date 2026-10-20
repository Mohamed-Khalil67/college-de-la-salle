import { Component, computed, input } from '@angular/core';
import type { Resource } from '@angular/core';
import { apiMessage } from '../../core/api/api-client';
import { Alert } from '../../ui';

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
    if (!error) return null;
    // Errors that are not Error-like reach us wrapped, with the original as `cause`.
    const cause = (error as { cause?: unknown }).cause;
    return apiMessage(error.name === 'HttpErrorResponse' || !cause ? error : cause);
  });
  protected readonly loading = computed(() => this.ref().isLoading() && !this.ref().hasValue());
}
