import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { email, form, FormField, hidden, maxLength, pattern, required, submit } from '@angular/forms/signals';
import type { ClassDto, CreatedUserResponse, Role, UserDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { CopyButton } from '../shared/copy-button';
import { fullName, groupBySection, ROLE_LABELS, ROLE_TABS, shownError, STUDENT_NUMBER } from '../shared/admin-format';

interface CreateUserModel {
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  classId: string;
  studentNumber: string;
}

/** Creates one account. The generated temporary password is shown once, with a copy button. */
@Component({
  selector: 'app-user-create-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl, CopyButton],
  template: `
    <cdls-modal title="Ajouter un utilisateur" [(open)]="open" [dismissible]="!result() && !busy()">
      @if (result(); as created) {
        <div class="stack" #resultBlock tabindex="-1">
          <cdls-alert tone="warning">
            <div class="stack stack--sm">
              <p><strong>Compte créé pour {{ createdName() }}</strong> ({{ created.user.email }}).</p>
              <p>
                Mot de passe temporaire :
                <code class="temp-password">{{ created.temporaryPassword }}</code>
              </p>
              <p>
                Il ne sera plus affiché. Copiez-le maintenant et remettez-le à la personne en main propre : elle choisira
                son propre mot de passe à la première connexion.
              </p>
              <app-copy-button [value]="created.temporaryPassword" [what]="'le mot de passe de ' + createdName()" />
            </div>
          </cdls-alert>
          <div class="modal__footer">
            <button cdlsButton variant="secondary" type="button" (click)="reset()">Ajouter un autre compte</button>
            <button cdlsButton type="button" (click)="open.set(false)">Terminé</button>
          </div>
        </div>
      } @else {
        <form class="stack" novalidate (submit)="onSubmit($event)">
          <cdls-field label="Type de compte">
            <select cdlsControl [formField]="userForm.role">
              @for (role of roles; track role) {
                <option [value]="role">{{ roleLabels[role].one }}</option>
              }
            </select>
          </cdls-field>
          <cdls-field label="Prénom" [error]="firstNameError()">
            <input cdlsControl autocomplete="off" [formField]="userForm.firstName" />
          </cdls-field>
          <cdls-field label="Nom" [error]="lastNameError()">
            <input cdlsControl autocomplete="off" [formField]="userForm.lastName" />
          </cdls-field>
          <cdls-field
            label="Adresse e-mail (facultative)"
            helper="Laissez vide pour créer l’adresse du collège : prenom.nom suivi du domaine, avec un numéro si elle existe déjà."
            [error]="emailError()"
          >
            <input cdlsControl type="email" autocomplete="off" [formField]="userForm.email" />
          </cdls-field>
          @if (isStudent()) {
            <cdls-field label="Classe" [error]="classError()">
              <select cdlsControl [formField]="userForm.classId">
                <option value="">Choisir une classe</option>
                @for (group of classGroups(); track group.code) {
                  <optgroup [label]="group.label">
                    @for (item of group.items; track item.id) {
                      <option [value]="item.id">{{ item.label }}</option>
                    }
                  </optgroup>
                }
              </select>
            </cdls-field>
            <cdls-field
              label="Matricule (facultatif)"
              helper="Lettres, chiffres et tirets, 32 caractères au plus."
              [error]="numberError()"
            >
              <input cdlsControl autocomplete="off" [formField]="userForm.studentNumber" />
            </cdls-field>
          }
          <p class="t-body-s t-muted">Un mot de passe temporaire est créé et affiché une seule fois, juste après l’enregistrement. La personne devra le remplacer à sa première connexion.</p>
          @if (failure()) {
            <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
          }
          <div class="modal__footer">
            <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
            <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Création…' : 'Créer le compte' }}</button>
          </div>
        </form>
      }
    </cdls-modal>
  `,
  styles: `
    .temp-password {
      font-size: var(--text-body-l);
      font-weight: 600;
      letter-spacing: 0.04em;
      user-select: all;
    }
    [tabindex='-1']:focus {
      outline: none;
    }
  `,
})
export class UserCreateModal {
  readonly open = model(false);
  readonly classes = input<readonly ClassDto[]>([]);
  readonly defaultRole = input<Role>('student');
  readonly created = output<UserDto>();

  readonly #api = inject(ApiClient);
  readonly #injector = inject(Injector);
  private readonly resultBlock = viewChild<ElementRef<HTMLElement>>('resultBlock');

  protected readonly roles = ROLE_TABS;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly classGroups = computed(() => groupBySection(this.classes()));

  protected readonly model = signal<CreateUserModel>(this.#blank('student'));
  protected readonly userForm = form(this.model, (p) => {
    const student = ({ valueOf }: { valueOf: (path: typeof p.role) => Role }) => valueOf(p.role) === 'student';
    required(p.firstName, { message: 'Saisissez le prénom.' });
    maxLength(p.firstName, 80, { message: 'Le prénom compte 80 caractères au plus.' });
    required(p.lastName, { message: 'Saisissez le nom de famille.' });
    maxLength(p.lastName, 80, { message: 'Le nom compte 80 caractères au plus.' });
    email(p.email, { message: 'Saisissez une adresse e-mail complète, par exemple prenom.nom@lasalle-daher.eg, ou laissez le champ vide.' });
    hidden(p.classId, (ctx) => !student(ctx));
    hidden(p.studentNumber, (ctx) => !student(ctx));
    required(p.classId, { message: 'Choisissez la classe de l’élève.', when: student });
    pattern(p.studentNumber, STUDENT_NUMBER, {
      message: 'Utilisez seulement des lettres, des chiffres et des tirets (32 au plus).',
      when: student,
    });
  });

  protected readonly firstNameError = computed(() => shownError(this.userForm.firstName()));
  protected readonly lastNameError = computed(() => shownError(this.userForm.lastName()));
  protected readonly emailError = computed(() => shownError(this.userForm.email()));
  protected readonly classError = computed(() => shownError(this.userForm.classId()));
  protected readonly numberError = computed(() => shownError(this.userForm.studentNumber()));
  protected readonly isStudent = computed(() => this.model().role === 'student');

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly result = signal<CreatedUserResponse | null>(null);
  protected readonly createdName = computed(() => {
    const created = this.result();
    return created ? fullName(created.user) : '';
  });

  constructor() {
    // A fresh form each time the dialog opens; the previous password is never shown again.
    effect(() => {
      if (this.open()) untracked(() => this.reset());
      else untracked(() => this.result.set(null));
    });
  }

  protected reset(): void {
    this.result.set(null);
    this.failure.set(null);
    this.userForm().reset(this.#blank(this.defaultRole()));
  }

  #blank(role: Role): CreateUserModel {
    return { role, firstName: '', lastName: '', email: '', classId: '', studentNumber: '' };
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.userForm, async () => {
      const value = this.model();
      const isStudent = value.role === 'student';
      this.busy.set(true);
      this.failure.set(null);
      try {
        const created = await this.#api.users.create({
          role: value.role,
          firstName: value.firstName.trim(),
          lastName: value.lastName.trim(),
          ...(value.email.trim() ? { email: value.email.trim() } : {}),
          ...(isStudent && value.classId ? { classId: value.classId } : {}),
          ...(isStudent && value.studentNumber.trim() ? { studentNumber: value.studentNumber.trim() } : {}),
        });
        this.result.set(created);
        this.created.emit(created.user);
        afterNextRender(() => this.resultBlock()?.nativeElement.focus(), { injector: this.#injector });
      } catch (error) {
        this.failure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
