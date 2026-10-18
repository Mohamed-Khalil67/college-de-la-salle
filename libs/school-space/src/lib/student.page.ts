import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { matiereById, matiereName } from '@site/content';
import { addDays, daysBetween, eventsFor, kindInfo, longDay, nextExam, occurrences, timeRange, type Occurrence } from './calendar.model';
import {
  averageOnTwenty,
  CLASSES,
  classLabel,
  FORMAT_MARK,
  frenchError,
  gradesBySubject,
  postsFor,
  round1,
  SECTION_LABELS,
  todayIso,
  type SectionId,
} from './space.model';
import { SpaceService } from './space.service';
import { Agenda } from './ui/agenda';
import { AuthPanel } from './ui/auth-panel';
import { EventDetails } from './ui/event-details';
import { PostCard } from './ui/post-card';
import { KIND_STYLES, SPACE_STYLES } from './ui/space.styles';

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * `/espace-eleve`: sign in, then everything on one page — what is coming (next exam, today, homework),
 * the class calendar (classes, exams, homework, revision… with their documents and videos), my grades and
 * the announcements.
 */
@Component({
  selector: 'space-student-page',
  imports: [FormField, RouterLink, AuthPanel, Agenda, EventDetails, PostCard, NgOptimizedImage, NgTemplateOutlet],
  template: `
    <header class="bg-navy-900 text-cream">
      <div class="on-dark mx-auto grid max-w-6xl gap-2 px-4 py-10">
        <p class="kicker">Collège de la Salle · Daher</p>
        <h1 class="m-0 text-4xl text-white md:text-5xl">Espace élève</h1>
        <p class="m-0 max-w-2xl text-lg text-cream/90">Mon emploi du temps, mes examens, mes devoirs, mes notes et les documents de mes cours, sur une seule page.</p>
      </div>
    </header>

    <div class="mx-auto max-w-6xl px-4 py-10">
      @if (!space.enabled) {
        <p class="m-0 rounded-xl bg-warn-soft p-5 text-warn" role="status" data-testid="unavailable">L’espace élève sera disponible prochainement.</p>
      } @else if (space.unavailable()) {
        <p class="m-0 rounded-xl bg-warn-soft p-5 text-warn" role="alert" data-testid="unavailable">Le service est momentanément indisponible. Réessayez dans quelques instants.</p>
      } @else if (!space.ready()) {
        <p class="m-0 text-muted" aria-busy="true">Chargement…</p>
      } @else if (!space.signedIn()) {
        <space-auth-panel kind="student" />
      } @else if (space.role() === 'loading') {
        <p class="m-0 text-muted" aria-busy="true">Chargement de votre espace…</p>
      } @else if (space.role() === 'teacher' || space.role() === 'teacher-unverified') {
        <div class="mx-auto grid max-w-xl gap-4 rounded-2xl border border-line bg-surface p-6" data-testid="is-teacher">
          <h2 class="m-0 text-2xl">Vous êtes connecté en tant qu’enseignant</h2>
          <p class="m-0">Votre espace est l’Espace enseignant : vous y gérez le calendrier, les annonces et les notes.</p>
          <div class="flex flex-wrap gap-3">
            <a class="btn btn-navy" routerLink="/espace-enseignant">Ouvrir l’Espace enseignant</a>
            <button type="button" class="btn btn-outline-dark" (click)="onLogout()">Se déconnecter</button>
          </div>
        </div>
      } @else if (space.role() === 'none') {
        <!-- Signed in, but the profile was never saved (e.g. the browser closed during sign-up) -->
        <form class="mx-auto grid max-w-xl gap-4 rounded-2xl border border-line bg-surface p-6" novalidate (submit)="onSaveProfile($event, true)" aria-label="Compléter mon profil">
          <h2 class="m-0 text-2xl">Compléter mon profil</h2>
          <ng-container *ngTemplateOutlet="profileFields" />
          @if (message(); as m) {
            <p class="m-0 rounded-lg bg-warn-soft px-3 py-2 text-warn" role="alert">{{ m }}</p>
          }
          <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn btn-navy" [disabled]="busy()">Enregistrer</button>
            <button type="button" class="btn btn-outline-dark" (click)="onLogout()">Se déconnecter</button>
          </div>
        </form>
      } @else if (space.profile(); as p) {
        <div class="grid gap-8" data-testid="dashboard">
          <section class="grid gap-3 rounded-2xl border border-line bg-surface p-5" aria-labelledby="hello">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 id="hello" class="m-0 text-2xl" data-testid="hello">Bonjour {{ space.firstName() }}</h2>
                <p class="m-0 mt-1 flex flex-wrap gap-2 text-sm">
                  <span class="rounded-full bg-navy-100 px-3 py-1 font-semibold text-navy-700" data-testid="chip-section">{{ sectionLabel(p.section) }}</span>
                  <span class="rounded-full bg-navy-100 px-3 py-1 font-semibold text-navy-700" data-testid="chip-class">{{ classText(p.section, p.classe) }}</span>
                </p>
              </div>
              <div class="flex flex-wrap gap-3">
                <a class="btn btn-outline-dark" [routerLink]="p.section === 'bac' ? '/bac-francais' : '/bac-nationale'">Ma section</a>
                <button type="button" class="btn btn-outline-dark" (click)="editing.set(!editing())" [attr.aria-expanded]="editing()" data-testid="edit-profile">Modifier mon profil</button>
                <button type="button" class="btn btn-outline-dark" (click)="onLogout()" data-testid="logout">Se déconnecter</button>
              </div>
            </div>
            @if (editing()) {
              <form class="grid gap-4 border-t border-line pt-4" novalidate (submit)="onSaveProfile($event, false)" aria-label="Modifier mon profil">
                <ng-container *ngTemplateOutlet="profileFields" />
                @if (message(); as m) {
                  <p class="m-0 rounded-lg bg-warn-soft px-3 py-2 text-warn" role="alert">{{ m }}</p>
                }
                <div><button type="submit" class="btn btn-navy" [disabled]="busy()" data-testid="save-profile">Enregistrer</button></div>
              </form>
            }
          </section>

          <!-- What is coming -->
          <div class="grid gap-4 md:grid-cols-3" data-testid="upcoming">
            <section class="card" aria-labelledby="next-exam-title" data-testid="next-exam">
              <h2 id="next-exam-title" class="card-title">Prochain examen</h2>
              @if (exam(); as o) {
                <button type="button" class="item" [class]="'k-' + o.event.kind" (click)="details.open(o)">
                  <span class="block text-2xl font-bold" data-testid="next-exam-countdown">{{ countdown(o.day) }}</span>
                  <span class="block font-semibold" dir="auto">{{ o.event.title }}</span>
                  <span class="block text-sm first-letter:uppercase">{{ longDay(o.day) }} · {{ timeRange(o.event) }}@if (o.event.place) { · {{ o.event.place }} }</span>
                </button>
              } @else {
                <p class="m-0 text-muted">Aucun examen prévu.</p>
              }
            </section>

            <section class="card" aria-labelledby="today-title" data-testid="today">
              <h2 id="today-title" class="card-title">Aujourd’hui</h2>
              @if (todayList().length) {
                <ul class="m-0 grid list-none gap-1.5 p-0">
                  @for (o of todayList(); track o.key) {
                    <li>
                      <button type="button" class="item" [class]="'k-' + o.event.kind" (click)="details.open(o)">
                        <span class="text-xs font-bold uppercase">{{ kindLabel(o) }}</span> · <span class="text-sm">{{ timeRange(o.event) }}</span>
                        <span class="block font-semibold" dir="auto">{{ o.event.title }}</span>
                      </button>
                    </li>
                  }
                </ul>
              } @else {
                <p class="m-0 text-muted">Rien de prévu aujourd’hui.</p>
              }
            </section>

            <section class="card" aria-labelledby="todo-title" data-testid="todo">
              <h2 id="todo-title" class="card-title">À rendre</h2>
              @if (todo().length) {
                <ul class="m-0 grid list-none gap-2 p-0">
                  @for (o of todo(); track o.key) {
                    <li class="flex items-start gap-2">
                      <input type="checkbox" class="mt-1" [checked]="false" (change)="toggle(o.event.id)" [attr.aria-label]="'Marquer « ' + o.event.title + ' » comme fait'" data-testid="todo-check" />
                      <button type="button" class="link text-start" (click)="details.open(o)">
                        <span class="font-semibold" dir="auto" data-testid="todo-title">{{ o.event.title }}</span>
                        <span class="block text-sm" [class.text-warn]="o.day < today">{{ dueLabel(o.day) }}</span>
                      </button>
                    </li>
                  }
                </ul>
              } @else {
                <p class="m-0 text-muted" data-testid="todo-empty">Aucun devoir à rendre. 🎉</p>
              }
            </section>
          </div>

          <space-agenda [events]="myEvents()" [doneIds]="done()" [gradedIds]="gradedIds()" (open)="details.open($event)" />

          <div class="grid gap-6 lg:grid-cols-2">
            <section class="card" aria-labelledby="grades-title" data-testid="grades">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="grades-title" class="card-title">Mes notes</h2>
                @if (overall() !== null) {
                  <p class="m-0 font-semibold" data-testid="overall">Moyenne générale : {{ mark(overall()) }} / 20</p>
                }
              </div>
              @if (subjects().length) {
                <ul class="m-0 grid list-none gap-2 p-0">
                  @for (s of subjects(); track s.subject) {
                    <li>
                      <details class="rounded-lg border border-line" data-testid="subject-grades">
                        <summary class="flex cursor-pointer items-center gap-3 p-3">
                          @if (image(s.subject); as src) { <img [ngSrc]="src" width="45" height="30" alt="" class="rounded" /> }
                          <span class="flex-1 font-semibold">{{ name(s.subject) }}</span>
                          <span class="font-bold" data-testid="subject-average">{{ mark(s.average) }} / 20</span>
                        </summary>
                        <ul class="m-0 grid list-none gap-2 border-t border-line p-3">
                          @for (g of s.grades; track g.id) {
                            <li class="grid gap-0.5" data-testid="grade">
                              <p class="m-0 flex flex-wrap justify-between gap-2">
                                <span dir="auto">{{ g.title }} <span class="text-sm text-muted">(coef. {{ g.coefficient }})</span></span>
                                <span class="font-bold" data-testid="grade-score">{{ mark(g.score) }} / {{ mark(g.outOf) }}</span>
                              </p>
                              @if (g.comment) { <p class="m-0 text-sm" dir="auto">« {{ g.comment }} »</p> }
                              <p class="m-0 text-xs text-muted"><bdi dir="auto">{{ g.teacherName }}</bdi> · {{ day(g.createdAt) }}</p>
                            </li>
                          }
                        </ul>
                      </details>
                    </li>
                  }
                </ul>
              } @else {
                <p class="m-0 text-muted" data-testid="grades-empty">Aucune note publiée pour l’instant.</p>
              }
            </section>

            <section class="card" aria-labelledby="news-title" data-testid="announcements">
              <h2 id="news-title" class="card-title">Annonces</h2>
              @if (posts().length) {
                <ul class="m-0 grid list-none gap-3 p-0">
                  @for (post of posts(); track post.id) {
                    <li><space-post-card [post]="post" /></li>
                  }
                </ul>
              } @else {
                <p class="m-0 text-muted" data-testid="posts-empty">Aucune annonce pour votre classe.</p>
              }
            </section>
          </div>
        </div>
      }
    </div>

    <space-event-details #details mode="student" [grades]="space.grades()" [doneIds]="done()" (toggleDone)="toggle($event.id)" />

    <ng-template #profileFields>
      <div class="grid gap-1">
        <label for="prof-name" class="font-semibold">Nom et prénom</label>
        <input id="prof-name" type="text" autocomplete="name" [formField]="profileForm.displayName" />
        <p class="err" role="alert">{{ attempted() ? (profileForm.displayName().errors()[0]?.message ?? '') : '' }}</p>
      </div>
      <fieldset class="m-0 grid gap-2 border-0 p-0">
        <legend class="mb-1 p-0 font-semibold">Ma section</legend>
        <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Section">
          @for (s of sections; track s.id) {
            <button type="button" role="radio" class="choice" [attr.aria-checked]="profileModel().section === s.id" [attr.data-testid]="'profile-section-' + s.id" (click)="setSection(s.id)">{{ s.label }}</button>
          }
        </div>
      </fieldset>
      <div class="grid gap-1">
        <label for="prof-class" class="font-semibold">Ma classe</label>
        <select id="prof-class" [formField]="profileForm.classe" data-testid="profile-class">
          @for (c of classOptions(); track c.value) {
            <option [value]="c.value">{{ c.label }}</option>
          }
        </select>
      </div>
    </ng-template>
  `,
  styles: [
    SPACE_STYLES,
    KIND_STYLES,
    `
      :host { min-block-size: 100dvh; }
      .card { display: grid; align-content: start; gap: 0.75rem; padding: 1.25rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
      .card-title { margin: 0; font-size: 1.25rem; }
      .item { display: block; inline-size: 100%; padding: 0.6rem 0.75rem; border: 0; border-inline-start: 4px solid; border-radius: 10px; font: inherit; text-align: start; cursor: pointer; }
      input[type='checkbox'] { inline-size: 1.15rem; block-size: 1.15rem; padding: 0; flex: none; }
      summary::-webkit-details-marker { display: none; }
    `,
  ],
})
export class StudentPage {
  protected readonly space = inject(SpaceService);

  protected readonly today = todayIso();
  protected readonly sections = (['nationale', 'bac'] as const).map((id) => ({ id, label: SECTION_LABELS[id] }));

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly attempted = signal(false);
  protected readonly message = signal<string | null>(null);

  /** The profile form starts from the saved profile and follows it when it changes. */
  protected readonly profileModel = linkedSignal(() => {
    const p = this.space.profile();
    return { displayName: p?.displayName ?? '', section: (p?.section ?? 'nationale') as SectionId, classe: p?.classe ?? CLASSES.nationale[0]!.value };
  });
  protected readonly profileForm = form(this.profileModel, (p) => {
    required(p.displayName, { message: 'Saisissez votre nom et prénom.' });
  });
  protected readonly classOptions = computed(() => CLASSES[this.profileModel().section]);

  /* ---------------------------------------------------------------- what the student sees */
  protected readonly myEvents = computed(() => {
    const p = this.space.profile();
    return p ? eventsFor(this.space.events(), p.section, p.classe) : [];
  });
  protected readonly done = computed(() => this.space.profile()?.done ?? []);
  protected readonly gradedIds = computed(() => this.space.grades().map((g) => g.eventId));

  readonly #coming = computed(() => occurrences(this.myEvents(), this.today, addDays(this.today, 120)));
  protected readonly exam = computed(() => nextExam(this.#coming(), this.today));
  protected readonly todayList = computed(() => this.#coming().filter((o) => o.day === this.today));
  /** Homework not done yet: late ones (last 30 days) first, then the coming ones. */
  protected readonly todo = computed(() =>
    occurrences(this.myEvents(), addDays(this.today, -30), addDays(this.today, 120))
      .filter((o) => o.event.kind === 'devoir' && !this.done().includes(o.event.id))
      .slice(0, 8),
  );

  protected readonly subjects = computed(() => gradesBySubject(this.space.grades()));
  protected readonly overall = computed(() => averageOnTwenty(this.space.grades()));
  protected readonly posts = computed(() => {
    const p = this.space.profile();
    return p ? postsFor(this.space.posts(), p.section, p.classe).slice(0, 6) : [];
  });

  protected readonly longDay = longDay;
  protected readonly timeRange = timeRange;

  protected kindLabel(o: Occurrence): string {
    return kindInfo(o.event.kind).label;
  }

  protected countdown(day: string): string {
    const n = daysBetween(this.today, day);
    return n === 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : `Dans ${n} jours`;
  }

  protected dueLabel(day: string): string {
    const n = daysBetween(this.today, day);
    if (n < 0) return `En retard (${longDay(day)})`;
    if (n === 0) return 'Pour aujourd’hui';
    if (n === 1) return 'Pour demain';
    return `Pour le ${longDay(day)}`;
  }

  protected sectionLabel(section: SectionId): string {
    return SECTION_LABELS[section];
  }

  protected classText(section: SectionId, value: string): string {
    return classLabel(section, value);
  }

  protected name(subject: string): string {
    return matiereName(subject) || 'Autre';
  }

  protected image(subject: string): string | null {
    return matiereById(subject)?.image ?? null;
  }

  protected mark(n: number | null): string {
    return n === null ? '–' : FORMAT_MARK.format(round1(n));
  }

  protected day(ms: number): string {
    return ms ? DATE.format(ms) : '';
  }

  protected setSection(section: SectionId): void {
    this.profileModel.update((m) => ({ ...m, section, classe: CLASSES[section][0]!.value }));
  }

  protected async toggle(id: string): Promise<void> {
    await this.space.toggleDone(id).catch(() => undefined);
  }

  protected async onSaveProfile(event: Event, create: boolean): Promise<void> {
    event.preventDefault();
    this.attempted.set(true);
    if (this.profileForm().invalid()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      if (create) await this.space.saveProfile(this.profileModel());
      else {
        await this.space.updateProfile(this.profileModel());
        this.editing.set(false);
      }
      this.attempted.set(false);
    } catch (error) {
      this.message.set(frenchError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async onLogout(): Promise<void> {
    await this.space.logout();
  }
}
