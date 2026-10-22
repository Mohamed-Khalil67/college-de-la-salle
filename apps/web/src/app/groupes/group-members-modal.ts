import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import type { GroupWithMembersDto, StudentSummaryDto } from '@cdls/shared';
import { ApiClient, apiMessage } from '../core/api/api-client';
import { Alert, Button, Modal } from '../ui';
import { memberLists, studentName } from './groups-logic';

/**
 * Who is in a group, with two lists and checkboxes (no dragging): the students who are not in the group,
 * which say where they are instead, and its members. « Ajouter » and « Retirer » act on the ticked students.
 * A student already in another group of the division is refused with the rule, unless « Déplacer » is ticked.
 */
@Component({
  selector: 'app-group-members-modal',
  imports: [Modal, Alert, Button],
  template: `
    <cdls-modal [title]="group() ? 'Élèves du groupe ' + group()!.label : 'Élèves du groupe'" [(open)]="open" (closed)="reset()">
      @if (group(); as g) {
        <div class="stack">
          <p class="t-body-s t-muted">
            Division « {{ g.division }} » : un élève n’est que dans un groupe de cette division. Cochez des élèves puis ajoutez-les ou retirez-les.
          </p>
          @if (failure()) {
            <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
          }
          @if (notice()) {
            <p class="members__notice" role="status">{{ notice() }}</p>
          }
          <div class="members">
            <fieldset class="members__list">
              <legend class="t-h3">Pas dans ce groupe ({{ lists().others.length }})</legend>
              @if (!lists().others.length) {
                <p class="t-muted">Tous les élèves de la classe sont dans ce groupe.</p>
              }
              <ul class="members__items" role="list">
                @for (c of lists().others; track c.student.id) {
                  <li>
                    <label class="check">
                      <input type="checkbox" [checked]="toAdd().has(c.student.id)" (change)="toggleAdd(c.student.id, $any($event.target).checked)" />
                      <span>
                        {{ name(c.student) }}
                        @if (c.elsewhere) {
                          <span class="t-muted">, déjà dans « {{ c.elsewhere.label }} »</span>
                        }
                      </span>
                    </label>
                  </li>
                }
              </ul>
              <label class="check members__move">
                <input type="checkbox" [checked]="move()" (change)="move.set($any($event.target).checked)" />
                <span>Déplacer ceux qui sont déjà dans un autre groupe « {{ g.division }} »</span>
              </label>
              <button cdlsButton size="sm" type="button" [disabled]="busy() || !toAdd().size" (click)="add()">
                Ajouter au groupe{{ toAdd().size ? ' (' + toAdd().size + ')' : '' }}
              </button>
            </fieldset>

            <fieldset class="members__list">
              <legend class="t-h3">Dans ce groupe ({{ lists().members.length }})</legend>
              @if (!lists().members.length) {
                <p class="t-muted">Personne pour l’instant. Ajoutez des élèves depuis la liste de gauche.</p>
              }
              <ul class="members__items" role="list">
                @for (s of lists().members; track s.id) {
                  <li>
                    <label class="check">
                      <input type="checkbox" [checked]="toRemove().has(s.id)" (change)="toggleRemove(s.id, $any($event.target).checked)" />
                      <span>{{ name(s) }}</span>
                    </label>
                  </li>
                }
              </ul>
              <button cdlsButton variant="secondary" size="sm" type="button" [disabled]="busy() || !toRemove().size" (click)="remove()">
                Retirer du groupe{{ toRemove().size ? ' (' + toRemove().size + ')' : '' }}
              </button>
            </fieldset>
          </div>
          <div class="modal__footer">
            <button cdlsButton type="button" (click)="open.set(false)">Terminé</button>
          </div>
        </div>
      }
    </cdls-modal>
  `,
  styles: `
    .members {
      display: grid;
      gap: var(--space-6);
      grid-template-columns: 1fr;
    }
    @media (min-width: 40rem) {
      .members {
        grid-template-columns: 1fr 1fr;
      }
    }
    .members__list {
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .members__items {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 16rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .members__notice {
      margin: 0;
      color: var(--color-success);
      font-weight: 600;
    }
  `,
})
export class GroupMembersModal {
  readonly open = model(false);
  readonly groupId = input<string | null>(null);
  readonly groups = input.required<readonly GroupWithMembersDto[]>();
  readonly roster = input.required<readonly StudentSummaryDto[]>();
  /** The groups changed: the page loads them again. */
  readonly changed = output<void>();

  readonly #api = inject(ApiClient);
  protected readonly group = computed(() => this.groups().find((g) => g.id === this.groupId()) ?? null);
  protected readonly lists = computed(() => {
    const g = this.group();
    return g ? memberLists(g, this.groups(), this.roster()) : { members: [], others: [] };
  });

  protected readonly toAdd = signal<ReadonlySet<string>>(new Set());
  protected readonly toRemove = signal<ReadonlySet<string>>(new Set());
  protected readonly move = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected name(s: StudentSummaryDto): string {
    return studentName(s);
  }

  protected toggleAdd(id: string, on: boolean): void {
    this.toAdd.update((set) => toggled(set, id, on));
  }
  protected toggleRemove(id: string, on: boolean): void {
    this.toRemove.update((set) => toggled(set, id, on));
  }

  protected reset(): void {
    this.toAdd.set(new Set());
    this.toRemove.set(new Set());
    this.move.set(false);
    this.failure.set(null);
    this.notice.set(null);
  }

  protected async add(): Promise<void> {
    const g = this.group();
    if (!g || this.busy() || !this.toAdd().size) return;
    const ids = [...this.toAdd()];
    await this.#run(
      () => this.#api.groups.addMembers(g.id, { studentIds: ids, move: this.move() }),
      ids.length === 1 ? `1 élève ajouté à ${g.label}.` : `${ids.length} élèves ajoutés à ${g.label}.`,
      () => this.toAdd.set(new Set()),
    );
  }

  protected async remove(): Promise<void> {
    const g = this.group();
    if (!g || this.busy() || !this.toRemove().size) return;
    const ids = [...this.toRemove()];
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      for (const id of ids) await this.#api.groups.removeMember(g.id, id);
      this.toRemove.set(new Set());
      this.notice.set(ids.length === 1 ? `1 élève retiré de ${g.label}.` : `${ids.length} élèves retirés de ${g.label}.`);
    } catch (error) {
      this.failure.set(`Le retrait n’a pas abouti. ${apiMessage(error)}`);
    } finally {
      this.busy.set(false);
      this.changed.emit();
    }
  }

  async #run(work: () => Promise<unknown>, done: string, after: () => void): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      await work();
      after();
      this.notice.set(done);
    } catch (error) {
      // The API says which student is where, and the one-group rule with the way out.
      this.failure.set(apiMessage(error));
    } finally {
      this.busy.set(false);
      this.changed.emit();
    }
  }
}

function toggled(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}
