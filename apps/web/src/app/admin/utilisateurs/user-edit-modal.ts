import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { disabled, form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import type { UserDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Field, FieldControl, Modal } from '../../ui';
import { CopyButton } from '../shared/copy-button';
import { formatDay, fullName, generatePassword, shownError } from '../shared/admin-format';

interface EditUserModel {
  firstName: string;
  lastName: string;
  isActive: boolean;
}

/** Edits names and access of an account, and resets its password to a generated one (shown once). */
@Component({
  selector: 'app-user-edit-modal',
  imports: [FormField, Modal, Alert, Button, Field, FieldControl, CopyButton],
  template: `
    <cdls-modal [title]="'Modifier le compte de ' + name()" [(open)]="open">
      @if (isArchived()) {
        <div class="stack">
          <p class="t-muted">{{ user()?.email }}</p>
          <cdls-alert tone="info">
            Ce compte est archivé{{ user()?.graduatedOn ? ' (diplômé le ' + graduated() + ')' : '' }} : il ne peut plus se connecter
            et reste en lecture seule. Ses notes, absences et bulletins sont conservés.
          </cdls-alert>
          @if (saveFailure()) {
            <cdls-alert tone="danger">{{ saveFailure() }}</cdls-alert>
          }
          <div class="modal__footer">
            <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Fermer</button>
            <button cdlsButton type="button" [disabled]="busy()" (click)="restore()">Restaurer le compte</button>
          </div>
        </div>
      } @else {
      <form class="stack" novalidate (submit)="onSubmit($event)">
        <p class="t-muted">{{ user()?.email }}</p>
        <cdls-field label="Prénom" [error]="firstNameError()">
          <input cdlsControl autocomplete="off" [formField]="editForm.firstName" />
        </cdls-field>
        <cdls-field label="Nom" [error]="lastNameError()">
          <input cdlsControl autocomplete="off" [formField]="editForm.lastName" />
        </cdls-field>
        <label class="check">
          <input type="checkbox" [formField]="editForm.isActive" aria-describedby="edit-active-help" />
          <span>Compte actif</span>
        </label>
        <p class="field__helper" id="edit-active-help">
          @if (isSelf()) {
            Vous ne pouvez pas désactiver votre propre compte.
          } @else {
            Un compte désactivé ne peut plus se connecter. Ses notes, absences et bulletins sont conservés.
          }
        </p>
        @if (saveFailure()) {
          <cdls-alert tone="danger">{{ saveFailure() }}</cdls-alert>
        }
        <div class="modal__footer">
          <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
          <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        </div>
      </form>

      <section #resetSection class="stack stack--sm reset" aria-labelledby="reset-title">
        <h3 class="t-h3" id="reset-title">Mot de passe</h3>
        @if (newPassword(); as password) {
          <cdls-alert tone="warning">
            <div class="stack stack--sm">
              <p>
                Nouveau mot de passe temporaire :
                <code class="temp-password">{{ password }}</code>
              </p>
              <p>Il ne sera plus affiché. Copiez-le maintenant et remettez-le à {{ name() }} en main propre.</p>
              <app-copy-button [value]="password" [what]="'le mot de passe de ' + name()" />
            </div>
          </cdls-alert>
        } @else if (confirmReset()) {
          <p>L’ancien mot de passe cessera de fonctionner et {{ name() }} sera déconnecté de tous ses appareils.</p>
          <div class="cluster">
            <button cdlsButton variant="secondary" size="sm" type="button" (click)="askReset(false)">Annuler</button>
            <button cdlsButton variant="danger" size="sm" type="button" [disabled]="busy()" (click)="resetPassword()">
              Confirmer la réinitialisation
            </button>
          </div>
        } @else {
          <p class="t-body-s t-muted">
            Pour un mot de passe oublié : un nouveau mot de passe temporaire est généré, et la personne devra le remplacer à sa prochaine connexion.
          </p>
          <div>
            <button cdlsButton variant="secondary" size="sm" type="button" (click)="askReset(true)">Réinitialiser le mot de passe</button>
          </div>
        }
        @if (resetFailure()) {
          <cdls-alert tone="danger">{{ resetFailure() }}</cdls-alert>
        }
      </section>
      }
    </cdls-modal>
  `,
  styles: `
    .reset {
      margin-top: var(--space-6);
      padding-top: var(--space-6);
      border-top: 1px solid var(--color-line);
    }
    .cluster {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .temp-password {
      font-size: var(--text-body-l);
      font-weight: 600;
      letter-spacing: 0.04em;
      user-select: all;
    }
  `,
})
export class UserEditModal {
  readonly open = model(false);
  readonly user = input<UserDto | null>(null);
  readonly selfId = input<string | null>(null);
  readonly saved = output<UserDto>();

  readonly #api = inject(ApiClient);
  readonly #injector = inject(Injector);
  private readonly resetSection = viewChild.required<ElementRef<HTMLElement>>('resetSection');

  protected readonly name = computed(() => {
    const user = this.user();
    return user ? fullName(user) : '';
  });
  protected readonly isArchived = computed(() => this.user()?.status === 'archived');
  protected readonly graduated = computed(() => {
    const day = this.user()?.graduatedOn;
    return day ? formatDay(day) : '';
  });
  protected readonly isSelf = computed(() => !!this.user() && this.user()?.id === this.selfId());

  protected readonly model = signal<EditUserModel>({ firstName: '', lastName: '', isActive: true });
  protected readonly editForm = form(this.model, (p) => {
    required(p.firstName, { message: 'Saisissez le prénom.' });
    maxLength(p.firstName, 80, { message: 'Le prénom compte 80 caractères au plus.' });
    required(p.lastName, { message: 'Saisissez le nom de famille.' });
    maxLength(p.lastName, 80, { message: 'Le nom compte 80 caractères au plus.' });
    disabled(p.isActive, () => this.isSelf());
  });
  protected readonly firstNameError = computed(() => shownError(this.editForm.firstName()));
  protected readonly lastNameError = computed(() => shownError(this.editForm.lastName()));

  protected readonly busy = signal(false);
  protected readonly saveFailure = signal<string | null>(null);
  protected readonly resetFailure = signal<string | null>(null);
  protected readonly confirmReset = signal(false);
  protected readonly newPassword = signal<string | null>(null);

  constructor() {
    effect(() => {
      const user = this.user();
      if (!this.open() || !user) return;
      untracked(() => {
        this.editForm().reset({ firstName: user.firstName, lastName: user.lastName, isActive: user.status !== 'disabled' });
        this.saveFailure.set(null);
        this.resetFailure.set(null);
        this.confirmReset.set(false);
        this.newPassword.set(null);
      });
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const user = this.user();
    if (!user) return;
    void submit(this.editForm, async () => {
      const value = this.model();
      this.busy.set(true);
      this.saveFailure.set(null);
      try {
        const updated = await this.#api.users.update(user.id, {
          firstName: value.firstName.trim(),
          lastName: value.lastName.trim(),
          ...(this.isSelf() ? {} : { status: value.isActive ? ('active' as const) : ('disabled' as const) }),
        });
        this.saved.emit(updated);
        this.open.set(false);
      } catch (error) {
        this.saveFailure.set(apiMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  protected async restore(): Promise<void> {
    const user = this.user();
    if (!user) return;
    this.busy.set(true);
    this.saveFailure.set(null);
    try {
      const restored = await this.#api.users.update(user.id, { status: 'active' });
      this.saved.emit(restored);
      this.open.set(false);
    } catch (error) {
      this.saveFailure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected askReset(ask: boolean): void {
    this.confirmReset.set(ask);
    this.#focusInReset(ask ? '.btn--danger' : '.btn');
  }

  /** The reset controls replace one another: keep the focus in the section instead of losing it. */
  #focusInReset(selector: string): void {
    afterNextRender(() => this.resetSection().nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.#injector,
    });
  }

  protected async resetPassword(): Promise<void> {
    const user = this.user();
    if (!user) return;
    const password = generatePassword((size) => crypto.getRandomValues(new Uint8Array(size)));
    this.busy.set(true);
    this.resetFailure.set(null);
    try {
      await this.#api.users.update(user.id, { password });
      this.newPassword.set(password);
      this.confirmReset.set(false);
      this.#focusInReset('.btn');
    } catch (error) {
      this.resetFailure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
