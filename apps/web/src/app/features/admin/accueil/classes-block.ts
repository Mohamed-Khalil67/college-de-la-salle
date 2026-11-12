import { Component, computed, inject, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';
import { HomeBlock } from '../../../shared/components/home-block';
import { SchoolYears } from '../../../shared/data/school-years';
import { Badge } from '../../../shared/ui';
import { blockState, bothOf, type Snapshot, snapshotOf } from '../../../shared/utils/block-state';
import { plural } from '../../../shared/utils/format';
import { classesView } from './admin-home-views';

/**
 * « Classes »: how many classes the current year has, their average size and the students no class holds.
 * The number of students is a bonus: when it cannot be read the first two figures still show.
 */
@Component({
  selector: 'app-classes-block',
  imports: [Badge, HomeBlock],
  template: `
    @let s = state();
    <app-home-block
      heading="Classes"
      headingId="bloc-classes"
      [state]="s"
      link="classes"
      linkLabel="Classes et inscriptions"
      loadingLabel="Chargement des classes…"
      emptyText="Aucune classe cette année. Créez la première pour inscrire des élèves."
      (retry)="reload()"
    >
      @if (s.status === 'ready') {
        <div class="classes__figures">
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.classCount }}</span>
            <span class="stat__label">{{ s.data.classCount > 1 ? 'classes' : 'classe' }}</span>
          </p>
          <p class="stat">
            <span class="stat__value tabular">{{ s.data.averageSize }}</span>
            <span class="stat__label">élèves par classe en moyenne</span>
          </p>
        </div>
        @if (s.data.withoutClass; as without) {
          <p class="classes__without">
            <cdls-badge tone="warning">{{ plural(without, 'élève') }} sans classe</cdls-badge>
          </p>
        }
      }
    </app-home-block>
  `,
  styles: `
    :host {
      display: contents;
    }
    .classes__figures {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-8);
    }
    .classes__figures p,
    .classes__without {
      margin: 0;
    }
  `,
})
export class ClassesBlock {
  readonly #api = inject(ApiClient);
  readonly #years = inject(SchoolYears);

  readonly #classes = resource({
    params: () => (this.#years.settled() ? { yearId: this.#years.year()?.id } : undefined),
    loader: ({ params }) => this.#api.school.classes({ schoolYearId: params.yearId }),
  });
  readonly #students = resource({
    loader: () => this.#api.users.list({ role: 'student', status: 'active', pageSize: 1 }),
  });

  protected readonly state = computed(() => {
    const students = snapshotOf(this.#students);
    const settled: Snapshot<number | null> = students.error
      ? { error: undefined, value: null }
      : { error: undefined, value: students.value ? students.value.total : undefined };
    return blockState(bothOf(snapshotOf(this.#classes), settled), ([classes, count]) => classesView(classes, count));
  });

  protected readonly plural = plural;

  protected reload(): void {
    if (this.#years.years.error()) this.#years.reload();
    this.#classes.reload();
    this.#students.reload();
  }
}
