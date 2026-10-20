import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { SCHOOL } from '../../school';
import { Alert, Button, Field, FieldControl } from '../../ui';
import { contactMailto, type ContactMessage } from './contact-mail';

let nextId = 0;

/** First error of a field once the visitor has left it (or tried to send). */
function shownError(state: { touched(): boolean; errors(): readonly { message?: string }[] }): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
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

/**
 * `<form siteContactForm>`: « Écrire au secrétariat ». The public site has no message endpoint yet:
 * once the form is valid, the visitor's e-mail app opens with the message ready to send to the
 * college's address. `full` adds the phone and subject fields (contact page).
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
      @if (opened()) {
        <cdls-alert tone="success">
          Votre messagerie s’ouvre avec le message prêt à envoyer. Si rien ne s’ouvre, écrivez directement à
          <a [href]="'mailto:' + school.email">{{ school.email }}</a>.
        </cdls-alert>
      }
    </div>

    @if (full()) {
      <div class="grid-2 grid-2--tight">
        <cdls-field label="Nom du parent ou de l’élève" [error]="nameError()">
          <input cdlsControl autocomplete="name" [formField]="contactForm.name" />
        </cdls-field>
        <cdls-field label="Téléphone (facultatif)">
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

    <p class="t-body-s t-muted">
      Le message s’ouvre dans votre messagerie, adressé à {{ school.email }}, prêt à être envoyé.
    </p>
    <p><button cdlsButton type="submit">Envoyer le message</button></p>
  `,
})
export class ContactForm {
  /** 2 on the contact page, 3 inside the home page's contact section. */
  readonly headingLevel = input<2 | 3>(2);
  readonly full = input(false);

  readonly #document = inject(DOCUMENT);
  readonly #host = inject<ElementRef<HTMLFormElement>>(ElementRef);
  readonly #injector = inject(Injector);

  protected readonly school = SCHOOL;
  protected readonly subjects = SUBJECTS;
  protected readonly tracks = TRACKS;
  protected readonly titleId = `contact-form-title-${++nextId}`;

  protected readonly model = signal<ContactMessage>({
    name: '',
    email: '',
    phone: '',
    subject: SUBJECTS[0],
    track: '',
    message: '',
  });
  protected readonly contactForm = form(this.model, (path) => {
    required(path.name, { message: 'Saisissez votre nom.' });
    required(path.email, { message: 'Saisissez votre adresse e-mail.' });
    email(path.email, { message: 'Saisissez une adresse complète, par exemple nom@domaine.com.' });
    required(path.message, { message: 'Écrivez votre message.' });
    maxLength(path.message, 1000, { message: 'Raccourcissez le message à 1 000 caractères au plus.' });
  });
  protected readonly nameError = computed(() => shownError(this.contactForm.name()));
  protected readonly emailError = computed(() => shownError(this.contactForm.email()));
  protected readonly messageError = computed(() => shownError(this.contactForm.message()));
  protected readonly opened = signal(false);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.opened.set(false);
    void submit(this.contactForm, async () => {
      const value = this.model();
      this.#document.location.href = contactMailto(SCHOOL.email, this.full() ? value : { ...value, phone: '', subject: '' });
      this.opened.set(true);
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
