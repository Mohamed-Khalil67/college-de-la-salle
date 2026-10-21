import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import type { AttendanceSheetDto, AttendanceStatus } from '@cdls/shared';
import { ApiClient, apiMessage } from '../../core/api/api-client';
import { Alert, Button } from '../../ui';
import { LoadState } from '../../eleve/shared/load-state';
import { eventTargetLine } from '../../groupes/groups-logic';
import { rollCounts, rollSentence } from '../shared/teacher';
import { RollItem } from './roll-item';

interface Entry {
  readonly status: AttendanceStatus;
  readonly note: string;
}
type Entries = Readonly<Record<string, Entry | undefined>>;
const PRESENT: Entry = { status: 'present', note: '' };

/** The roll of one class session on one day: statuses, notes, live counts and save. */
@Component({
  selector: 'app-roll-call',
  imports: [Alert, Button, LoadState, RollItem],
  template: `
    <app-load-state [ref]="sheet" label="Chargement de la liste des élèves…" />
    @if (sheet.hasValue()) {
      <p class="t-body-s roll__target">
        <b>Séance pour :</b> {{ targetLine() }}.
        @if (!sheet.value().event.target.whole) {
          Les autres élèves de la classe ne sont pas concernés et n’apparaissent pas.
        }
      </p>
      <form aria-labelledby="roll-title" (submit)="save($event)">
        <div class="toolbar">
          <h2 id="roll-title" class="visually-hidden">Liste des élèves</h2>
          <p class="toolbar__status roll__counts" aria-live="polite">
            <span><b>{{ counts().present }}</b> {{ counts().present > 1 ? 'présents' : 'présent' }}</span>
            <span><b>{{ counts().absent }}</b> {{ counts().absent > 1 ? 'absents' : 'absent' }}</span>
            <span><b>{{ counts().late }}</b> en retard</span>
            <span><b>{{ counts().excused }}</b> {{ counts().excused > 1 ? 'excusés' : 'excusé' }}</span>
          </p>
          <button cdlsButton variant="secondary" size="sm" type="button" (click)="allPresent()">Marquer tout le monde présent</button>
          <button cdlsButton size="sm" type="submit">{{ busy() ? 'Enregistrement…' : 'Enregistrer l’appel' }}</button>
        </div>
        @if (failure()) {
          <cdls-alert tone="danger">{{ failure() }}</cdls-alert>
        }
        @if (notice()) {
          <cdls-alert tone="success">{{ notice() }}</cdls-alert>
        }
        @if (!sheet.value().rows.length) {
          <p class="t-muted">Aucun élève inscrit dans cette classe.</p>
        }
        <ol class="roll" role="list">
          @for (row of sheet.value().rows; track row.student.id) {
            <li
              app-roll-item
              [student]="row.student"
              [status]="entries()[row.student.id]?.status ?? 'present'"
              (statusChange)="set(row.student.id, { status: $event })"
              [note]="entries()[row.student.id]?.note ?? ''"
              (noteChange)="set(row.student.id, { note: $event })"
            ></li>
          }
        </ol>
      </form>
    }
  `,
  styles: `
    .roll__target {
      margin-bottom: var(--space-3);
    }
  `,
})
export class RollCall {
  readonly eventId = input.required<string>();
  readonly date = input.required<string>();

  readonly #api = inject(ApiClient);
  protected readonly sheet = resource({
    params: () => ({ eventId: this.eventId(), date: this.date() }),
    loader: ({ params }) => this.#api.attendance.sheet(params.eventId, params.date),
  });

  /** Unrecorded students start present (the usual case). */
  protected readonly entries = linkedSignal<Entries>(() =>
    Object.fromEntries(
      (this.sheet.hasValue() ? this.sheet.value().rows : []).map((r) => [
        r.student.id,
        { status: r.record?.status ?? 'present', note: r.record?.note ?? '' },
      ]),
    ),
  );
  protected readonly targetLine = computed(() => eventTargetLine(this.sheet.hasValue() ? this.sheet.value().event.target : null));
  protected readonly counts = computed(() => rollCounts(Object.values(this.entries()).map((e) => e?.status ?? 'present')));

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected set(studentId: string, change: Partial<Entry>): void {
    this.notice.set(null);
    this.entries.update((all) => ({ ...all, [studentId]: { ...(all[studentId] ?? PRESENT), ...change } }));
  }

  protected allPresent(): void {
    this.notice.set(null);
    this.entries.update((all) => Object.fromEntries(Object.entries(all).map(([id, e]) => [id, { ...(e ?? PRESENT), status: 'present' as const }])));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      const records = Object.entries(this.entries()).map(([studentId, e]) => ({ studentId, status: e?.status ?? 'present', note: (e?.note ?? '').trim() }));
      const saved: AttendanceSheetDto = await this.#api.attendance.save(this.eventId(), { date: this.date(), records });
      this.sheet.set(saved);
      this.notice.set(`Appel enregistré : ${rollSentence(this.counts())}.`);
    } catch (error) {
      this.failure.set(`L’appel n’a pas été enregistré. ${apiMessage(error)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
