import { Component, ElementRef, Injector, afterNextRender, effect, inject, model, output, signal, untracked, viewChild } from '@angular/core';
import type { ImportUsersError, ImportUsersResponse } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Icon, Modal } from '../../ui';
import { createdAccountsCsv, IMPORT_TEMPLATE, importErrors, plural, ROLE_LABELS } from '../shared/admin-format';
import { saveText } from '../shared/download';

/**
 * CSV import, all or nothing: either every row is created (with its temporary password, shown once)
 * or nothing is, and the refused lines are listed.
 */
@Component({
  selector: 'app-users-import-modal',
  imports: [Modal, Alert, Button, Icon],
  template: `
    <cdls-modal title="Importer des comptes" [(open)]="open">
      <div class="stack" #body tabindex="-1">
        @if (result(); as done) {
          <cdls-alert tone="warning">
            <strong>{{ createdLabel() }}</strong> Voici les mots de passe temporaires. Ils ne seront plus affichés :
            téléchargez la liste maintenant et remettez chaque mot de passe en main propre.
          </cdls-alert>
          <div class="table-wrap" role="region" aria-labelledby="import-caption" tabindex="0">
            <table class="table table--stack">
              <caption id="import-caption" class="visually-hidden">Comptes créés et mots de passe temporaires</caption>
              <thead>
                <tr><th scope="col">Adresse e-mail</th><th scope="col">Type</th><th scope="col">Mot de passe</th></tr>
              </thead>
              <tbody>
                @for (account of done.created; track account.email) {
                  <tr>
                    <th scope="row">{{ account.email }}</th>
                    <td data-label="Type :">{{ roleLabels[account.role].one }}</td>
                    <td data-label="Mot de passe :"><code>{{ account.temporaryPassword }}</code></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="modal__footer">
            <button cdlsButton variant="secondary" type="button" (click)="downloadPasswords()">
              <cdls-icon name="download" />Télécharger la liste (CSV)
            </button>
            <button cdlsButton type="button" (click)="open.set(false)">Terminé</button>
          </div>
        } @else {
          <form class="stack" novalidate (submit)="onSubmit($event)">
            <p>
              Un fichier CSV en UTF-8, une ligne par compte, avec l’en-tête
              <code>email,firstName,lastName,role,studentNumber,section,class</code>.
            </p>
            <ul class="t-body-s">
              <li><code>role</code> : <code>student</code>, <code>teacher</code> ou <code>admin</code>.</li>
              <li>
                Pour un élève, <code>section</code> (<code>nationale</code> ou <code>bac</code>) et <code>class</code> (le code de la
                classe, par exemple <code>seconde</code>) sont obligatoires ; le matricule est facultatif.
              </li>
              <li>Si une ligne est invalide, aucun compte n’est créé.</li>
            </ul>
            <div>
              <button cdlsButton variant="tertiary" size="sm" type="button" (click)="downloadTemplate()">
                <cdls-icon name="download" />Télécharger le modèle CSV
              </button>
            </div>
            <div class="field">
              <label class="field__label" for="import-file">Fichier CSV</label>
              <input
                #fileInput
                class="field__control"
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                aria-describedby="import-file-help"
                [attr.aria-invalid]="fileError() ? 'true' : null"
                (change)="onFile($event)"
              />
              <p class="field__helper" id="import-file-help">1 Mo et 2 000 lignes au plus.</p>
              @if (fileError()) {
                <p class="field__error"><cdls-icon name="alert" /><span>{{ fileError() }}</span></p>
              }
            </div>
            @if (lineErrors().length) {
              <cdls-alert tone="danger">
                <p><strong>Import refusé : aucun compte n’a été créé.</strong> Corrigez ces lignes puis importez de nouveau le fichier.</p>
                <ul class="line-errors">
                  @for (item of lineErrors(); track $index) {
                    <li>Ligne {{ item.line }} : {{ item.message }}</li>
                  }
                </ul>
              </cdls-alert>
            } @else if (failure()) {
              <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
            }
            <div class="modal__footer">
              <button cdlsButton variant="secondary" type="button" (click)="open.set(false)">Annuler</button>
              <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Import…' : 'Importer' }}</button>
            </div>
          </form>
        }
      </div>
    </cdls-modal>
  `,
  styles: `
    ul {
      padding-left: var(--space-6);
    }
    .line-errors {
      max-height: 12rem;
      overflow-y: auto;
      margin-top: var(--space-2);
    }
    [tabindex='-1']:focus {
      outline: none;
    }
  `,
})
export class UsersImportModal {
  readonly open = model(false);
  readonly imported = output<number>();

  readonly #api = inject(ApiClient);
  readonly #injector = inject(Injector);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly lineErrors = signal<readonly ImportUsersError[]>([]);
  protected readonly result = signal<ImportUsersResponse | null>(null);
  protected readonly createdLabel = signal('');

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.result.set(null);
        this.file.set(null);
        this.fileError.set(null);
        this.failure.set(null);
        this.lineErrors.set([]);
        const input = this.fileInput()?.nativeElement;
        if (input) input.value = '';
      });
    });
  }

  protected onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    this.fileError.set(null);
    this.lineErrors.set([]);
    this.failure.set(null);
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const file = this.file();
    if (!file) {
      this.fileError.set('Choisissez un fichier CSV.');
      this.fileInput()?.nativeElement.focus();
      return;
    }
    if (file.size > 1024 * 1024) {
      this.fileError.set('Le fichier dépasse 1 Mo : découpez-le en plusieurs imports.');
      return;
    }
    this.busy.set(true);
    this.failure.set(null);
    this.lineErrors.set([]);
    try {
      const result = await this.#api.users.import(file);
      this.createdLabel.set(`${plural(result.created.length, 'compte créé.', 'comptes créés.')}`);
      this.result.set(result);
      this.imported.emit(result.created.length);
      afterNextRender(() => this.body().nativeElement.focus(), { injector: this.#injector });
    } catch (error) {
      this.lineErrors.set(importErrors(error) ?? []);
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected downloadTemplate(): void {
    saveText(IMPORT_TEMPLATE, 'modele-import-comptes.csv');
  }

  protected downloadPasswords(): void {
    const result = this.result();
    if (result) saveText(createdAccountsCsv(result.created), 'comptes-crees.csv');
  }
}
