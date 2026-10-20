import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { CONTACT_LIMITS } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { SCHOOL } from '../../school';
import { Alert, Button, Field, FieldControl } from '../../ui';
import { contactMailto, type ContactMessage, contactRequest } from './contact-mail';

let nextId = 0;

/** First error of a field once the visitor has left it (or tried to send). */
function shownError(state: { touched(): boolean; errors(): readonly { message?: string }[] }): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

function blankMessage(): ContactMessage {
  return { name: '', email: '', phone: '', subject: SUBJECTS[0], track: '', message: '' };
}

const SUBJECTS = ['Demande d’inscription', 'Scolarité d’un élève', 'Accès à l’espace élève', 'Autre question'];
const TRACKS = [
  'Bac nationale, jardin d’enfants',
  'Bac nationale, primaire',
  'Bac nationale, préparatoire',
  'Bac nationale, secondaire',
  'Bac français, maternelle ou élémentaire',
  'Bac français, collège',
  'Bac français, lycée',
];

/** What happened to the last message sent. */
type SendState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent'; readonly email: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly mailto: string };

/**
 * `<form siteContactForm>`: « Écrire au secrétariat ». The message is posted to the site
 * (POST /api/contact) and read by the secretariat in the administration. If it cannot be sent, the
 * visitor gets a link that opens their e-mail app with the message ready to send to the college's
 * address. `full` adds the phone and subject fields (contact page).
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
      <h2 [id]="titleId" class="t-h2">Écrire au secrétariat</h2>
    } @else {
      <h3 [id]="titleId" class="t-h2">Écrire au secrétariat</h3>
    }

    <div aria-live="polite">
      @switch (state().kind) {
        @case ('sent') {
          <cdls-alert tone="success">
            Merci, votre message a bien été envoyé au secrétariat. La réponse vous parviendra à
            <strong>{{ sentTo() }}</strong>.
          </cdls-alert>
        }
        @case ('failed') {
          <cdls-alert tone="danger">
            <p>{{ failure()?.reason }}</p>
            <p class="contact-fallback">
              <a cdlsButton variant="secondary" size="sm" [href]="failure()?.mailto">Envoyer depuis ma messagerie</a>
              <span>ou écrivez à <a [href]="'mailto:' + school.email">{{ school.email }}</a>.</span>
            </p>
          </cdls-alert>
        }
      }
    </div>

    @if (full()) {
      <div class="grid-2 grid-2--tight">
        <cdls-field label="Nom du parent ou de l’élève" [error]="nameError()">
          <input cdlsControl autocomplete="name" [formField]="contactForm.name" />
        </cdls-field>
        <cdls-field label="Téléphone (facultatif)" [error]="phoneError()">
          <input cdlsControl type="tel" autocomplete="tel" [formField]="contactForm.phone" />
        </cdls-field>
      </div>
    } @else {
      <cdls-field label="Nom du parent ou de l’élève" [error]="nameError()">
        <input cdlsControl autocomplete="name" [formField]="contactForm.name" />
      </cdls-field>
    }

    <cdls-field label="Adresse e-mail" helper="Pour que le secrétariat puisse vous répondre." [error]="emailError()">
      <input cdlsControl type="email" autocomplete="email" [formField]="contactForm.email" />
    </cdls-field>

    <div [class]="full() ? 'grid-2 grid-2--tight' : 'stack'">
      @if (full()) {
        <cdls-field label="Objet">
          <select cdlsControl [formField]="contactForm.subject">
            @for (s of subjects; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </cdls-field>
      }
      <cdls-field label="Filière et classe">
        <select cdlsControl [formField]="contactForm.track">
          <option value="">Non précisée</option>
          @for (t of tracks; track t) {
            <option [value]="t">{{ t }}</option>
          }
        </select>
      </cdls-field>
    </div>

    <cdls-field label="Message" helper="1 000 caractères au plus." [error]="messageError()">
      <textarea cdlsControl rows="5" [formField]="contactForm.message"></textarea>
    </cdls-field>

    <p class="t-body-s t-muted">Le secrétariat du collège lit chaque message et vous répond par e-mail.</p>
    <p>
      <button cdlsButton type="submit" [disabled]="sending()">{{ sending() ? 'Envoi en cours…' : 'Envoyer le message' }}</button>
    </p>
  `,
  styles: `
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

  protected readonly school = SCHOOL;
  protected readonly subjects = SUBJECTS;
  protected readonly tracks = TRACKS;
  protected readonly titleId = `contact-form-title-${++nextId}`;

  protected readonly model = signal<ContactMessage>(blankMessage());
  protected readonly contactForm = form(this.model, (path) => {
    required(path.name, { message: 'Saisissez votre nom.' });
    required(path.email, { message: 'Saisissez votre adresse e-mail.' });
    email(path.email, { message: 'Saisissez une adresse complète, par exemple nom@domaine.com.' });
    required(path.message, { message: 'Écrivez votre message.' });
    maxLength(path.message, CONTACT_LIMITS.message, { message: 'Raccourcissez le message à 1 000 caractères au plus.' });
    maxLength(path.name, CONTACT_LIMITS.name, { message: 'Raccourcissez le nom à 120 caractères au plus.' });
    maxLength(path.phone, CONTACT_LIMITS.phone, { message: 'Saisissez un seul numéro de téléphone.' });
  });
  protected readonly nameError = computed(() => shownError(this.contactForm.name()));
  protected readonly emailError = computed(() => shownError(this.contactForm.email()));
  protected readonly messageError = computed(() => shownError(this.contactForm.message()));
  protected readonly phoneError = computed(() => shownError(this.contactForm.phone()));
  protected readonly state = signal<SendState>({ kind: 'idle' });
  protected readonly sending = computed(() => this.state().kind === 'sending');
  protected readonly sentTo = computed(() => {
    const state = this.state();
    return state.kind === 'sent' ? state.email : '';
  });
  protected readonly failure = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? state : null;
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.sending()) return;
    this.state.set({ kind: 'idle' });
    void submit(this.contactForm, async () => {
      const raw = this.model();
      const value = this.full() ? raw : { ...raw, phone: '', subject: '' };
      this.state.set({ kind: 'sending' });
      try {
        await this.#api.contact.send(contactRequest(value));
        this.state.set({ kind: 'sent', email: value.email.trim() });
        this.contactForm().reset(blankMessage());
      } catch (error) {
        this.state.set({
          kind: 'failed',
          reason: apiMessage(error, 'Votre message n’a pas pu être envoyé pour le moment.'),
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
