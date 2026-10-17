import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MATIERES, matiereName } from '@site/content';
import {
  CLASSES,
  FORMAT_MARK,
  frenchError,
  isCalendarDay,
  isHttpsUrl,
  LIMITS,
  parseNumber,
  POST_TYPES,
  SECTION_LABELS,
  TARGET_OPTIONS,
  todayIso,
  type PostType,
} from './space.model';
import { SpaceService } from './space.service';
import { AuthPanel } from './ui/auth-panel';
import { Calendar } from './ui/calendar';
import { PostCard } from './ui/post-card';
import { SPACE_STYLES } from './ui/space.styles';

type Tab = 'publish' | 'mine' | 'calendar' | 'grades';

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * `/espace-enseignant`: sign in, then publish announcements, homework and resources to a class or a
 * section, and enter grades. Only e-mails listed by the school (teachers/{email}) can do this.
 */
@Component({
  selector: 'space-teacher-page',
  imports: [FormField, AuthPanel, Calendar, PostCard],
  template: `
    <header class="bg-navy-900 text-cream">
      <div class="on-dark mx-auto grid max-w-6xl gap-2 px-4 py-12">
        <p class="kicker">Collège de la Salle · Daher</p>
        <h1 class="m-0 text-4xl text-white md:text-5xl">Espace enseignant</h1>
        <p class="m-0 max-w-2xl text-lg text-cream/90">
          Publiez des annonces, des devoirs et des ressources pour une classe ou une section, et saisissez les notes de vos élèves.
        </p>
      </div>
    </header>

    <div class="mx-auto max-w-5xl px-4 py-12">
      @if (!space.enabled) {
        <p class="m-0 rounded-xl bg-warn-soft p-5 text-warn" role="status" data-testid="unavailable">L’espace enseignant sera disponible prochainement.</p>
      } @else if (space.unavailable()) {
        <p class="m-0 rounded-xl bg-warn-soft p-5 text-warn" role="alert" data-testid="unavailable">Le service est momentanément indisponible. Réessayez dans quelques instants.</p>
      } @else if (!space.ready()) {
        <p class="m-0 text-muted" aria-busy="true">Chargement…</p>
      } @else if (!space.signedIn()) {
        <space-auth-panel kind="teacher" />
      } @else if (space.role() === 'loading') {
        <p class="m-0 text-muted" aria-busy="true">Chargement de votre espace…</p>
      } @else if (space.role() === 'teacher-unverified') {
        <div class="mx-auto grid max-w-xl gap-4 rounded-2xl border border-line bg-surface p-6" data-testid="unverified">
          <h2 class="m-0 text-2xl">Vérifiez votre adresse e-mail</h2>
          <p class="m-0">
            Votre compte est autorisé comme enseignant, mais l’adresse <bdi>{{ space.user()?.email }}</bdi> n’est pas encore vérifiée.
            Ouvrez le lien reçu par e-mail, puis actualisez.
          </p>
          @if (message(); as m) {
            <p class="m-0 rounded-lg bg-ok-soft px-3 py-2 text-ok" role="status">{{ m }}</p>
          }
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn btn-navy" (click)="onRefresh()" [disabled]="busy()" data-testid="refresh">J’ai vérifié mon e-mail</button>
            <button type="button" class="btn btn-outline-dark" (click)="onResend()" [disabled]="busy()">Renvoyer l’e-mail</button>
            <button type="button" class="btn btn-outline-dark" (click)="onLogout()">Se déconnecter</button>
          </div>
        </div>
      } @else if (space.role() !== 'teacher') {
        <div class="mx-auto grid max-w-xl gap-4 rounded-2xl border border-line bg-surface p-6" data-testid="not-authorised">
          <h2 class="m-0 text-2xl">Accès non autorisé</h2>
          <p class="m-0">
            L’adresse <bdi>{{ space.user()?.email }}</bdi> n’est pas enregistrée comme enseignant. Demandez à l’administration du collège
            d’activer votre accès, puis reconnectez-vous.
          </p>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn btn-navy" (click)="onRefresh()" [disabled]="busy()">Réessayer</button>
            <button type="button" class="btn btn-outline-dark" (click)="onLogout()">Se déconnecter</button>
          </div>
        </div>
      } @else {
        <div class="grid gap-8" data-testid="teacher-dashboard">
          <section class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-6" aria-labelledby="hello">
            <div>
              <h2 id="hello" class="m-0 text-2xl" data-testid="hello">Bonjour {{ space.firstName() }}</h2>
              <p class="m-0 mt-1 text-sm text-muted"><bdi>{{ space.user()?.email }}</bdi> · enseignant</p>
            </div>
            <button type="button" class="btn btn-outline-dark" (click)="onLogout()" data-testid="logout">Se déconnecter</button>
          </section>

          <div class="grid gap-6">
            <div role="tablist" aria-label="Espace enseignant" class="flex flex-wrap gap-1 rounded-full bg-navy-100 p-1">
              @for (t of tabs; track t.id) {
                <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === t.id" [attr.aria-controls]="'panel-' + t.id" [id]="'tab-' + t.id" [attr.data-testid]="'tab-' + t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
              }
            </div>

            <section role="tabpanel" [id]="'panel-' + tab()" [attr.aria-labelledby]="'tab-' + tab()" class="grid gap-4" tabindex="0">
              @switch (tab()) {
                @case ('publish') {
                  <form class="grid gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onPublish($event)" aria-label="Publier">
                    <fieldset class="m-0 grid gap-2 border-0 p-0">
                      <legend class="mb-1 p-0 font-semibold">Type de publication</legend>
                      <div class="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Type">
                        @for (t of postTypes; track t.id) {
                          <button type="button" role="radio" class="choice" [attr.aria-checked]="postModel().type === t.id" [attr.data-testid]="'type-' + t.id" (click)="setType(t.id)">{{ t.label }}</button>
                        }
                      </div>
                    </fieldset>
                    <div class="grid gap-1">
                      <label for="post-title" class="font-semibold">Titre</label>
                      <input id="post-title" type="text" [formField]="postForm.title" [attr.aria-invalid]="attempted() && postForm.title().invalid()" />
                      <p class="err" role="alert">{{ attempted() ? (postForm.title().errors()[0]?.message ?? '') : '' }}</p>
                    </div>
                    <div class="grid gap-1">
                      <label for="post-body" class="font-semibold">Message</label>
                      <textarea id="post-body" [formField]="postForm.body"></textarea>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="grid gap-1">
                        <label for="post-subject" class="font-semibold">Matière</label>
                        <select id="post-subject" [formField]="postForm.subject" data-testid="post-subject-select">
                          <option value="">— Aucune —</option>
                          @for (m of matieres; track m.id) {
                            <option [value]="m.id">{{ m.name }}</option>
                          }
                        </select>
                      </div>
                      <div class="grid gap-1">
                        <label for="post-target" class="font-semibold">Destinataires</label>
                        <select id="post-target" [formField]="postForm.target" data-testid="post-target-select">
                          @for (t of targets; track t.value) {
                            <option [value]="t.value">{{ t.label }}</option>
                          }
                        </select>
                      </div>
                    </div>
                    @if (postModel().type === 'assignment') {
                      <div class="grid gap-1">
                        <label for="post-due" class="font-semibold">À rendre pour le</label>
                        <input id="post-due" type="date" [formField]="postForm.dueDate" />
                      </div>
                    }
                    @if (postModel().type === 'resource') {
                      <div class="grid gap-1">
                        <label for="post-url" class="font-semibold">Lien (https)</label>
                        <input id="post-url" type="url" placeholder="https://" [formField]="postForm.url" />
                      </div>
                    }
                    @if (message(); as m) {
                      <p class="m-0 rounded-lg px-3 py-2" [class]="ok() ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'" role="alert" data-testid="form-message">{{ m }}</p>
                    }
                    <div><button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="publish">{{ busy() ? 'Publication…' : 'Publier' }}</button></div>
                  </form>
                }
                @case ('mine') {
                  @if (myPosts().length) {
                    <ul class="m-0 grid list-none gap-3 p-0" data-testid="my-posts">
                      @for (p of myPosts(); track p.id) {
                        <li>
                          <space-post-card [post]="p" [today]="today">
                            <button type="button" class="btn btn-outline-dark justify-self-start" (click)="onDeletePost(p.id)" [attr.aria-label]="'Supprimer ' + p.title" data-testid="delete-post">Supprimer</button>
                          </space-post-card>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="m-0 text-muted" data-testid="empty">Vous n’avez encore rien publié.</p>
                  }
                }
                @case ('calendar') {
                  <p class="m-0 text-muted">
                    Le calendrier de l’école est commun : tous les enseignants peuvent l’ajouter, le corriger ou le supprimer.
                    Les élèves y voient, sans pouvoir le modifier, ce qui concerne leur classe.
                  </p>
                  <space-calendar [events]="space.events()" [editable]="true" />
                }
                @case ('grades') {
                  <div class="grid gap-4">
                    <div class="grid gap-1">
                      <label for="grade-class" class="font-semibold">Classe</label>
                      <select id="grade-class" data-testid="grade-class" (change)="onPickClass($any($event.target).value)">
                        <option value="">— Choisir une classe —</option>
                        @for (c of classTargets; track c.value) {
                          <option [value]="c.value" [selected]="pickedClass() === c.value">{{ c.label }}</option>
                        }
                      </select>
                    </div>

                    @if (pickedClass()) {
                      @if (classStudents().length) {
                        <ul class="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="students" aria-label="Élèves de la classe">
                          @for (s of classStudents(); track s.uid) {
                            <li>
                              <button type="button" class="choice" [attr.aria-pressed]="pickedStudent() === s.uid" (click)="pickedStudent.set(s.uid)" data-testid="student-button">{{ s.displayName }}</button>
                            </li>
                          }
                        </ul>
                      } @else {
                        <p class="m-0 text-muted" data-testid="empty">Aucun élève inscrit dans cette classe pour l’instant.</p>
                      }
                    }

                    @if (student(); as s) {
                      <form class="grid gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onAddGrade($event)" [attr.aria-label]="'Nouvelle note pour ' + s.displayName">
                        <h3 class="m-0 text-xl" dir="auto">Nouvelle note — {{ s.displayName }}</h3>
                        <div class="grid gap-4 sm:grid-cols-2">
                          <div class="grid gap-1">
                            <label for="grade-subject" class="font-semibold">Matière</label>
                            <select id="grade-subject" [formField]="gradeForm.subject" data-testid="grade-subject">
                              <option value="">— Choisir —</option>
                              @for (m of matieres; track m.id) {
                                <option [value]="m.id">{{ m.name }}</option>
                              }
                            </select>
                            <p class="err" role="alert">{{ gradeAttempted() ? (gradeForm.subject().errors()[0]?.message ?? '') : '' }}</p>
                          </div>
                          <div class="grid gap-1">
                            <label for="grade-title" class="font-semibold">Intitulé (devoir, contrôle…)</label>
                            <input id="grade-title" type="text" [formField]="gradeForm.title" />
                            <p class="err" role="alert">{{ gradeAttempted() ? (gradeForm.title().errors()[0]?.message ?? '') : '' }}</p>
                          </div>
                          <div class="grid gap-1">
                            <label for="grade-score" class="font-semibold">Note</label>
                            <input id="grade-score" type="text" inputmode="decimal" [formField]="gradeForm.score" />
                          </div>
                          <div class="grid gap-1">
                            <label for="grade-out-of" class="font-semibold">Sur</label>
                            <input id="grade-out-of" type="text" inputmode="decimal" [formField]="gradeForm.outOf" />
                          </div>
                        </div>
                        <div class="grid gap-1">
                          <label for="grade-comment" class="font-semibold">Commentaire (facultatif)</label>
                          <textarea id="grade-comment" [formField]="gradeForm.comment"></textarea>
                        </div>
                        @if (message(); as m) {
                          <p class="m-0 rounded-lg px-3 py-2" [class]="ok() ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'" role="alert" data-testid="form-message">{{ m }}</p>
                        }
                        <div><button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="add-grade">Enregistrer la note</button></div>
                      </form>

                      @if (studentGrades().length) {
                        <ul class="m-0 grid list-none gap-2 p-0" data-testid="given-grades">
                          @for (g of studentGrades(); track g.id) {
                            <li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3" data-testid="given-grade">
                              <span><strong>{{ subjectName(g.subject) }}</strong> · <span dir="auto">{{ g.title }}</span> · {{ mark(g.score) }} / {{ mark(g.outOf) }} <span class="text-sm text-muted">· {{ day(g.createdAt) }}</span></span>
                              <button type="button" class="link" (click)="onDeleteGrade(g.id)" [attr.aria-label]="'Supprimer la note ' + g.title">Supprimer</button>
                            </li>
                          }
                        </ul>
                      }
                    }
                  </div>
                }
              }
            </section>
          </div>
        </div>
      }
    </div>
  `,
  styles: SPACE_STYLES + `:host { min-block-size: 100dvh; }`,
})
export class TeacherPage {
  protected readonly space = inject(SpaceService);

  protected readonly today = todayIso();
  protected readonly tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'publish', label: 'Publier' },
    { id: 'mine', label: 'Mes publications' },
    { id: 'calendar', label: 'Calendrier' },
    { id: 'grades', label: 'Notes' },
  ];
  protected readonly postTypes = POST_TYPES;
  protected readonly matieres = MATIERES;
  protected readonly targets = TARGET_OPTIONS;
  /** Only whole classes can be picked for grading. */
  protected readonly classTargets = (['nationale', 'bac'] as const).flatMap((section) =>
    CLASSES[section].map((c) => ({ value: `${section}:${c.value}`, label: `${SECTION_LABELS[section]} — ${c.label}` })),
  );

  protected readonly tab = signal<Tab>('publish');
  protected readonly busy = signal(false);
  protected readonly ok = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly attempted = signal(false);
  protected readonly gradeAttempted = signal(false);

  /* ---------------------------------------------------------------- publish */
  protected readonly postModel = signal({
    type: 'announcement' as PostType,
    title: '',
    body: '',
    subject: '',
    target: 'all',
    dueDate: '',
    url: '',
  });
  protected readonly postForm = form(this.postModel, (p) => {
    required(p.title, { message: 'Saisissez un titre.' });
    maxLength(p.title, LIMITS.title, { message: 'Titre trop long (120 caractères maximum).' });
    maxLength(p.body, LIMITS.body, { message: 'Message trop long.' });
  });

  protected readonly myPosts = computed(() => {
    const uid = this.space.user()?.uid;
    return this.space.posts().filter((p) => p.authorUid === uid);
  });

  /* ---------------------------------------------------------------- grades */
  protected readonly pickedClass = signal('');
  protected readonly pickedStudent = signal('');
  protected readonly gradeModel = signal({ subject: '', title: '', score: '', outOf: '20', comment: '' });
  protected readonly gradeForm = form(this.gradeModel, (p) => {
    required(p.subject, { message: 'Choisissez la matière.' });
    required(p.title, { message: 'Saisissez un intitulé.' });
    maxLength(p.title, LIMITS.title, { message: 'Intitulé trop long (120 caractères maximum).' });
    maxLength(p.comment, LIMITS.comment, { message: 'Commentaire trop long.' });
  });

  protected readonly classStudents = computed(() => {
    const [section, classe] = this.pickedClass().split(':');
    return this.space
      .students()
      .filter((s) => s.section === section && s.classe === classe)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  });
  protected readonly student = computed(() => this.classStudents().find((s) => s.uid === this.pickedStudent()) ?? null);
  protected readonly studentGrades = computed(() =>
    this.space.grades().filter((g) => g.studentUid === this.pickedStudent()).sort((a, b) => b.createdAt - a.createdAt),
  );

  protected setType(type: PostType): void {
    this.postModel.update((m) => ({ ...m, type }));
  }

  protected subjectName(id: string): string {
    return matiereName(id);
  }

  protected mark(n: number): string {
    return FORMAT_MARK.format(n);
  }

  protected day(ms: number): string {
    return ms ? DATE.format(ms) : '';
  }

  protected onPickClass(value: string): void {
    this.pickedClass.set(value);
    this.pickedStudent.set('');
    this.message.set(null);
  }

  protected async onPublish(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    const m = this.postModel();
    if (this.postForm().invalid()) return;
    const problem = this.#postProblem(m);
    if (problem) return this.#say(problem, false);
    await this.#run(async () => {
      await this.space.publishPost({
        type: m.type,
        title: m.title,
        body: m.body,
        subject: m.subject,
        target: m.target,
        dueDate: m.type === 'assignment' ? m.dueDate : null,
        url: m.type === 'resource' && m.url.trim() ? m.url.trim() : null,
      });
      this.postModel.update((x) => ({ ...x, title: '', body: '', dueDate: '', url: '' }));
      this.attempted.set(false);
      this.#say('Publié : vos élèves le voient tout de suite.', true);
    });
  }

  #postProblem(m: { type: PostType; body: string; dueDate: string; url: string }): string | null {
    if (m.body.length > LIMITS.body) return 'Le message est trop long.';
    if (m.type === 'assignment' && !isCalendarDay(m.dueDate)) return 'Choisissez la date à laquelle le devoir est à rendre.';
    if (m.type === 'resource' && m.url.trim() && !isHttpsUrl(m.url)) return 'Le lien doit commencer par https://.';
    if (m.type === 'resource' && !m.url.trim() && !m.body.trim()) return 'Ajoutez un lien ou un message.';
    return null;
  }

  protected async onDeletePost(id: string): Promise<void> {
    await this.space.deletePost(id).catch(() => undefined);
  }

  protected async onAddGrade(event: Event): Promise<void> {
    event.preventDefault();
    this.gradeAttempted.set(true);
    const s = this.student();
    const m = this.gradeModel();
    if (!s || this.gradeForm().invalid()) return;
    const score = parseNumber(m.score);
    const outOf = parseNumber(m.outOf);
    if (Number.isNaN(outOf) || outOf <= 0 || outOf > 100) return this.#say('« Sur » doit être un nombre entre 1 et 100.', false);
    if (Number.isNaN(score) || score > outOf) return this.#say('La note doit être un nombre entre 0 et ' + FORMAT_MARK.format(outOf) + '.', false);
    await this.#run(async () => {
      await this.space.addGrade({ studentUid: s.uid, studentName: s.displayName, subject: m.subject, title: m.title, score, outOf, comment: m.comment });
      this.gradeModel.update((x) => ({ ...x, title: '', score: '', comment: '' }));
      this.gradeAttempted.set(false);
      this.#say('Note enregistrée.', true);
    });
  }

  protected async onDeleteGrade(id: string): Promise<void> {
    await this.space.deleteGrade(id).catch(() => undefined);
  }

  /* ---------------------------------------------------------------- account */
  protected async onRefresh(): Promise<void> {
    await this.#run(() => this.space.refresh());
  }

  protected async onResend(): Promise<void> {
    await this.#run(async () => {
      await this.space.resendVerification();
      this.#say('E-mail de vérification renvoyé.', true);
    });
  }

  protected async onLogout(): Promise<void> {
    await this.space.logout();
  }

  #say(text: string, ok: boolean): void {
    this.ok.set(ok);
    this.message.set(text);
  }

  async #run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await action();
    } catch (error) {
      this.#say(frenchError(error), false);
    } finally {
      this.busy.set(false);
    }
  }
}
