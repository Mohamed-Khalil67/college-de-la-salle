import { isPlatformBrowser } from '@angular/common';
import { Injector, PLATFORM_ID, Service, computed, inject, signal, type Signal } from '@angular/core';
import { AuthStore } from '@exam/data-access-auth';
import {
  type ContentPage,
  COLLECTIONS,
  type PageId,
  PAGE_IDS,
  sanitizePage,
} from '@exam/contracts';
import { DEFAULT_PAGES } from './content.defaults';

/** The editable parts of a page; identity and audit fields are managed by the store. */
export type ContentPatch = Partial<
  Pick<ContentPage, 'hero' | 'summary' | 'timeline' | 'chapters' | 'resources' | 'announcements'>
>;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Pages = Readonly<Partial<Record<PageId, ContentPage>>>;

/**
 * Portal content as signals.
 *
 * Every page resolves in three layers: an optimistic local edit (while a save is in flight), then
 * the live Firestore document, then the bundled default. Public pages therefore prerender with
 * real content, hydrate without a flash, and pick up teacher edits live. Firestore is loaded
 * lazily, in the browser only, after the first render — it never touches the initial bundle.
 */
@Service()
export class ContentStore {
  readonly #injector = inject(Injector);
  readonly #auth = inject(AuthStore);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #remote = signal<Pages>({});
  readonly #local = signal<Pages>({});
  readonly #views = new Map<PageId, Signal<ContentPage>>();
  #connected = false;

  readonly #status = signal<SaveStatus>('idle');
  readonly #error = signal<string | null>(null);
  /** State of the latest save, for the teacher toolbar's live region. */
  readonly status = this.#status.asReadonly();
  readonly error = this.#error.asReadonly();

  /** The page to render: optimistic edit → live document → bundled default. */
  page(id: PageId): Signal<ContentPage> {
    let view = this.#views.get(id);
    if (!view) {
      view = computed(() => this.#local()[id] ?? this.#remote()[id] ?? DEFAULT_PAGES[id]);
      this.#views.set(id, view);
    }
    return view;
  }

  /** True when the page still shows the bundled default (never saved by a teacher). */
  isDefault(id: PageId): Signal<boolean> {
    const view = this.page(id);
    return computed(() => view().updatedAt === null);
  }

  /** Starts the live Firestore listener (browser only, idempotent). */
  async connect(): Promise<void> {
    if (!this.#browser || this.#connected) return;
    this.#connected = true;
    try {
      const [{ FIRESTORE }, { collection, onSnapshot }] = await Promise.all([
        import('@exam/data-access-auth/data'),
        import('firebase/firestore'),
      ]);
      const db = this.#injector.get(FIRESTORE);
      onSnapshot(
        collection(db, COLLECTIONS.contentPages),
        (snap) => {
          const next: Partial<Record<PageId, ContentPage>> = {};
          for (const doc of snap.docs) {
            const id = PAGE_IDS.find((p) => p === doc.id);
            if (!id) continue;
            const data = doc.data({ serverTimestamps: 'estimate' });
            const at = data['updatedAt'];
            next[id] = sanitizePage(
              { ...data, updatedAt: typeof at?.toMillis === 'function' ? at.toMillis() : null },
              DEFAULT_PAGES[id],
            );
          }
          this.#remote.set(next);
        },
        // Offline or blocked: the bundled defaults keep the site fully usable.
        () => this.#remote.set({}),
      );
    } catch {
      this.#connected = false;
    }
  }

  /**
   * Saves an edit. The page updates instantly (optimistic); if the write is rejected the change is
   * rolled back and the error is rethrown so the editor can show it.
   */
  async save(id: PageId, patch: ContentPatch): Promise<void> {
    const uid = this.#auth.uid();
    if (!uid || !this.#auth.isTeacher()) throw new Error('NOT_TEACHER');

    const before = this.page(id)();
    const next = sanitizePage({ ...before, ...patch }, DEFAULT_PAGES[id]);
    this.#local.update((pages) => ({ ...pages, [id]: { ...next, updatedAt: Date.now(), updatedBy: uid } }));
    this.#status.set('saving');
    this.#error.set(null);

    try {
      const [{ FIRESTORE }, { doc, serverTimestamp, setDoc }] = await Promise.all([
        import('@exam/data-access-auth/data'),
        import('firebase/firestore'),
      ]);
      await setDoc(doc(this.#injector.get(FIRESTORE), COLLECTIONS.contentPages, id), {
        id,
        lang: next.lang,
        hero: next.hero,
        summary: next.summary,
        timeline: next.timeline,
        chapters: next.chapters,
        resources: next.resources,
        announcements: next.announcements,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      // Promote the optimistic copy so the page doesn't flicker while the snapshot catches up.
      this.#remote.update((pages) => ({ ...pages, [id]: { ...next, updatedAt: Date.now(), updatedBy: uid } }));
      this.#status.set('saved');
    } catch (error) {
      this.#status.set('error');
      this.#error.set(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.#local.update(({ [id]: _dropped, ...rest }) => rest);
    }
  }
}
