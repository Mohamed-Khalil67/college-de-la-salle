import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import { Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { matiereById, matiereName } from '@site/content';
import { kindInfo, longDay, safeAttachments, timeRange, toIcs, videoEmbed, type CalendarEvent, type Occurrence } from '../calendar.model';
import { FORMAT_MARK, targetLabel, type Grade } from '../space.model';
import { KIND_STYLES, SPACE_STYLES } from './space.styles';

interface ShownAttachment {
  readonly label: string;
  readonly url: string;
  readonly video: SafeResourceUrl | null;
}

/**
 * The window that opens on an event: when, where, who, details, course material and explanation videos.
 * Students also see their mark (once published) and tick homework as done; teachers edit, delete or open
 * the grade grid. A native <dialog>: Escape closes it and focus returns where it was.
 */
@Component({
  selector: 'space-event-details',
  imports: [NgOptimizedImage],
  template: `
    <dialog #dialog class="dialog" aria-labelledby="ev-title" (click)="onBackdrop($event)" (close)="occurrence.set(null)" data-testid="event-dialog">
      @if (occurrence(); as o) {
        @let e = o.event;
        <div class="grid gap-4 p-6">
          <div class="flex items-start justify-between gap-4">
            <div class="grid gap-2">
              <p class="m-0"><span class="rounded-full border px-3 py-0.5 text-sm font-bold" [class]="'k-' + e.kind" data-testid="ev-kind">{{ kindLabel() }}</span></p>
              <h2 id="ev-title" class="m-0 text-2xl" dir="auto" data-testid="ev-title">{{ e.title }}</h2>
            </div>
            <button type="button" class="close" (click)="close()" aria-label="Fermer">✕</button>
          </div>

          <dl class="m-0 grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
            <dt class="font-semibold">Quand</dt>
            <dd class="m-0 first-letter:uppercase" data-testid="ev-when">
              {{ longDay(o.day) }} · {{ time() }}
              @if (e.repeatUntil && repeatable()) {
                <span class="block text-sm text-muted">Chaque semaine jusqu’au {{ longDay(e.repeatUntil) }}</span>
              }
            </dd>
            @if (e.place) {
              <dt class="font-semibold">Où</dt>
              <dd class="m-0" dir="auto" data-testid="ev-place">{{ e.place }}</dd>
            }
            @if (e.subject) {
              <dt class="font-semibold">Matière</dt>
              <dd class="m-0 flex items-center gap-2">
                @if (subjectImage(); as src) { <img [ngSrc]="src" width="45" height="30" alt="" class="rounded" /> }
                {{ subjectName() }}
              </dd>
            }
            <dt class="font-semibold">Pour</dt>
            <dd class="m-0">{{ audience() }}</dd>
            <dt class="font-semibold">Par</dt>
            <dd class="m-0"><bdi dir="auto">{{ e.authorName }}</bdi></dd>
            @if (gradable()) {
              <dt class="font-semibold">Coefficient</dt>
              <dd class="m-0">{{ e.coefficient }}</dd>
            }
          </dl>

          @if (e.description) {
            <p class="m-0 whitespace-pre-line" dir="auto" data-testid="ev-description">{{ e.description }}</p>
          }

          @if (attachments().length) {
            <section class="grid gap-3" aria-label="Documents et vidéos">
              <h3 class="m-0 text-lg">Documents et vidéos</h3>
              @for (a of attachments(); track a.url) {
                @if (a.video; as src) {
                  <figure class="m-0 grid gap-1">
                    <div class="relative aspect-video w-full overflow-hidden rounded-lg bg-navy-900">
                      <iframe class="absolute inset-0 h-full w-full border-0" [src]="src" [title]="'Vidéo : ' + (a.label || e.title)" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" data-testid="ev-video"></iframe>
                    </div>
                    <figcaption class="text-sm text-muted" dir="auto">{{ a.label || 'Vidéo' }}</figcaption>
                  </figure>
                } @else {
                  <a [href]="a.url" target="_blank" rel="noopener noreferrer" class="font-semibold" dir="auto" data-testid="ev-link">{{ a.label || a.url }}<span class="visually-hidden"> (nouvel onglet)</span></a>
                }
              }
            </section>
          }

          @if (mode() === 'student') {
            @if (grade(); as g) {
              <p class="m-0 rounded-lg bg-navy-100 px-4 py-3" data-testid="ev-grade">
                <strong>Ma note : {{ mark(g.score) }} / {{ mark(g.outOf) }}</strong>
                @if (g.comment) { <span class="mt-1 block" dir="auto">« {{ g.comment }} »</span> }
              </p>
            }
            @if (e.kind === 'devoir') {
              <button type="button" class="btn btn-outline-dark justify-self-start" [attr.aria-pressed]="done()" (click)="toggleDone.emit(e)" data-testid="ev-done">
                {{ done() ? '✓ Fait — annuler' : 'Marquer comme fait' }}
              </button>
            }
          }

          <div class="flex flex-wrap gap-3 border-t border-line pt-4">
            <button type="button" class="btn btn-outline-dark" (click)="downloadIcs(e)" data-testid="ev-ics">Ajouter à mon agenda</button>
            @if (mode() === 'teacher') {
              @if (gradable()) {
                <button type="button" class="btn btn-navy" (click)="openGrades.emit(e); close()" data-testid="ev-grades">Saisir les notes</button>
              }
              <button type="button" class="btn btn-outline-dark" (click)="edit.emit(e); close()" data-testid="ev-edit">Modifier</button>
              @if (confirming()) {
                <button type="button" class="btn btn-danger" (click)="remove.emit(e); close()" data-testid="ev-delete-confirm">Confirmer la suppression</button>
                <button type="button" class="link" (click)="confirming.set(false)">Annuler</button>
              } @else {
                <button type="button" class="btn btn-outline-dark" (click)="confirming.set(true)" data-testid="ev-delete">Supprimer</button>
              }
            }
          </div>
        </div>
      }
    </dialog>
  `,
  styles: [
    SPACE_STYLES,
    KIND_STYLES,
    `
      .dialog { inline-size: min(40rem, calc(100vw - 2rem)); max-block-size: calc(100dvh - 2rem); padding: 0; border: 0; border-radius: 16px; background: var(--surface); color: inherit; box-shadow: 0 20px 50px rgb(10 25 47 / 0.3); }
      .dialog::backdrop { background: rgb(10 25 47 / 0.55); }
      .close { inline-size: 2.25rem; block-size: 2.25rem; flex: none; border-radius: 999px; border: 1px solid var(--border); background: transparent; font: inherit; cursor: pointer; }
      .btn-danger { background: #8a1f17; color: #fff; cursor: pointer; font: inherit; font-weight: 600; }
    `,
  ],
})
export class EventDetails {
  readonly mode = input.required<'student' | 'teacher'>();
  /** Student: their published grades and done homework. */
  readonly grades = input<readonly Grade[]>([]);
  readonly doneIds = input<readonly string[]>([]);

  readonly edit = output<CalendarEvent>();
  readonly remove = output<CalendarEvent>();
  readonly openGrades = output<CalendarEvent>();
  readonly toggleDone = output<CalendarEvent>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly #sanitizer = inject(DomSanitizer);
  readonly #document = inject(DOCUMENT);

  protected readonly occurrence = signal<Occurrence | null>(null);
  protected readonly confirming = signal(false);

  readonly #event = computed(() => this.occurrence()?.event ?? null);
  protected readonly kindLabel = computed(() => (this.#event() ? kindInfo(this.#event()!.kind).label : ''));
  protected readonly repeatable = computed(() => (this.#event() ? kindInfo(this.#event()!.kind).repeatable : false));
  protected readonly gradable = computed(() => (this.#event() ? kindInfo(this.#event()!.kind).gradable : false));
  protected readonly time = computed(() => (this.#event() ? timeRange(this.#event()!) : ''));
  protected readonly audience = computed(() => targetLabel(this.#event()?.target ?? 'all'));
  protected readonly subjectName = computed(() => matiereName(this.#event()?.subject ?? ''));
  protected readonly subjectImage = computed(() => matiereById(this.#event()?.subject ?? '')?.image ?? null);
  protected readonly grade = computed(() => this.grades().find((g) => g.eventId === this.#event()?.id) ?? null);
  protected readonly done = computed(() => this.doneIds().includes(this.#event()?.id ?? ''));

  /** https links only; YouTube and Drive videos play inside the window (player URL rebuilt from the id). */
  protected readonly attachments = computed<ShownAttachment[]>(() =>
    safeAttachments(this.#event()?.attachments ?? []).map((a) => {
      const embed = videoEmbed(a.url);
      return { label: a.label, url: a.url, video: embed ? this.#sanitizer.bypassSecurityTrustResourceUrl(embed) : null };
    }),
  );

  protected readonly longDay = longDay;

  open(o: Occurrence): void {
    this.confirming.set(false);
    this.occurrence.set(o);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    // A click on the backdrop lands on the <dialog> itself, outside its content.
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected mark(n: number): string {
    return FORMAT_MARK.format(n);
  }

  protected downloadIcs(e: CalendarEvent): void {
    const url = URL.createObjectURL(new Blob([toIcs(e)], { type: 'text/calendar;charset=utf-8' }));
    const a = this.#document.createElement('a');
    a.href = url;
    a.download = `${e.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'evenement'}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
