import { Component, computed, inject, signal } from '@angular/core';
import { email, form, FormField, minLength, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { SUBJECTS, subjectBySlug } from '@site/content';
import { CLASSES, classLabel, frenchAuthError, progressPercent, SECTION_LABELS, type SectionId } from './student.model';
import { StudentService } from './student.service';

type Mode = 'login' | 'register';

/** `/espace-eleve` — sign in or create an account; once signed in, the student's dashboard. */
@Component({
  selector: 'student-account-page',
  imports: [FormField, RouterLink],
  template: `
    <header class="bg-navy-900 text-cream">
      <div class="on-dark mx-auto grid max-w-6xl gap-2 px-4 py-12">
        <p class="kicker">Collège de la Salle · Daher</p>
        <h1 class="m-0 text-4xl text-white md:text-5xl">Espace élève</h1>
        <p class="m-0 max-w-2xl text-lg text-cream/90">
          Suivez votre progression dans le programme, enregistrez vos exercices et formules préférés,
          et retrouvez-les depuis n’importe quel appareil.
        </p>
      </div>
    </header>

    <div class="mx-auto max-w-5xl px-4 py-12">
      @if (!student.enabled) {
        <p class="m-0 rounded-xl bg-warn-soft p-5 text-warn" role="status" data-testid="unavailable">
          L’espace élève sera disponible prochainement.
        </p>
      } @else if (student.unavailable()) {
        <p class="m-0 rounded-xl bg-warn-soft p-5 text-warn" role="alert" data-testid="unavailable">
          Le service est momentanément indisponible. Réessayez dans quelques instants.
        </p>
      } @else if (!student.ready()) {
        <p class="m-0 text-muted" aria-busy="true">Chargement…</p>
      } @else if (!student.signedIn()) {
        <!-- Sign in / create an account -->
        <div class="mx-auto grid max-w-xl gap-6">
          <div role="tablist" aria-label="Connexion ou inscription" class="grid grid-cols-2 gap-1 rounded-full bg-navy-100 p-1">
            @for (m of modes; track m.id) {
              <button
                type="button"
                role="tab"
                class="tab"
                [attr.aria-selected]="mode() === m.id"
                [attr.data-testid]="'tab-' + m.id"
                (click)="setMode(m.id)"
              >{{ m.label }}</button>
            }
          </div>

          @if (mode() === 'login') {
            <form class="grid gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onLogin($event)" aria-label="Connexion">
              <div class="grid gap-1">
                <label for="login-email" class="font-semibold">Adresse e-mail</label>
                <input id="login-email" type="email" autocomplete="email" [formField]="loginForm.email" [attr.aria-invalid]="attempted() && loginForm.email().invalid()" />
                <p class="err" role="alert">{{ attempted() ? firstError(loginForm.email().errors()) : '' }}</p>
              </div>
              <div class="grid gap-1">
                <label for="login-password" class="font-semibold">Mot de passe</label>
                <input id="login-password" type="password" autocomplete="current-password" [formField]="loginForm.password" [attr.aria-invalid]="attempted() && loginForm.password().invalid()" />
                <p class="err" role="alert">{{ attempted() ? firstError(loginForm.password().errors()) : '' }}</p>
              </div>
              @if (message(); as m) {
                <p class="m-0 rounded-lg px-3 py-2" [class]="m.ok ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'" role="alert" data-testid="form-message">{{ m.text }}</p>
              }
              <div class="flex flex-wrap items-center gap-3">
                <button type="submit" class="btn btn-navy" [disabled]="busy()">{{ busy() ? 'Connexion…' : 'Se connecter' }}</button>
                <button type="button" class="link" (click)="onReset()" [disabled]="busy()">Mot de passe oublié ?</button>
              </div>
            </form>
          } @else {
            <form class="grid gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onRegister($event)" aria-label="Créer un compte">
              <div class="grid gap-1">
                <label for="reg-name" class="font-semibold">Nom et prénom</label>
                <input id="reg-name" type="text" autocomplete="name" [formField]="registerForm.displayName" [attr.aria-invalid]="attempted() && registerForm.displayName().invalid()" />
                <p class="err" role="alert">{{ attempted() ? firstError(registerForm.displayName().errors()) : '' }}</p>
              </div>

              <fieldset class="m-0 grid gap-2 border-0 p-0">
                <legend class="mb-1 p-0 font-semibold">Ma section</legend>
                <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Section">
                  @for (s of sections; track s.id) {
                    <button type="button" role="radio" class="choice" [attr.aria-checked]="registerModel().section === s.id" [attr.data-testid]="'section-' + s.id" (click)="setSection(s.id)">
                      {{ s.label }}
                    </button>
                  }
                </div>
              </fieldset>

              <div class="grid gap-1">
                <label for="reg-class" class="font-semibold">Ma classe</label>
                <select id="reg-class" [formField]="registerForm.classe">
                  @for (c of classOptions(); track c.value) {
                    <option [value]="c.value">{{ c.label }}</option>
                  }
                </select>
              </div>

              <div class="grid gap-1">
                <label for="reg-email" class="font-semibold">Adresse e-mail</label>
                <input id="reg-email" type="email" autocomplete="email" [formField]="registerForm.email" [attr.aria-invalid]="attempted() && registerForm.email().invalid()" />
                <p class="err" role="alert">{{ attempted() ? firstError(registerForm.email().errors()) : '' }}</p>
              </div>
              <div class="grid gap-1">
                <label for="reg-password" class="font-semibold">Mot de passe</label>
                <input id="reg-password" type="password" autocomplete="new-password" aria-describedby="reg-password-hint" [formField]="registerForm.password" [attr.aria-invalid]="attempted() && registerForm.password().invalid()" />
                <p id="reg-password-hint" class="m-0 text-sm text-muted">8 caractères minimum.</p>
                <p class="err" role="alert">{{ attempted() ? firstError(registerForm.password().errors()) : '' }}</p>
              </div>
              @if (message(); as m) {
                <p class="m-0 rounded-lg bg-warn-soft px-3 py-2 text-warn" role="alert" data-testid="form-message">{{ m.text }}</p>
              }
              <div><button type="submit" class="btn btn-navy" [disabled]="busy()">{{ busy() ? 'Création…' : 'Créer mon compte' }}</button></div>
            </form>
          }
        </div>
      } @else if (student.profileState() === 'loading') {
        <p class="m-0 text-muted" aria-busy="true">Chargement de votre espace…</p>
      } @else if (student.profileState() === 'missing') {
        <!-- Signed in, but the profile was never saved (e.g. the browser closed during sign-up) -->
        <form class="mx-auto grid max-w-xl gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onCompleteProfile($event)" aria-label="Compléter mon profil">
          <h2 class="m-0 text-2xl">Compléter mon profil</h2>
          <div class="grid gap-1">
            <label for="prof-name" class="font-semibold">Nom et prénom</label>
            <input id="prof-name" type="text" autocomplete="name" [formField]="profileForm.displayName" />
            <p class="err" role="alert">{{ attempted() ? firstError(profileForm.displayName().errors()) : '' }}</p>
          </div>
          <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Section">
            @for (s of sections; track s.id) {
              <button type="button" role="radio" class="choice" [attr.aria-checked]="profileModel().section === s.id" (click)="setProfileSection(s.id)">{{ s.label }}</button>
            }
          </div>
          <div class="grid gap-1">
            <label for="prof-class" class="font-semibold">Ma classe</label>
            <select id="prof-class" [formField]="profileForm.classe">
              @for (c of profileClassOptions(); track c.value) {
                <option [value]="c.value">{{ c.label }}</option>
              }
            </select>
          </div>
          @if (message(); as m) {
            <p class="m-0 rounded-lg bg-warn-soft px-3 py-2 text-warn" role="alert">{{ m.text }}</p>
          }
          <div><button type="submit" class="btn btn-navy" [disabled]="busy()">Enregistrer</button></div>
        </form>
      } @else if (student.profile(); as p) {
        <!-- Dashboard -->
        <div class="grid gap-10" data-testid="dashboard">
          <section class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-6" aria-labelledby="hello">
            <div>
              <h2 id="hello" class="m-0 text-2xl" data-testid="hello">Bonjour {{ student.firstName() }}</h2>
              <p class="m-0 mt-1 flex flex-wrap gap-2 text-sm">
                <span class="rounded-full bg-navy-100 px-3 py-1 font-semibold text-navy-700" data-testid="chip-section">{{ sectionLabel(p.section) }}</span>
                <span class="rounded-full bg-navy-100 px-3 py-1 font-semibold text-navy-700" data-testid="chip-class">{{ classText(p.section, p.classe) }}</span>
              </p>
              @if (student.user(); as u) {
                <p class="m-0 mt-2 text-sm text-muted"><bdi>{{ u.email }}</bdi>@if (!u.emailVerified) { · e-mail non vérifié (consultez votre boîte de réception) }</p>
              }
            </div>
            <div class="flex flex-wrap gap-3">
              <a class="btn btn-outline-dark" [routerLink]="p.section === 'bac' ? '/bac' : '/section-nationale'">Ma section</a>
              <button type="button" class="btn btn-outline-dark" (click)="onLogout()" data-testid="logout">Se déconnecter</button>
            </div>
          </section>

          <section aria-labelledby="progress-title" class="grid gap-4">
            <h2 id="progress-title" class="m-0 text-2xl">Ma progression</h2>
            <p class="m-0 text-muted">Cochez « J’ai révisé ce chapitre » sur la page d’une matière : vos barres se remplissent ici.</p>
            <ul class="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
              @for (s of subjectProgress(); track s.slug) {
                <li class="rounded-2xl border border-line bg-surface p-5">
                  <a [routerLink]="['/matiere', s.slug]" class="text-lg font-bold no-underline" [attr.lang]="s.lang">{{ s.title }}</a>
                  <p class="m-0 mt-1 text-sm text-muted">{{ s.done }} chapitre{{ s.done > 1 ? 's' : '' }} révisé{{ s.done > 1 ? 's' : '' }} sur {{ s.total }}</p>
                  <div class="mt-3 h-3 overflow-hidden rounded-full bg-navy-100" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="s.percent" [attr.aria-label]="'Progression en ' + s.title">
                    <div class="h-full rounded-full bg-gold" [style.inline-size.%]="s.percent"></div>
                  </div>
                  <p class="m-0 mt-2 text-sm font-semibold" [attr.data-testid]="'progress-' + s.slug">{{ s.percent }} %</p>
                </li>
              }
            </ul>
          </section>

          <section aria-labelledby="fav-title" class="grid gap-4">
            <h2 id="fav-title" class="m-0 text-2xl">Mes favoris</h2>
            @if (favourites().length) {
              <ul class="m-0 grid list-none gap-3 p-0" data-testid="favourites">
                @for (f of favourites(); track f.id) {
                  <li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                    <div [attr.lang]="f.lang">
                      <p class="m-0 font-semibold">{{ f.label }}</p>
                      <p class="m-0 text-sm text-muted">{{ f.kind }} · {{ f.subject }}</p>
                    </div>
                    <div class="flex gap-2">
                      <a class="btn btn-outline-dark" [routerLink]="['/matiere', f.slug]" [fragment]="f.fragment">Ouvrir</a>
                      <button type="button" class="btn btn-outline-dark" (click)="removeFavourite(f.id)" [attr.aria-label]="'Retirer ' + f.label + ' des favoris'">Retirer</button>
                    </div>
                  </li>
                }
              </ul>
            } @else {
              <p class="m-0 text-muted">Aucun favori pour l’instant. Utilisez « ☆ Enregistrer » sur un exercice ou une formule.</p>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .tab { padding: 0.55rem 1rem; border-radius: 999px; border: 0; background: transparent; font: inherit; font-weight: 600; color: var(--navy-700); cursor: pointer; }
    .tab[aria-selected='true'] { background: var(--navy-900); color: var(--cream); }
    .choice { padding: 0.65rem 0.8rem; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); font: inherit; font-weight: 600; color: var(--navy-900); cursor: pointer; }
    .choice[aria-checked='true'] { border-color: var(--navy-700); background: var(--navy-100); box-shadow: inset 0 0 0 1px var(--navy-700); }
    input, select { font: inherit; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: #fff; color: inherit; max-inline-size: 100%; }
    input[aria-invalid='true'] { border-color: #a12a1f; }
    .err { margin: 0; min-block-size: 1.3em; color: #a12a1f; font-size: 0.9rem; }
    .btn-navy { background: var(--navy-900); color: var(--cream); cursor: pointer; font: inherit; font-weight: 600; }
    .btn-navy:hover:not(:disabled) { background: var(--navy-700); }
    .btn-navy:disabled { opacity: 0.6; cursor: wait; }
    .btn-outline-dark { border-color: var(--navy-700); color: var(--navy-700); background: transparent; cursor: pointer; font: inherit; font-weight: 600; }
    .btn-outline-dark:hover { background: var(--navy-100); }
    .link { background: none; border: 0; padding: 0; font: inherit; color: var(--navy-700); text-decoration: underline; cursor: pointer; }
  `,
})
export class AccountPage {
  protected readonly student = inject(StudentService);

  protected readonly modes: readonly { readonly id: Mode; readonly label: string }[] = [
    { id: 'login', label: 'Connexion' },
    { id: 'register', label: 'Créer un compte' },
  ];
  protected readonly sections = (['nationale', 'bac'] as const).map((id) => ({ id, label: SECTION_LABELS[id] }));

  protected readonly mode = signal<Mode>('login');
  protected readonly busy = signal(false);
  protected readonly attempted = signal(false);
  protected readonly message = signal<{ readonly ok: boolean; readonly text: string } | null>(null);

  /* ---------------------------------------------------------------- forms */
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

  protected readonly profileModel = signal({ displayName: '', section: 'nationale' as SectionId, classe: CLASSES.nationale[0]!.value });
  protected readonly profileForm = form(this.profileModel, (p) => {
    required(p.displayName, { message: 'Saisissez votre nom et prénom.' });
  });
  protected readonly profileClassOptions = computed(() => CLASSES[this.profileModel().section]);

  /* ---------------------------------------------------------------- dashboard data */
  protected readonly subjectProgress = computed(() => {
    const progress = this.student.profile()?.progress ?? {};
    return SUBJECTS.map((s) => {
      const ids = s.chapters.map((c) => c.id);
      const done = (progress[s.slug] ?? []).filter((id) => ids.includes(id)).length;
      return { slug: s.slug, title: s.title, lang: s.lang, done, total: ids.length, percent: progressPercent(progress[s.slug], ids) };
    });
  });

  protected readonly favourites = computed(() =>
    (this.student.profile()?.favourites ?? []).flatMap((id) => {
      const [slug = '', kind = '', index = ''] = id.split(':');
      const subject = subjectBySlug(slug);
      const n = Number(index);
      if (!subject || !Number.isInteger(n)) return [];
      if (kind === 'ex' && subject.examples[n]) {
        return [{ id, slug, lang: subject.lang, label: subject.examples[n].title, kind: 'Exercice corrigé', subject: subject.navLabel, fragment: 'exercices' }];
      }
      if (kind === 'fo' && subject.formulas[n]) {
        return [{ id, slug, lang: subject.lang, label: subject.formulas[n].label, kind: 'Formule', subject: subject.navLabel, fragment: 'formules' }];
      }
      return [];
    }),
  );

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.message.set(null);
    this.attempted.set(false);
  }

  protected setSection(section: SectionId): void {
    this.registerModel.update((m) => ({ ...m, section, classe: CLASSES[section][0]!.value }));
  }

  protected setProfileSection(section: SectionId): void {
    this.profileModel.update((m) => ({ ...m, section, classe: CLASSES[section][0]!.value }));
  }

  protected sectionLabel(section: SectionId): string {
    return SECTION_LABELS[section];
  }

  protected classText(section: SectionId, value: string): string {
    return classLabel(section, value);
  }

  protected firstError(errors: readonly { readonly message?: string }[]): string {
    return errors[0]?.message ?? '';
  }

  /* ---------------------------------------------------------------- actions */
  protected async onLogin(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.loginForm().invalid()) return;
    await this.#run(async () => {
      const { email: address, password } = this.loginModel();
      await this.student.login(address, password);
      this.loginModel.set({ email: '', password: '' });
    });
  }

  protected async onRegister(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.registerForm().invalid()) return;
    await this.#run(async () => {
      const m = this.registerModel();
      await this.student.register(m.email, m.password, { displayName: m.displayName, section: m.section, classe: m.classe });
    });
  }

  protected async onCompleteProfile(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.profileForm().invalid()) return;
    await this.#run(() => this.student.saveProfile(this.profileModel()));
  }

  protected async onReset(): Promise<void> {
    this.attempted.set(true);
    if (this.loginForm.email().invalid()) return;
    await this.#run(async () => {
      await this.student.resetPassword(this.loginModel().email);
      this.message.set({ ok: true, text: 'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.' });
    }, false);
  }

  protected async onLogout(): Promise<void> {
    await this.student.logout();
  }

  protected async removeFavourite(id: string): Promise<void> {
    await this.student.toggleFavourite(id).catch(() => undefined);
  }

  async #run(action: () => Promise<void>, clear = true): Promise<void> {
    this.busy.set(true);
    if (clear) this.message.set(null);
    try {
      await action();
      this.attempted.set(false);
    } catch (error) {
      this.message.set({ ok: false, text: frenchAuthError(error) });
    } finally {
      this.busy.set(false);
    }
  }
}
