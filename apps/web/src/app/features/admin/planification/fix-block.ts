import { Component, computed, inject, resource } from '@angular/core';
import { addDays } from '@cdls/shared';
import { ApiClient } from '../../../core/api/api-client';
import { SchoolClock } from '../../../core/clock/school-clock';
import { HomeBlock } from '../../../shared/components/home-block';
import { Badge } from '../../../shared/ui';
import { blockState, bothOf, snapshotOf } from '../../../shared/utils/block-state';
import { plural } from '../../../shared/utils/format';
import { PlannerData } from './planner-data';
import { FIX_DAYS, fixView, missingTotal } from './planner-views';

/**
 * « À régler »: what needs the planner in the next two weeks: the stored timetable's warnings and the classes
 * that still miss hours. Two sessions can never share a room or a teacher (the database refuses it), so these
 * are the things left to decide. The class list comes from the timetable summary; the block waits for both and fails with either.
 */
@Component({
  selector: 'app-fix-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="À régler"
      headingId="bloc-a-regler"
      [state]="s"
      link="/admin/emploi-du-temps"
      linkLabel="Régler les conflits"
      loadingLabel="Recherche des points à régler…"
      emptyText="Rien à régler pour les deux semaines à venir. L’emploi du temps tient."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <p class="fix__count">
          <cdls-badge tone="danger">{{
            total(s.data.warningCount, s.data.incompleteCount)
          }}</cdls-badge>
        </p>
        @if (s.data.warnings.length) {
          <div class="fix__part">
            <h3 class="fix__title" id="bloc-a-regler-alertes">
              Alertes des {{ days }} prochains jours
            </h3>
            <ul class="list" role="list" aria-labelledby="bloc-a-regler-alertes">
              @for (w of s.data.warnings; track $index) {
                <li>
                  <div class="list__main">
                    <p>{{ w.label }}</p>
                    <p class="list__meta">{{ w.message }}</p>
                  </div>
                </li>
              }
            </ul>
            @if (s.data.more > 0) {
              <p class="list__meta">
                et {{ plural(s.data.more, 'autre alerte', 'autres alertes') }}
              </p>
            }
          </div>
        }
        @if (s.data.incomplete.length) {
          <div class="fix__part">
            <h3 class="fix__title" id="bloc-a-regler-heures">Heures à placer</h3>
            <ul class="list" role="list" aria-labelledby="bloc-a-regler-heures">
              @for (c of s.data.incomplete; track c.classId) {
                <li>
                  <div class="list__main">
                    <p>{{ c.label }}</p>
                    <p class="list__meta">{{ hours(c.missing) }}</p>
                  </div>
                  <p class="fix__hours tabular">{{ total2(c) }} h</p>
                </li>
              }
            </ul>
            @if (s.data.incompleteCount > s.data.incomplete.length) {
              <p class="list__meta">
                et {{ plural(s.data.incompleteCount - s.data.incomplete.length, 'autre classe') }}
              </p>
            }
          </div>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .fix__count,
    .fix__part p {
      margin: 0;
    }
    .fix__part {
      display: grid;
      gap: var(--space-2);
    }
    .fix__title {
      margin: 0;
      font-size: var(--text-label-m);
      font-weight: 600;
      color: var(--color-heading);
    }
    .fix__hours {
      flex: none;
      font-weight: 600;
      color: var(--color-heading);
    }
  `,
})
export class FixBlock {
  readonly #api = inject(ApiClient);
  readonly #clock = inject(SchoolClock);
  readonly #data = inject(PlannerData);

  protected readonly days = FIX_DAYS;
  protected readonly plural = plural;

  readonly #warnings = resource({
    params: () => this.#clock.today(),
    loader: ({ params: today }) =>
      this.#api.planner.warnings({ from: today, to: addDays(today, FIX_DAYS - 1) }),
  });

  /** Both sources must have answered: « Rien à régler » is only true when the classes were looked at too. */
  protected readonly state = computed(() =>
    blockState(
      bothOf(snapshotOf(this.#warnings), snapshotOf(this.#data.timetables)),
      ([warnings, timetables]) => fixView(warnings, timetables),
    ),
  );

  protected reload(): void {
    this.#warnings.reload();
    this.#data.timetables.reload();
  }

  protected total(warnings: number, classes: number): string {
    const parts = [
      warnings ? plural(warnings, 'alerte') : '',
      classes ? plural(classes, 'classe incomplète', 'classes incomplètes') : '',
    ].filter(Boolean);
    return parts.join(' et ');
  }

  protected hours(missing: readonly { subjectName: string; missingHours: number }[]): string {
    return missing.map((m) => `${m.subjectName} (${m.missingHours} h)`).join(', ');
  }

  protected total2(c: Parameters<typeof missingTotal>[0]): string {
    return String(Math.round(missingTotal(c) * 100) / 100);
  }
}
