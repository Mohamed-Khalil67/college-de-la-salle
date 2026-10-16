import { Service, computed, signal } from '@angular/core';
import { GALLERY, NEWS, SCHOOL, SUBJECTS, TRACKS } from './curriculum.data';
import { isSubjectId, type Subject, type Track } from './curriculum.model';

/**
 * Curriculum, school profile, news and gallery as signals. Static and synchronous, so every public
 * page renders completely on the server (prerender) and hydrates without a refetch.
 */
@Service()
export class CurriculumStore {
  readonly school = signal(SCHOOL).asReadonly();
  readonly tracks = signal(TRACKS).asReadonly();
  readonly subjects = signal(SUBJECTS).asReadonly();
  readonly gallery = signal(GALLERY).asReadonly();
  /** Newest first. */
  readonly news = computed(() => [...NEWS].sort((a, b) => b.date.localeCompare(a.date)));

  readonly #byId = computed(() => new Map(this.subjects().map((s) => [s.id, s])));

  subject(id: string): Subject | null {
    return isSubjectId(id) ? (this.#byId().get(id) ?? null) : null;
  }

  tracksFor(subject: Subject): readonly Track[] {
    return this.tracks().filter((t) => subject.tracks.includes(t.id));
  }
}
