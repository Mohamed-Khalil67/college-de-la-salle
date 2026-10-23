import { Component, computed, inject, resource, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { webcalUrl } from '@cdls/shared';
import { apiMessage, ApiClient } from '../core/api/api-client';
import { LoadState } from '../eleve/shared/load-state';
import { feedStatus } from '../notifications/notification-view';
import { Alert, Button, Icon, Modal } from '../ui';

/**
 * « Synchroniser mon agenda » (student and teacher spaces): one secret link that Google Agenda, Apple
 * Calendrier or Outlook subscribe to, so the timetable, exams, homework and holidays follow the school's
 * changes. The link is shown once, when it is made (the server keeps only a hash); a lost link is replaced,
 * which also stops the old one. Revoking stops it for good.
 */
@Component({
  selector: 'app-agenda-sync-page',
  imports: [LoadState, Alert, Button, Icon, Modal],
  template: `
    <div class="page__header">
      <div class="page__header-text">
        <h1 class="t-h1">Synchroniser mon agenda</h1>
        <p class="t-muted">
          Retrouvez vos cours, examens, devoirs et jours sans cours dans Google Agenda, Apple
          Calendrier ou Outlook. Une séance annulée ou déplacée y change toute seule.
        </p>
      </div>
    </div>

    <div class="sync-layout">
      <section class="card card--panel" aria-labelledby="sync-link-title">
        <h2 id="sync-link-title" class="t-h3">Votre lien personnel</h2>
        <app-load-state [ref]="feed" label="Chargement de l’état de votre lien…" />
        @if (feed.hasValue()) {
          <p role="status">{{ status() }}</p>

          @if (failure()) {
            <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
          }

          @if (address(); as url) {
            <div class="field">
              <label class="field__label" for="sync-url">Adresse à coller dans votre agenda</label>
              <div class="sync-copy">
                <input
                  id="sync-url"
                  class="field__control"
                  type="text"
                  readonly
                  [value]="url"
                  aria-describedby="sync-url-help"
                  (focus)="select($event)"
                />
                <button cdlsButton variant="secondary" type="button" (click)="copy(url)">
                  <cdls-icon name="file-text" /> Copier le lien
                </button>
              </div>
              <p class="field__helper" id="sync-url-help">
                Ce lien est secret : il donne accès à votre agenda sans mot de passe. Ne le partagez
                pas. Il ne sera plus affiché après cette page ; si vous le perdez, créez-en un
                nouveau.
              </p>
            </div>
            <p>
              <a [href]="webcal(url)">Ouvrir dans mon application d’agenda (Apple, Outlook)</a>
            </p>
          } @else if (feed.value().active) {
            <p class="t-muted">
              Pour des raisons de sécurité, le lien n’est affiché qu’à sa création. Si vous ne
              l’avez plus, créez-en un nouveau : l’ancien cessera de fonctionner.
            </p>
          }

          <p class="sync-actions">
            <button cdlsButton type="button" [disabled]="busy()" (click)="create()">
              {{ feed.value().active ? 'Créer un nouveau lien' : 'Créer mon lien' }}
            </button>
            @if (feed.value().active) {
              <button
                cdlsButton
                variant="danger"
                type="button"
                [disabled]="busy()"
                (click)="confirmOpen.set(true)"
              >
                Désactiver le lien
              </button>
            }
          </p>
          @if (copied()) {
            <cdls-alert tone="success">{{ copied() }}</cdls-alert>
          }
        }
      </section>

      <section class="card card--panel" aria-labelledby="sync-how-title">
        <h2 id="sync-how-title" class="t-h3">Ajouter le lien à votre agenda</h2>
        <details class="sync-how">
          <summary>Google Agenda <cdls-icon name="chevron-down" /></summary>
          <ol>
            <li>
              Sur ordinateur, ouvrez Google Agenda, puis « Autres agendas » (le signe +) à gauche.
            </li>
            <li>Choisissez « À partir de l’URL », collez le lien, puis « Ajouter l’agenda ».</li>
          </ol>
          <p class="t-muted">
            Google met à jour les agendas importés par lien toutes les quelques heures : un
            changement peut mettre jusqu’à une journée à apparaître.
          </p>
        </details>
        <details class="sync-how">
          <summary>Apple Calendrier (iPhone, iPad, Mac) <cdls-icon name="chevron-down" /></summary>
          <ol>
            <li>
              iPhone ou iPad : Réglages, Calendrier, Comptes, « Ajouter un compte », « Autre », puis
              « Ajouter un calendrier avec abonnement ».
            </li>
            <li>Mac : dans Calendrier, menu Fichier, « Nouvel abonnement à un calendrier ».</li>
            <li>Collez le lien et validez. Réglez « Actualiser » sur « Toutes les heures ».</li>
          </ol>
        </details>
        <details class="sync-how">
          <summary>Outlook <cdls-icon name="chevron-down" /></summary>
          <ol>
            <li>
              Sur outlook.com ou Outlook sur le web : Calendrier, « Ajouter un calendrier », «
              S’abonner à partir du web ».
            </li>
            <li>
              Collez le lien, donnez un nom à l’agenda (par exemple « Collège de la Salle »), puis «
              Importer ».
            </li>
            <li>
              Outlook pour ordinateur : Fichier, « Paramètres du compte », onglet « Calendriers
              Internet », « Nouveau ».
            </li>
          </ol>
        </details>
        <p class="t-muted">
          L’agenda couvre le dernier mois et les six mois à venir. Seules les séances et les
          événements qui vous concernent y figurent.
        </p>
      </section>
    </div>

    <cdls-modal title="Désactiver le lien ?" [(open)]="confirmOpen">
      <p>
        Votre agenda cessera de se mettre à jour : les séances déjà ajoutées y restent jusqu’à ce
        que vous supprimiez l’abonnement. Vous pourrez créer un nouveau lien à tout moment.
      </p>
      <div class="modal__footer">
        <button cdlsButton variant="secondary" type="button" (click)="confirmOpen.set(false)">
          Garder le lien
        </button>
        <button cdlsButton variant="danger" type="button" [disabled]="busy()" (click)="revoke()">
          Désactiver le lien
        </button>
      </div>
    </cdls-modal>
  `,
  styles: `
    .sync-layout {
      display: grid;
      gap: var(--space-6);
      align-items: start;
    }
    @media (min-width: 64rem) {
      .sync-layout {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .sync-copy {
      display: grid;
      gap: var(--space-3);
    }
    @media (min-width: 40rem) {
      .sync-copy {
        grid-template-columns: minmax(0, 1fr) auto;
      }
    }
    .sync-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .sync-how {
      border-top: 1px solid var(--color-line);
      padding-block: var(--space-3);
    }
    .sync-how summary {
      cursor: pointer;
      min-height: 2.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      list-style: none;
      font-weight: 600;
      color: var(--color-heading);
    }
    .sync-how summary::-webkit-details-marker {
      display: none;
    }
    .sync-how[open] summary cdls-icon {
      rotate: 180deg;
    }
    .sync-how ol {
      padding-inline-start: var(--space-6);
      list-style: decimal;
      display: grid;
      gap: var(--space-2);
      margin-block: var(--space-2);
    }
  `,
})
export class AgendaSyncPage {
  readonly #api = inject(ApiClient);
  protected readonly feed = resource({ loader: () => this.#api.calendarFeed.status() });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly copied = signal('');
  protected readonly confirmOpen = signal(false);
  /** The address of the link just made: the only moment it exists on this side. */
  protected readonly address = signal<string | null>(null);
  readonly #now = signal(new Date());

  protected readonly status = computed(() =>
    this.feed.hasValue() ? feedStatus(this.feed.value(), this.#now()) : '',
  );

  readonly #sanitizer = inject(DomSanitizer);
  /**
   * `webcal://` opens the calendar app; Angular's sanitizer only lets http(s) links through, so it is
   * trusted here: the address is the one our own API just returned, never user input.
   */
  protected readonly webcal = (url: string) =>
    this.#sanitizer.bypassSecurityTrustUrl(webcalUrl(url));

  protected async create(): Promise<void> {
    await this.#run(async () => {
      const made = await this.#api.calendarFeed.create();
      this.address.set(made.url);
      this.feed.set({
        active: made.active,
        createdAt: made.createdAt,
        lastUsedAt: made.lastUsedAt,
      });
    });
  }

  protected async revoke(): Promise<void> {
    await this.#run(async () => {
      await this.#api.calendarFeed.revoke();
      this.address.set(null);
      this.feed.set({ active: false, createdAt: null, lastUsedAt: null });
      this.confirmOpen.set(false);
    });
  }

  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set('Lien copié. Collez-le dans votre application d’agenda.');
    } catch {
      this.copied.set(
        'La copie a échoué : sélectionnez le lien dans le champ et copiez-le avec Ctrl+C.',
      );
    }
  }

  protected select(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  async #run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.copied.set('');
    try {
      await work();
      this.#now.set(new Date());
    } catch (error) {
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
