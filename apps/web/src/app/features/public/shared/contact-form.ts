import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { CONTACT_LIMITS } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../../core/api/api-client';
import { LOCALE } from '../../../i18n/locale';
import { SCHOOL } from '../../../school';
import { Alert, Button, Field, FieldControl } from '../../../shared/ui';
import {
  CONTACT_SUBJECTS,
  CONTACT_TRACKS,
  type ContactSubjectId,
  type ContactTrackId,
  contactMailto,
  type ContactMessage,
  contactRequest,
} from '../../../school/contact-mail';
import { shownError } from '../../../shared/utils/forms';

let nextId = 0;

/** First error of a field once the visitor has left it (or tried to send). */

function blankMessage(): ContactMessage {
  return { name: '', email: '', phone: '', subject: CONTACT_SUBJECTS.registration, track: '', message: '' };
}

const SUBJECT_IDS = Object.keys(CONTACT_SUBJECTS) as ContactSubjectId[];
const TRACK_IDS = Object.keys(CONTACT_TRACKS) as ContactTrackId[];

/** What happened to the last message sent. */
type SendState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sent'; readonly email: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly mailto: string };

/**
 * `<form siteContactForm>`: « Écrire au secrétariat ». The message is posted to the site
 * (POST /api/contact) and read by the secretariat in the administration. If it cannot be sent, the
 * visitor gets a link that opens their e-mail app with the message ready to send to the college's
 * address. `full` adds the phone and subject fields (contact page). Labels follow the page's language; the
 * subject and track sent are the French wording the secretariat reads (CONTACT_SUBJECTS, CONTACT_TRACKS).
 */
@Component({
  selector: 'form[siteContactForm]',
  imports: [FormField, Alert, Button, Field, FieldControl],
  host: {
    class: 'form-card',
    novalidate: '',
    '[attr.aria-labelledby]': 'titleId',
    '(submit)': 'onSubmit($event)',
  },
  template: `
    @if (headingLevel() === 2) {
      <h2 [id]="titleId" class="t-h2">{{ t.title }}</h2>
    } @else {
      <h3 [id]="titleId" class="t-h2">{{ t.title }}</h3>
    }

    <div aria-live="polite">
      @switch (state().kind) {
        @case ('sent') {
          <cdls-alert tone="success">
            {{ t.sent.before }} <strong>{{ sentTo() }}</strong>{{ t.sent.after }}
          </cdls-alert>
        }
        @case ('failed') {
          <cdls-alert tone="danger">
            <p>{{ failure()?.reason }}</p>
            <p class="contact-fallback">
              <a cdlsButton variant="secondary" size="sm" [href]="failure()?.mailto">{{ t.sendFromMail }}</a>
              <span>{{ t.orWriteTo }} <a [href]="'mailto:' + school.email">{{ school.email }}</a>.</span>
            </p>
          </cdls-alert>
        }
      }
    </div>

    @if (full()) {
      <div class="grid-2 grid-2--tight">
        <cdls-field [label]="t.name" [error]="nameError()">
          <input cdlsControl autocomplete="name" [formField]="contactForm.name" />
        </cdls-field>
        <cdls-field [label]="t.phone" [error]="phoneError()">
          <input cdlsControl type="tel" autocomplete="tel" [formField]="contactForm.phone" />
        </cdls-field>
      </div>
    } @else {
      <cdls-field [label]="t.name" [error]="nameError()">
        <input cdlsControl autocomplete="name" [formField]="contactForm.name" />
      </cdls-field>
    }

    <cdls-field [label]="t.email" [helper]="t.emailHelp" [error]="emailError()">
      <input cdlsControl type="email" autocomplete="email" [formField]="contactForm.email" />
    </cdls-field>

    <div [class]="full() ? 'grid-2 grid-2--tight' : 'stack'">
      @if (full()) {
        <cdls-field [label]="t.subject">
          <select cdlsControl [formField]="contactForm.subject">
            @for (s of subjects; track s.value) {
              <option [value]="s.value">{{ s.label }}</option>
            }
          </select>
        </cdls-field>
      }
      <cdls-field [label]="t.track">
        <select cdlsControl [formField]="contactForm.track">
          <option value="">{{ t.trackNone }}</option>
          @for (option of tracks; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </cdls-field>
    </div>

    <!-- Honeypot for robots: hidden from people and from assistive technologies, out of the tab order. -->
    <div class="contact-trap" aria-hidden="true">
      <label>
        {{ t.trap }}
        <input type="text" name="website" tabindex="-1" autocomplete="off" [value]="trap()" (input)="onTrap($event)" />
      </label>
    </div>

    <cdls-field [label]="t.message" [helper]="t.messageHelp" [error]="messageError()">
      <textarea cdlsControl rows="5" [formField]="contactForm.message"></textarea>
    </cdls-field>

    <p class="t-body-s t-muted">{{ t.note }}</p>
    <p>
      <button cdlsButton type="submit" [disabled]="sending()">{{ sending() ? t.sending : t.send }}</button>
    </p>
  `,
  styles: `
    .contact-trap {
      position: absolute;
      inset-inline-start: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
    .contact-fallback {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      margin-top: var(--space-2);
    }
  `,
})
export class ContactForm {
  /** 2 on the contact page, 3 inside the home page's contact section. */
  readonly headingLevel = input<2 | 3>(2);
  readonly full = input(false);

  readonly #api = inject(ApiClient);
  readonly #host = inject<ElementRef<HTMLFormElement>>(ElementRef);
  readonly #injector = inject(Injector);

  readonly #messages = inject(LOCALE).messages;
  protected readonly t = this.#messages.contactForm;
  protected readonly school = SCHOOL;
  protected readonly subjects = SUBJECT_IDS.map((id) => ({ value: CONTACT_SUBJECTS[id], label: this.t.subjects[id] }));
  protected readonly tracks = TRACK_IDS.map((id) => ({ value: CONTACT_TRACKS[id], label: this.t.tracks[id] }));
  protected readonly titleId = `contact-form-title-${++nextId}`;

  protected readonly model = signal<ContactMessage>(blankMessage());
  protected readonly contactForm = form(this.model, (path) => {
    const errors = this.t.errors;
    required(path.name, { message: errors.nameRequired });
    required(path.email, { message: errors.emailRequired });
    email(path.email, { message: errors.emailInvalid });
    required(path.message, { message: errors.messageRequired });
    maxLength(path.message, CONTACT_LIMITS.message, { message: errors.messageTooLong });
    maxLength(path.name, CONTACT_LIMITS.name, { message: errors.nameTooLong });
    maxLength(path.phone, CONTACT_LIMITS.phone, { message: errors.phoneTooLong });
  });
  protected readonly nameError = computed(() => shownError(this.contactForm.name()));
  protected readonly emailError = computed(() => shownError(this.contactForm.email()));
  protected readonly messageError = computed(() => shownError(this.contactForm.message()));
  protected readonly phoneError = computed(() => shownError(this.contactForm.phone()));
  protected readonly state = signal<SendState>({ kind: 'idle' });
  /** The honeypot's value: stays empty for people. */
  protected readonly trap = signal('');
  protected readonly sending = computed(() => this.contactForm().submitting());
  protected readonly sentTo = computed(() => {
    const state = this.state();
    return state.kind === 'sent' ? state.email : '';
  });
  protected readonly failure = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? state : null;
  });

  protected onTrap(event: Event): void {
    this.trap.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.sending()) return;
    this.state.set({ kind: 'idle' });
    void submit(this.contactForm, async () => {
      const raw = this.model();
      const value = this.full() ? raw : { ...raw, phone: '', subject: '' };
      try {
        await this.#api.contact.send(contactRequest(value, this.trap()));
        this.state.set({ kind: 'sent', email: value.email.trim() });
        this.contactForm().reset(blankMessage());
      } catch (error) {
        this.state.set({
          kind: 'failed',
          reason: this.#messages.common.showServerMessages ? apiMessage(error, this.t.notSent) : this.t.notSent,
          mailto: contactMailto(SCHOOL.email, value),
        });
      }
      return undefined;
    }).then(() => {
      if (!this.contactForm().invalid()) return;
      // Errors are now shown: move focus to the first field to fix.
      afterNextRender(
        () => this.#host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        { injector: this.#injector },
      );
    });
  }
}
