import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MATIERES } from '../../school';
import { type CalendarEvent, kindInfo, LIMITS, longDay, TARGET_OPTIONS, targetLabel } from '@cdls/shared';
import { frenchError } from '../firebase-errors';
import { SpaceService } from '../space.service';
import { Agenda } from '../calendar/agenda';
import { AuthPanel } from '../auth/auth-panel';
import { EventDetails } from '../calendar/event-details';
import { EventForm } from '../calendar/event-form';
import { GradeGrid } from '../grades/grade-grid';
import { PostCard } from '../announcements/post-card';
import { KIND_STYLES, SPACE_STYLES } from '../space-styles';

/**
 * `/espace-enseignant`: the same single page as the students', editable. The shared calendar (add, edit,
 * move, delete classes, exams, homework… with documents and videos), the grades of each exam in one grid,
 * and announcements. Only e-mails listed by the school (teachers/{email}) and verified can do this.
 */
@Component({
  selector: 'space-teacher-page',
  imports: [FormField, AuthPanel, Agenda, EventDetails, EventForm, GradeGrid, PostCard],
  template: `
    <header class="bg-navy-900 text-cream">
      <div class="on-dark mx-auto grid max-w-6xl gap-2 px-4 py-10">
        <p class="kicker">Collège de la Salle · Daher</p>
        <h1 class="m-0 text-4xl text-white md:text-5xl">Espace enseignant</h1>
        <p class="m-0 max-w-2xl text-lg text-cream/90">
          Le calendrier des classes, les examens et leurs notes, les annonces : tout ce que vos élèves voient, en modifiable.
        </p>
      </div>
    </header>

    <div class="mx-auto max-w-6xl px-4 py-10">
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
          <section class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5" aria-labelledby="hello">
            <div>
              <h2 id="hello" class="m-0 text-2xl" data-testid="hello">Bonjour {{ space.firstName() }}</h2>
              <p class="m-0 mt-1 text-sm text-muted"><bdi>{{ space.user()?.email }}</bdi> · enseignant</p>
            </div>
            <div class="flex flex-wrap gap-3">
              <button type="button" class="btn btn-navy" (click)="eventForm.open()" data-testid="new-event">+ Ajouter un événement</button>
              <button type="button" class="btn btn-outline-dark" (click)="onLogout()" data-testid="logout">Se déconnecter</button>
            </div>
          </section>

          <space-agenda [events]="space.events()" [editable]="true" (open)="details.open($event)" (add)="eventForm.open(null, $event)" />

          <div class="grid gap-6 lg:grid-cols-2">
            <section class="card" aria-labelledby="exams-title" data-testid="exams">
              <h2 id="exams-title" class="card-title">Examens et notes</h2>
              <p class="m-0 text-sm text-muted">Les examens, contrôles, TP et devoirs du calendrier. Les élèves ne voient une note qu’une fois publiée.</p>
              @if (gradable().length) {
                <ul class="m-0 grid list-none gap-2 p-0">
                  @for (g of gradable(); track g.event.id) {
                    <li class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3" data-testid="gradable-event">
                      <div class="min-w-0">
                        <p class="m-0"><span class="rounded-full border px-2 py-0.5 text-xs font-bold" [class]="'k-' + g.event.kind">{{ kindLabel(g.event) }}</span> <span class="font-semibold" dir="auto">{{ g.event.title }}</span></p>
                        <p class="m-0 mt-1 text-sm text-muted first-letter:uppercase">{{ longDay(g.event.date) }} · {{ audience(g.event) }}</p>
                        <p class="m-0 text-sm" data-testid="gradable-status">{{ g.status }}</p>
                      </div>
                      <button type="button" class="btn btn-outline-dark" (click)="grid.open(g.event)" data-testid="open-grades">Notes</button>
                    </li>
                  }
                </ul>
              } @else {
                <p class="m-0 text-muted" data-testid="exams-empty">Ajoutez un examen, un contrôle, un TP ou un devoir au calendrier pour saisir des notes.</p>
              }
            </section>

            <section class="card" aria-labelledby="news-title" data-testid="announcements">
              <h2 id="news-title" class="card-title">Annonces</h2>
              <form class="grid gap-3" novalidate (submit)="onPublish($event)" aria-label="Publier une annonce">
                <div class="grid gap-1">
                  <label for="post-title" class="font-semibold">Titre</label>
                  <input id="post-title" type="text" [formField]="postForm.title" [attr.aria-invalid]="attempted() && postForm.title().invalid()" />
                  <p class="err" role="alert">{{ attempted() ? (postForm.title().errors()[0]?.message ?? '') : '' }}</p>
                </div>
                <div class="grid gap-1">
                  <label for="post-body" class="font-semibold">Message</label>
                  <textarea id="post-body" [formField]="postForm.body"></textarea>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="grid gap-1">
                    <label for="post-subject" class="font-semibold">Matière</label>
                    <select id="post-subject" [formField]="postForm.subject">
                      <option value="">— Aucune —</option>
                      @for (m of matieres; track m.id) {
                        <option [value]="m.id">{{ m.name }}</option>
                      }
                    </select>
                  </div>
                  <div class="grid gap-1">
                    <label for="post-target" class="font-semibold">Pour</label>
                    <select id="post-target" [formField]="postForm.target" data-testid="post-target">
                      @for (t of targets; track t.value) {
                        <option [value]="t.value">{{ t.label }}</option>
                      }
                    </select>
                  </div>
                </div>
                @if (message(); as m) {
                  <p class="m-0 rounded-lg px-3 py-2" [class]="ok() ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'" role="alert" data-testid="form-message">{{ m }}</p>
                }
                <div><button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="publish">Publier l’annonce</button></div>
              </form>

              @if (myPosts().length) {
                <ul class="m-0 grid list-none gap-3 border-t border-line p-0 pt-3" data-testid="my-posts">
                  @for (p of myPosts(); track p.id) {
                    <li>
                      <space-post-card [post]="p">
                        <button type="button" class="link justify-self-start" (click)="onDeletePost(p.id)" [attr.aria-label]="'Supprimer ' + p.title" data-testid="delete-post">Supprimer</button>
                      </space-post-card>
                    </li>
                  }
                </ul>
              }
            </section>
          </div>
        </div>
      }
    </div>

    <space-event-details #details mode="teacher" (edit)="eventForm.open($event)" (remove)="onDeleteEvent($event)" (openGrades)="grid.open($event)" />
    <space-event-form #eventForm />
    <space-grade-grid #grid />
  `,
  styles: [
    SPACE_STYLES,
    KIND_STYLES,
    `
      :host { min-block-size: 100dvh; }
      .card { display: grid; align-content: start; gap: 0.75rem; padding: 1.25rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
      .card-title { margin: 0; font-size: 1.25rem; }
    `,
  ],
})
export class TeacherPage {
  protected readonly space = inject(SpaceService);

  protected readonly matieres = MATIERES;
  protected readonly targets = TARGET_OPTIONS;

  protected readonly busy = signal(false);
  protected readonly ok = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly attempted = signal(false);

  protected readonly postModel = signal({ title: '', body: '', subject: '', target: 'all' });
  protected readonly postForm = form(this.postModel, (p) => {
    required(p.title, { message: 'Saisissez un titre.' });
    maxLength(p.title, LIMITS.title, { message: 'Titre trop long (120 caractères maximum).' });
    maxLength(p.body, LIMITS.body, { message: 'Message trop long.' });
  });

  protected readonly myPosts = computed(() => {
    const uid = this.space.user()?.uid;
    return this.space.posts().filter((p) => p.authorUid === uid);
  });

  /** Gradable events, latest first, with where their grades stand. */
  protected readonly gradable = computed(() => {
    const grades = this.space.grades();
    return this.space
      .events()
      .filter((e) => kindInfo(e.kind).gradable)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((event) => {
        const mine = grades.filter((g) => g.eventId === event.id);
        const status = !mine.length
          ? 'Aucune note saisie'
          : `${mine.length} note${mine.length > 1 ? 's' : ''} · ${mine.every((g) => g.published) ? 'publiées' : 'brouillon'}`;
        return { event, status };
      });
  });

  protected readonly longDay = longDay;

  protected kindLabel(e: CalendarEvent): string {
    return kindInfo(e.kind).label;
  }

  protected audience(e: CalendarEvent): string {
    return targetLabel(e.target);
  }

  protected async onPublish(event: Event): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.postForm().invalid()) return;
    const m = this.postModel();
    await this.#run(async () => {
      await this.space.publishPost(m);
      this.postModel.update((x) => ({ ...x, title: '', body: '' }));
      this.attempted.set(false);
      this.#say('Annonce publiée : vos élèves la voient tout de suite.', true);
    });
  }

  protected async onDeletePost(id: string): Promise<void> {
    await this.space.deletePost(id).catch(() => undefined);
  }

  protected async onDeleteEvent(e: CalendarEvent): Promise<void> {
    await this.space.deleteEvent(e.id).catch(() => undefined);
  }

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
