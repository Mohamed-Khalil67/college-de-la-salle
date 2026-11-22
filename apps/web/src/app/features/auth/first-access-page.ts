import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SECTION_LABELS } from '../../core/school/school-profile';
import { AuthStore, HOME_BY_ROLE } from '../../core/auth/auth-store';
import { SITE } from '../../school';
import { Button, SkipLink, Wordmark } from '../../shared/ui';
import { PasswordForm } from '../../shared/components/password-form';

/**
 * « Premier accès »: the first sign-in with the temporary password from the secretariat. Step 1 chooses
 * a password; step 2 (students) confirms the section and class the school registered. Teachers and the
 * administration go straight to their space after step 1.
 */
@Component({
  selector: 'app-first-access-page',
  imports: [Button, PasswordForm, SkipLink, Wordmark],
  template: `
    <a cdlsSkipLink>Aller au contenu</a>
    <div class="auth">
      <aside class="auth__visual on-inverse" aria-label="Le collège" [style.background-image]="backdrop">
                <cdls-wordmark tone="dark" />
        @if (motto; as m) {
          <blockquote class="stack stack--sm">
            <p class="t-quote">{{ m.text }}</p>
            <p class="t-body-s">{{ m.meaningFr }}</p>
          </blockquote>
        }
      </aside>

      <main id="contenu" class="auth__form" tabindex="-1">
        <div class="auth__panel">
          @if (step() === 'password') {
            <div class="stack stack--sm">
              <h1 class="t-h1" #heading tabindex="-1">Bienvenue, {{ firstName() }}</h1>
              <p class="t-muted">
                @if (isStudent()) {
                  Première connexion, étape 1 sur 2 : choisissez votre mot de passe.
                } @else {
                  Première connexion : choisissez votre mot de passe.
                }
              </p>
              <p>Le mot de passe temporaire remis par le secrétariat ne servira qu’une fois. Saisissez-le ci-dessous, puis choisissez le vôtre.</p>
            </div>
            <app-password-form
              currentLabel="Mot de passe temporaire"
              currentHelper="Celui que le secrétariat vous a remis."
              submitLabel="Choisir ce mot de passe"
              (changed)="onPasswordChanged()"
            />
          } @else {
            <div class="stack stack--sm">
              <h1 class="t-h1" #heading tabindex="-1">Votre section et votre classe</h1>
              <p class="t-muted">Première connexion, étape 2 sur 2 : vérifiez ce que le collège a enregistré.</p>
            </div>
            <dl class="registered">
              <div>
                <dt class="t-muted">Section</dt>
                <dd class="t-h3">{{ sectionLabel() }}</dd>
              </div>
              <div>
                <dt class="t-muted">Classe</dt>
                <dd class="t-h3">{{ classLabel() }}</dd>
              </div>
            </dl>
            <p class="t-body-s">
              Une erreur ? Ouvrez votre espace, puis « Ma section » dans le menu de votre compte : vous pourrez demander un
              changement de section à l’administration. Pour une autre classe, contactez le secrétariat.
            </p>
            <div>
              <button cdlsButton type="button" (click)="finish()">Oui, c’est correct : ouvrir mon espace</button>
            </div>
          }
        </div>
      </main>
    </div>
  `,
  styles: `
    .registered {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: var(--color-subtle);
    }
    [tabindex='-1']:focus {
      outline: none;
    }
  `,
})
export class FirstAccessPage {
  /** Decorative, full-height panel: the photo is its background (an <img> cropped by CSS is flagged by Angular). */
  protected readonly backdrop = `url("${SITE.authImage.src}")`;
  protected readonly motto = SITE.motto;
  readonly #auth = inject(AuthStore);
  readonly #router = inject(Router);
  readonly #injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly step = signal<'password' | 'confirm'>('password');
  protected readonly firstName = computed(() => this.#auth.user()?.firstName ?? '');
  protected readonly isStudent = computed(() => this.#auth.role() === 'student');
  protected readonly sectionLabel = computed(() => {
    const code = this.#auth.user()?.sectionCode;
    return code ? SECTION_LABELS[code] : 'Non renseignée';
  });
  protected readonly classLabel = computed(() => this.#auth.user()?.classLabel ?? 'Non renseignée');

  protected onPasswordChanged(): void {
    if (!this.isStudent()) {
      void this.finish();
      return;
    }
    this.step.set('confirm');
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.#injector });
  }

  protected async finish(): Promise<void> {
    const role = this.#auth.role();
    await this.#router.navigateByUrl(role ? HOME_BY_ROLE[role] : '/connexion');
  }
}
