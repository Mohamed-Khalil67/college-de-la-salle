import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { matiereById, matiereName } from '@site/content';
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
  splitAssignments,
  todayIso,
  type PostType,
  type SectionId,
} from './space.model';
import { SpaceService } from './space.service';
import { eventsFor } from './calendar.model';
import { AuthPanel } from './ui/auth-panel';
import { Calendar } from './ui/calendar';
import { PostCard } from './ui/post-card';
import { SPACE_STYLES } from './ui/space.styles';

type Tab = 'announcement' | 'assignment' | 'calendar' | 'grades' | 'resource';

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** `/espace-eleve`: sign in, then what the teachers publish for the student's class and their own grades. */
@Component({
  selector: 'space-student-page',
  imports: [FormField, RouterLink, AuthPanel, Calendar, PostCard, NgOptimizedImage, NgTemplateOutlet],
  template: `
    <header class="bg-navy-900 text-cream">
      <div class="on-dark mx-auto grid max-w-6xl gap-2 px-4 py-12">
        <p class="kicker">Collège de la Salle · Daher</p>
        <h1 class="m-0 text-4xl text-white md:text-5xl">Espace élève</h1>
        <p class="m-0 max-w-2xl text-lg text-cream/90">
          Les annonces, les devoirs, les ressources et les notes que vos enseignants publient pour votre classe, au même endroit.
        </p>
      </div>
    </header>

    <div class="mx-auto max-w-5xl px-4 py-12">
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
          <p class="m-0">Votre espace est l’Espace enseignant : vous y publiez les annonces, devoirs, ressources et notes.</p>
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
          <section class="grid gap-3 rounded-2xl border border-line bg-surface p-6" aria-labelledby="hello">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 id="hello" class="m-0 text-2xl" data-testid="hello">Bonjour {{ space.firstName() }}</h2>
                <p class="m-0 mt-1 flex flex-wrap gap-2 text-sm">
                  <span class="rounded-full bg-navy-100 px-3 py-1 font-semibold text-navy-700" data-testid="chip-section">{{ sectionLabel(p.section) }}</span>
                  <span class="rounded-full bg-navy-100 px-3 py-1 font-semibold text-navy-700" data-testid="chip-class">{{ classText(p.section, p.classe) }}</span>
                </p>
                @if (space.user(); as u) {
                  <p class="m-0 mt-2 text-sm text-muted"><bdi>{{ u.email }}</bdi>@if (!u.emailVerified) { · e-mail non vérifié (consultez votre boîte de réception) }</p>
                }
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

          <div class="grid gap-6">
            <div role="tablist" aria-label="Mon espace" class="flex flex-wrap gap-1 rounded-full bg-navy-100 p-1">
              @for (t of tabs; track t.id) {
                <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === t.id" [attr.aria-controls]="'panel-' + t.id" [id]="'tab-' + t.id" [attr.data-testid]="'tab-' + t.id" (click)="tab.set(t.id)">
                  {{ t.label }}@if (count(t.id); as n) { <span class="ms-1 text-sm">({{ n }})</span> }
                </button>
              }
            </div>

            <section role="tabpanel" [id]="'panel-' + tab()" [attr.aria-labelledby]="'tab-' + tab()" class="grid gap-4" tabindex="0">
              @switch (tab()) {
                @case ('assignment') {
                  @if (assignments().todo.length || assignments().finished.length) {
                    <ul class="m-0 grid list-none gap-3 p-0" data-testid="todo">
                      @for (a of assignments().todo; track a.id) {
                        <li>
                          <space-post-card [post]="a" [today]="today">
                            <button type="button" class="btn btn-outline-dark justify-self-start" (click)="toggle(a.id)" aria-pressed="false" data-testid="mark-done">Marquer comme fait</button>
                          </space-post-card>
                        </li>
                      }
                    </ul>
                    @if (assignments().finished.length) {
                      <h3 class="m-0 text-lg text-muted">Terminés</h3>
                      <ul class="m-0 grid list-none gap-3 p-0 opacity-80" data-testid="finished">
                        @for (a of assignments().finished; track a.id) {
                          <li>
                            <space-post-card [post]="a" [today]="today">
                              <button type="button" class="btn btn-outline-dark justify-self-start" (click)="toggle(a.id)" aria-pressed="true" data-testid="mark-undone">✓ Fait — annuler</button>
                            </space-post-card>
                          </li>
                        }
                      </ul>
                    }
                  } @else {
                    <p class="m-0 text-muted" data-testid="empty">Aucun devoir pour votre classe pour l’instant.</p>
                  }
                }
                @case ('calendar') {
                  <space-calendar [events]="myEvents()" />
                }
                @case ('resource') {
                  @if (resourceGroups().length) {
                    @for (g of resourceGroups(); track g.subject) {
                      <section class="grid gap-3" [attr.aria-label]="g.name" data-testid="resource-group">
                        <h3 class="m-0 text-lg text-gold-ink">{{ g.name }}</h3>
                        <ul class="m-0 grid list-none gap-3 p-0" data-testid="posts">
                          @for (post of g.posts; track post.id) {
                            <li><space-post-card [post]="post" /></li>
                          }
                        </ul>
                      </section>
                    }
                  } @else {
                    <p class="m-0 text-muted" data-testid="empty">{{ emptyText() }}</p>
                  }
                }
                @case ('grades') {
                  @if (grades().length) {
                    <p class="m-0 text-lg" data-testid="overall">
                      Moyenne générale : <strong>{{ overall() }} / 20</strong>
                    </p>
                    @for (s of grades(); track s.subject) {
                      <section class="grid gap-3 rounded-xl border border-line bg-surface p-4" data-testid="subject-grades">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                          <div class="flex items-center gap-3">
                            @if (image(s.subject); as src) {
                              <img [ngSrc]="src" width="60" height="40" alt="" class="rounded-md object-cover" />
                            }
                            <h3 class="m-0 text-lg">{{ name(s.subject) }}</h3>
                          </div>
                          <p class="m-0 font-semibold" data-testid="subject-average">Moyenne : {{ mark(s.average) }} / 20</p>
                        </div>
                        <ul class="m-0 grid list-none gap-2 p-0">
                          @for (g of s.grades; track g.id) {
                            <li class="grid gap-0.5 border-t border-line pt-2" data-testid="grade">
                              <p class="m-0 flex flex-wrap justify-between gap-2">
                                <span class="font-semibold" dir="auto">{{ g.title }}</span>
                                <span class="font-bold text-navy-900" data-testid="grade-score">{{ mark(g.score) }} / {{ mark(g.outOf) }}</span>
                              </p>
                              @if (g.comment) {
                                <p class="m-0" dir="auto">{{ g.comment }}</p>
                              }
                              <p class="m-0 text-sm text-muted"><bdi dir="auto">{{ g.teacherName }}</bdi> · {{ day(g.createdAt) }}</p>
                            </li>
                          }
                        </ul>
                      </section>
                    }
                  } @else {
                    <p class="m-0 text-muted" data-testid="empty">Aucune note pour l’instant.</p>
                  }
                }
                @default {
                  @if (posts().length) {
                    <ul class="m-0 grid list-none gap-3 p-0" data-testid="posts">
                      @for (post of posts(); track post.id) {
                        <li><space-post-card [post]="post" /></li>
                      }
                    </ul>
                  } @else {
                    <p class="m-0 text-muted" data-testid="empty">{{ emptyText() }}</p>
                  }
                }
              }
            </section>
          </div>
        </div>
      }
    </div>

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
  styles: SPACE_STYLES + `:host { min-block-size: 100dvh; }`,
})
export class StudentPage {
  protected readonly space = inject(SpaceService);

  protected readonly today = todayIso();
  protected readonly tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'announcement', label: 'Annonces' },
    { id: 'assignment', label: 'Devoirs' },
    { id: 'calendar', label: 'Calendrier' },
    { id: 'grades', label: 'Notes' },
    { id: 'resource', label: 'Ressources' },
  ];
  protected readonly sections = (['nationale', 'bac'] as const).map((id) => ({ id, label: SECTION_LABELS[id] }));

  protected readonly tab = signal<Tab>('announcement');
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

  /** What the student sees: posts addressed to their section and class. */
  readonly #audience = computed(() => {
    const p = this.space.profile();
    return (type: PostType) => (p ? postsFor(this.space.posts(), type, p.section, p.classe) : []);
  });
  protected readonly posts = computed(() => this.#audience()('announcement'));
  protected readonly myEvents = computed(() => {
    const p = this.space.profile();
    return p ? eventsFor(this.space.events(), p.section, p.classe) : [];
  });
  /** Course material, organised by subject (subjects in catalogue order, « Autres » last). */
  protected readonly resourceGroups = computed(() => {
    const posts = this.#audience()('resource');
    const subjects = [...new Set(posts.map((p) => p.subject))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : this.name(a).localeCompare(this.name(b), 'fr')));
    return subjects.map((subject) => ({ subject, name: subject ? this.name(subject) : 'Autres', posts: posts.filter((p) => p.subject === subject) }));
  });
  protected readonly assignments = computed(() =>
    splitAssignments(this.#audience()('assignment'), this.space.profile()?.done ?? []),
  );
  protected readonly grades = computed(() => gradesBySubject(this.space.grades()));
  protected readonly overall = computed(() => {
    const avg = averageOnTwenty(this.space.grades());
    return avg === null ? '–' : FORMAT_MARK.format(avg);
  });
  protected readonly emptyText = computed(() =>
    this.tab() === 'resource' ? 'Aucune ressource pour votre classe pour l’instant.' : 'Aucune annonce pour votre classe pour l’instant.',
  );

  protected count(tab: Tab): number {
    if (tab === 'assignment') return this.assignments().todo.length;
    if (tab === 'grades') return this.space.grades().length;
    if (tab === 'calendar') return 0;
    return this.#audience()(tab).length;
  }

  protected sectionLabel(section: SectionId): string {
    return SECTION_LABELS[section];
  }

  protected classText(section: SectionId, value: string): string {
    return classLabel(section, value);
  }

  protected name(subject: string): string {
    return matiereName(subject);
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
