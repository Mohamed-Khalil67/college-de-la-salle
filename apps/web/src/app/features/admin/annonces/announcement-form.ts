import { Component, computed, inject, input, output, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { LIMITS, type PostDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { Alert, Button, Field, FieldControl } from '../../../shared/ui';
import { shownError } from '../../../shared/utils/forms';
import { audienceFromValue, type AudienceOption, WHOLE_SCHOOL } from './audience';

interface AnnouncementModel {
  title: string;
  body: string;
  audience: string;
}

const empty = (): AnnouncementModel => ({ title: '', body: '', audience: WHOLE_SCHOOL });

/** A new announcement from the administration: the whole school, a section or one class. */
@Component({
  selector: 'app-announcement-form',
  imports: [FormField, Alert, Button, Field, FieldControl],
  template: `
    <form class="stack stack--sm" novalidate (submit)="onSubmit($event)">
      @if (failure()) {
        <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
      }
      <cdls-field label="Titre" [error]="titleError()">
        <input cdlsControl type="text" autocomplete="off" [formField]="postForm.title" />
      </cdls-field>
      <cdls-field label="Pour qui ?" [error]="audienceError()">
        <select cdlsControl [formField]="postForm.audience">
          @for (o of audiences(); track o.value) {
            <option [value]="o.value">{{ o.label }}</option>
          }
        </select>
      </cdls-field>
      <cdls-field label="Message" [error]="bodyError()">
        <textarea cdlsControl rows="5" [formField]="postForm.body"></textarea>
      </cdls-field>
      <div>
        <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Publication…' : 'Publier l’annonce' }}</button>
      </div>
    </form>
  `,
})
export class AnnouncementForm {
  readonly audiences = input.required<readonly AudienceOption[]>();
  readonly created = output<PostDto>();

  readonly #api = inject(ApiClient);
  protected readonly model = signal<AnnouncementModel>(empty());
  protected readonly postForm = form(this.model, (p) => {
    required(p.title, { message: 'Donnez un titre à l’annonce.' });
    maxLength(p.title, LIMITS.title, { message: `Le titre ne doit pas dépasser ${LIMITS.title} caractères.` });
    required(p.audience, { message: 'Choisissez à qui s’adresse l’annonce.' });
    required(p.body, { message: 'Écrivez le message de l’annonce.' });
    maxLength(p.body, LIMITS.body, { message: `Le message ne doit pas dépasser ${LIMITS.body} caractères.` });
  });
  protected readonly titleError = computed(() => shownError(this.postForm.title()));
  protected readonly audienceError = computed(() => shownError(this.postForm.audience()));
  protected readonly bodyError = computed(() => shownError(this.postForm.body()));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    void submit(this.postForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const m = this.model();
        const post = await this.#api.calendar.createPost({
          title: m.title.trim(),
          body: m.body.trim(),
          ...audienceFromValue(m.audience),
        });
        this.postForm().reset(empty());
        this.created.emit(post);
      } catch (error) {
        this.failure.set(`L’annonce n’a pas été publiée. ${apiMessage(error)}`);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
