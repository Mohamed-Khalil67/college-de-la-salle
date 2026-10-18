import { Component, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, minLength, required } from '@angular/forms/signals';
import { CLASSES, frenchError, SECTION_LABELS, type SectionId } from '../space.model';
import { SpaceService } from '../space.service';
import { SPACE_STYLES } from '../space-styles';

type Mode = 'login' | 'register';

/**
 * Sign in / create an account, for students (name, section, class) and teachers (name only: the school
 * must also list their e-mail before they can publish).
 */
@Component({
  selector: 'space-auth-panel',
  imports: [FormField],
  template: `
    <div class="mx-auto grid max-w-xl gap-6">
      <div role="tablist" aria-label="Connexion ou inscription" class="grid grid-cols-2 gap-1 rounded-full bg-navy-100 p-1">
        @for (m of modes; track m.id) {
          <button type="button" role="tab" class="tab" [attr.aria-selected]="mode() === m.id" [attr.data-testid]="'tab-' + m.id" (click)="setMode(m.id)">{{ m.label }}</button>
        }
      </div>

      @if (mode() === 'login') {
        <form class="grid gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onLogin($event)" aria-label="Connexion">
          <div class="grid gap-1">
            <label [for]="id + 'login-email'" class="font-semibold">Adresse e-mail</label>
            <input [id]="id + 'login-email'" type="email" autocomplete="email" [formField]="loginForm.email" [attr.aria-invalid]="attempted() && loginForm.email().invalid()" />
            <p class="err" role="alert">{{ attempted() ? firstError(loginForm.email().errors()) : '' }}</p>
          </div>
          <div class="grid gap-1">
            <label [for]="id + 'login-password'" class="font-semibold">Mot de passe</label>
            <input [id]="id + 'login-password'" type="password" autocomplete="current-password" [formField]="loginForm.password" [attr.aria-invalid]="attempted() && loginForm.password().invalid()" />
            <p class="err" role="alert">{{ attempted() ? firstError(loginForm.password().errors()) : '' }}</p>
          </div>
          @if (message(); as m) {
            <p class="m-0 rounded-lg px-3 py-2" [class]="m.ok ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'" role="alert" data-testid="form-message">{{ m.text }}</p>
          }
          <div class="flex flex-wrap items-center gap-3">
            <button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="login-submit">{{ busy() ? 'Connexion…' : 'Se connecter' }}</button>
            <button type="button" class="link" (click)="onReset()" [disabled]="busy()">Mot de passe oublié ?</button>
          </div>
        </form>
      } @else {
        <form class="grid gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onRegister($event)" aria-label="Créer un compte">
          <div class="grid gap-1">
            <label [for]="id + 'reg-name'" class="font-semibold">Nom et prénom</label>
            <input [id]="id + 'reg-name'" type="text" autocomplete="name" [formField]="registerForm.displayName" [attr.aria-invalid]="attempted() && registerForm.displayName().invalid()" />
            <p class="err" role="alert">{{ attempted() ? firstError(registerForm.displayName().errors()) : '' }}</p>
          </div>

          @if (kind() === 'student') {
            <fieldset class="m-0 grid gap-2 border-0 p-0">
              <legend class="mb-1 p-0 font-semibold">Ma section</legend>
              <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Section">
                @for (s of sections; track s.id) {
                  <button type="button" role="radio" class="choice" [attr.aria-checked]="registerModel().section === s.id" [attr.data-testid]="'section-' + s.id" (click)="setSection(s.id)">{{ s.label }}</button>
                }
              </div>
            </fieldset>
            <div class="grid gap-1">
              <label [for]="id + 'reg-class'" class="font-semibold">Ma classe</label>
              <select [id]="id + 'reg-class'" [formField]="registerForm.classe">
                @for (c of classOptions(); track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </div>
          }

          <div class="grid gap-1">
            <label [for]="id + 'reg-email'" class="font-semibold">Adresse e-mail</label>
            <input [id]="id + 'reg-email'" type="email" autocomplete="email" [formField]="registerForm.email" [attr.aria-invalid]="attempted() && registerForm.email().invalid()" />
            <p class="err" role="alert">{{ attempted() ? firstError(registerForm.email().errors()) : '' }}</p>
          </div>
          <div class="grid gap-1">
            <label [for]="id + 'reg-password'" class="font-semibold">Mot de passe</label>
            <input [id]="id + 'reg-password'" type="password" autocomplete="new-password" [attr.aria-describedby]="id + 'reg-password-hint'" [formField]="registerForm.password" [attr.aria-invalid]="attempted() && registerForm.password().invalid()" />
            <p [id]="id + 'reg-password-hint'" class="m-0 text-sm text-muted">8 caractères minimum.</p>
            <p class="err" role="alert">{{ attempted() ? firstError(registerForm.password().errors()) : '' }}</p>
          </div>
          @if (kind() === 'teacher') {
            <p class="m-0 text-sm text-muted">
              Utilisez l’adresse e-mail communiquée à l’administration du collège : l’accès enseignant est activé par l’établissement.
            </p>
          }
          @if (message(); as m) {
            <p class="m-0 rounded-lg bg-warn-soft px-3 py-2 text-warn" role="alert" data-testid="form-message">{{ m.text }}</p>
          }
          <div><button type="submit" class="btn btn-navy" [disabled]="busy()">{{ busy() ? 'Création…' : 'Créer mon compte' }}</button></div>
        </form>
      }
    </div>
  `,
  styles: SPACE_STYLES,
})
export class AuthPanel {
  readonly kind = input.required<'student' | 'teacher'>();

  readonly #space = inject(SpaceService);
  protected readonly id = `auth-${Math.random().toString(36).slice(2, 7)}-`;
  protected readonly modes: readonly { readonly id: Mode; readonly label: string }[] = [
    { id: 'login', label: 'Connexion' },
    { id: 'register', label: 'Créer un compte' },
  ];
  protected readonly sections = (['nationale', 'bac'] as const).map((id) => ({ id, label: SECTION_LABELS[id] }));

  protected readonly mode = signal<Mode>('login');
  protected readonly busy = signal(false);
  protected readonly attempted = signal(false);
  protected readonly message = signal<{ readonly ok: boolean; readonly text: string } | null>(null);

  protected readonly loginModel = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.loginModel, (p) => {
    required(p.email, { message: 'Saisissez votre adresse e-mail.' });
    email(p.email, { message: 'Adresse e-mail invalide.' });
    required(p.password, { message: 'Saisissez votre mot de passe.' });
  });

  protected readonly registerModel = signal({
    displayName: '',
    section: 'nationale' as SectionId,
    classe: CLASSES.nationale[0]!.value,
    email: '',
    password: '',
  });
  protected readonly registerForm = form(this.registerModel, (p) => {
    required(p.displayName, { message: 'Saisissez votre nom et prénom.' });
    required(p.email, { message: 'Saisissez votre adresse e-mail.' });
    email(p.email, { message: 'Adresse e-mail invalide.' });
    required(p.password, { message: 'Choisissez un mot de passe.' });
    minLength(p.password, 8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' });
  });
  protected readonly classOptions = computed(() => CLASSES[this.registerModel().section]);

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.message.set(null);
    this.attempted.set(false);
  }

  protected setSection(section: SectionId): void {
    this.registerModel.update((m) => ({ ...m, section, classe: CLASSES[section][0]!.value }));
  }

  protected firstError(errors: readonly { readonly message?: string }[]): string {
    return errors[0]?.message ?? '';
  }

  protected async onLogin(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.loginForm().invalid()) return;
    await this.#run(async () => {
      const { email: address, password } = this.loginModel();
      await this.#space.login(address, password);
      this.loginModel.set({ email: '', password: '' });
    });
  }

  protected async onRegister(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.registerForm().invalid()) return;
    await this.#run(async () => {
      const m = this.registerModel();
      if (this.kind() === 'teacher') await this.#space.registerTeacher(m.email, m.password, m.displayName);
      else await this.#space.registerStudent(m.email, m.password, { displayName: m.displayName, section: m.section, classe: m.classe });
    });
  }

  protected async onReset(): Promise<void> {
    this.attempted.set(true);
    if (this.loginForm.email().invalid()) return;
    await this.#run(async () => {
      await this.#space.resetPassword(this.loginModel().email);
      this.message.set({ ok: true, text: 'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.' });
    }, false);
  }

  async #run(action: () => Promise<void>, clear = true): Promise<void> {
    this.busy.set(true);
    if (clear) this.message.set(null);
    try {
      await action();
      this.attempted.set(false);
    } catch (error) {
      this.message.set({ ok: false, text: frenchError(error) });
    } finally {
      this.busy.set(false);
    }
  }
}
