import { inject, Injectable, resource } from '@angular/core';
import { ApiClient } from '../../../core/api/api-client';

/**
 * What several blocks of the planner's page read: the completeness of the timetable (« À régler » and
 * « Emplois du temps »). Provided by the page, so one request serves both blocks.
 */
@Injectable()
export class PlannerData {
  readonly #api = inject(ApiClient);
  readonly timetables = resource({ loader: () => this.#api.planner.timetables() });
}
