import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, model, output, signal, untracked, viewChild } from '@angular/core';
import { SECTION_LABELS, type ImportPreviewResponse, type ImportRole, type ImportUsersError, type ImportUsersResponse } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button, Icon, Modal, Segmented, type SegmentOption } from '../../ui';
import { createdAccountsCsv, formatDay, importErrors, importTemplate, plural, ROLE_LABELS } from '../shared/admin-format';
import { saveText } from '../shared/download';

type Step = 'choose' | 'preview' | 'done';

const ROLE_OPTIONS: readonly SegmentOption[] = [
  { value: 'student', label: 'Élèves' },
  { value: 'teacher', label: 'Enseignants' },
];

/**
 * Roster import in three steps: choose the file, check the preview (the generated school e-mails and any
 * line in error, nothing is created yet), then import: every account is created with a temporary password,
 * shown once. If one line is invalid, nothing is created.
 */
@Component({
  selector: 'app-users-import-modal',
  imports: [Modal, Alert, Button, Icon, Segmented],
  template: `
    <cdls-modal title="Importer une liste" [(open)]="open" [dismissible]="step() !== 'done' && !busy()">
      <div class="stack" #body tabindex="-1">
        @switch (step()) {
          @case ('done') {
            <cdls-alert tone="warning">
              <strong>{{ createdLabel() }}</strong> Voici les mots de passe temporaires. Ils ne seront plus affichés :
              téléchargez la liste maintenant et remettez chaque mot de passe en main propre. Chaque personne choisira
              son propre mot de passe à la première connexion.
            </cdls-alert>
            <div class="table-wrap" role="region" aria-labelledby="import-done-caption" tabindex="0">
              <table class="table table--stack">
                <caption id="import-done-caption" class="visually-hidden">Comptes créés et mots de passe temporaires</caption>
                <thead>
                  <tr><th scope="col">Nom</th><th scope="col">Adresse e-mail</th><th scope="col">Mot de passe</th></tr>
                </thead>
                <tbody>
                  @for (account of result()!.created; track account.email) {
                    <tr>
                      <th scope="row">{{ account.lastName }} {{ account.firstName }}</th>
                      <td data-label="Adresse e-mail :">{{ account.email }}</td>
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
          }
          @case ('preview') {
            @if (preview(); as checked) {
              @if (checked.errors.length) {
                <cdls-alert tone="danger">
                  <p><strong>Import impossible : {{ plural(checked.errors.length, 'ligne à corriger', 'lignes à corriger') }}.</strong>
                    Aucun compte n’a été créé. Corrigez le fichier puis vérifiez-le de nouveau.</p>
                  <ul class="line-errors">
                    @for (item of checked.errors; track $index) {
                      <li>Ligne {{ item.line }} : {{ item.message }}</li>
                    }
                  </ul>
                </cdls-alert>
              } @else {
                <cdls-alert tone="success">
                  <strong>{{ plural(checked.rows.length, 'compte sera créé', 'comptes seront créés') }}.</strong>
                  Vérifiez les adresses e-mail générées : rien n’est créé tant que vous n’avez pas confirmé.
                </cdls-alert>
              }
              @if (checked.rows.length) {
                <div class="table-wrap table-wrap--scroll" role="region" aria-labelledby="import-preview-caption" tabindex="0">
                  <table class="table table--stack">
                    <caption id="import-preview-caption" class="visually-hidden">Comptes qui seront créés avec leur adresse e-mail</caption>
                    <thead>
                      <tr>
                        <th scope="col">Ligne</th>
                        <th scope="col">Nom</th>
                        <th scope="col">Adresse e-mail générée</th>
                        @if (checked.role === 'student') {
                          <th scope="col">Section</th>
                          <th scope="col">Classe</th>
                          <th scope="col">Matricule</th>
                          <th scope="col">Naissance</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of checked.rows; track row.line) {
                        <tr>
                          <td data-label="Ligne :">{{ row.line }}</td>
                          <th scope="row">{{ row.lastName }} {{ row.firstName }}</th>
                          <td data-label="Adresse e-mail :">{{ row.email }}</td>
                          @if (checked.role === 'student') {
                            <td data-label="Section :">{{ row.sectionCode ? sections[row.sectionCode] : '—' }}</td>
                            <td data-label="Classe :">{{ row.classLabel ?? '—' }}</td>
                            <td data-label="Matricule :">{{ row.studentNumber ?? '—' }}</td>
                            <td data-label="Naissance :">{{ row.birthDate ? day(row.birthDate) : '—' }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
            @if (failure()) {
              <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
            }
            <div class="modal__footer">
              <button cdlsButton variant="secondary" type="button" (click)="backToChoose()">Changer de fichier</button>
              @if (canImport()) {
                <button cdlsButton type="button" [disabled]="busy()" (click)="confirm()">
                  {{ busy() ? 'Création…' : 'Créer ' + plural(preview()!.rows.length, 'compte', 'comptes') }}
                </button>
              }
            </div>
          }
          @default {
            <form class="stack" novalidate (submit)="onCheck($event)">
              <div class="stack stack--sm">
                <p class="field__label">Type de comptes</p>
                <cdls-segmented legend="Type de comptes à importer" [options]="roleOptions" [(value)]="roleValue" />
              </div>
              <p>
                Un fichier CSV en UTF-8, une ligne par personne, avec l’en-tête
                <code>{{ header() }}</code>.
              </p>
              <ul class="t-body-s">
                @if (role() === 'student') {
                  <li>
                    <code>section</code> : <code>nationale</code> ou <code>bac</code> ; <code>class</code> : le code de la classe,
                    par exemple <code>seconde</code>.
                  </li>
                  <li>Matricule et date de naissance (AAAA-MM-JJ ou JJ/MM/AAAA) sont facultatifs.</li>
                }
                <li>Les adresses e-mail sont créées pour vous : <code>prenom.nom&#64;</code> suivi du domaine du collège.</li>
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
                <p class="field__helper" id="import-file-help">1 Mo et 500 lignes au plus : découpez une liste plus longue en plusieurs fichiers.</p>
                @if (fileError()) {
                  <p class="field__error"><cdls-icon name="alert" /><span>{{ fileError() }}</span></p>
                }
              </div>
              @if (lineErrors().length) {
                <cdls-alert tone="danger">
                  <p><strong>Fichier refusé.</strong> Corrigez ces points puis choisissez de nouveau le fichier.</p>
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
                <button cdlsButton type="submit" [disabled]="busy()">{{ busy() ? 'Vérification…' : 'Vérifier le fichier' }}</button>
              </div>
            </form>
          }
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
    .table-wrap--scroll {
      max-height: 20rem;
      overflow-y: auto;
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
  protected readonly sections = SECTION_LABELS;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly roleValue = signal<string>('student');
  protected readonly role = computed<ImportRole>(() => (this.roleValue() === 'teacher' ? 'teacher' : 'student'));
  protected readonly header = computed(() => importTemplate(this.role()).split('\n')[0]);
  protected readonly plural = plural;

  protected readonly step = signal<Step>('choose');
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly lineErrors = signal<readonly ImportUsersError[]>([]);
  protected readonly preview = signal<ImportPreviewResponse | null>(null);
  protected readonly result = signal<ImportUsersResponse | null>(null);
  protected readonly createdLabel = signal('');
  protected readonly canImport = computed(() => {
    const checked = this.preview();
    return !!checked && checked.errors.length === 0 && checked.rows.length > 0;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.step.set('choose');
        this.result.set(null);
        this.preview.set(null);
        this.resetFile();
      });
    });
  }

  protected day(value: string): string {
    return formatDay(value);
  }

  private resetFile(): void {
    this.file.set(null);
    this.fileError.set(null);
    this.failure.set(null);
    this.lineErrors.set([]);
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  private focusBody(): void {
    afterNextRender(() => this.body().nativeElement.focus(), { injector: this.#injector });
  }

  protected onFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.fileError.set(null);
    this.lineErrors.set([]);
    this.failure.set(null);
  }

  protected backToChoose(): void {
    this.resetFile();
    this.preview.set(null);
    this.step.set('choose');
    this.failure.set(null);
    this.focusBody();
  }

  /** Step 1 → 2: the API checks every line and returns the generated e-mails; nothing is created. */
  protected async onCheck(event: Event): Promise<void> {
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
      const checked = await this.#api.users.previewImport(file, this.role());
      // A header problem (line 1) means the file cannot be read as a roster: stay on the choice step
      // with the list. Problems on data lines are shown in the preview.
      if (!checked.rows.length && checked.errors.length && checked.errors.every((e) => e.line === 1)) {
        this.lineErrors.set(checked.errors);
        return;
      }
      this.preview.set(checked);
      this.step.set('preview');
      this.focusBody();
    } catch (error) {
      this.lineErrors.set(importErrors(error) ?? []);
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Step 2 → 3: creates every account (all or nothing). */
  protected async confirm(): Promise<void> {
    const file = this.file();
    if (!file || !this.canImport()) return;
    this.busy.set(true);
    this.failure.set(null);
    try {
      const result = await this.#api.users.import(file, this.role());
      this.createdLabel.set(`${plural(result.created.length, 'compte créé.', 'comptes créés.')}`);
      this.result.set(result);
      this.step.set('done');
      this.imported.emit(result.created.length);
      this.focusBody();
    } catch (error) {
      const lines = importErrors(error);
      if (lines?.length) {
        // The roster changed since the preview (another account took an e-mail or number): check again.
        this.preview.set({ role: this.role(), rows: [], errors: lines });
      }
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected downloadTemplate(): void {
    saveText(importTemplate(this.role()), `modele-import-${this.role() === 'student' ? 'eleves' : 'enseignants'}.csv`);
  }

  protected downloadPasswords(): void {
    const result = this.result();
    if (result) saveText(createdAccountsCsv(result.created), 'comptes-crees.csv');
  }
}
