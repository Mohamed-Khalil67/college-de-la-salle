import { Injectable, computed, inject } from '@angular/core';
import { COLLECTIONS, type Invitation } from '@exam/contracts';
import { collection, query, where } from 'firebase/firestore';
import { AuthStore } from '@exam/data-access-auth';
import { FIRESTORE, firestoreQueryResource } from '@exam/data-access-auth/data';
import { invitationConverter } from './firestore-converters';

/**
 * Exams the signed-in candidate is invited to (live). Rules only release invitations whose email
 * matches the caller's VERIFIED email, which is exactly what this query asks for.
 */
@Injectable()
export class CandidateInvitationsStore {
  readonly #db = inject(FIRESTORE);
  readonly #auth = inject(AuthStore);

  readonly #invitations = firestoreQueryResource<Invitation, string>({
    params: () => this.#auth.verifiedEmail() ?? undefined,
    query: (email) =>
      query(
        collection(this.#db, COLLECTIONS.invitations).withConverter(invitationConverter),
        where('email', '==', email),
        where('status', '==', 'PUBLISHED'),
      ),
  });

  readonly invitations = computed(() =>
    [...this.#invitations.value()].sort((a, b) => a.window.closesAt - b.window.closesAt),
  );
  readonly loading = this.#invitations.isLoading;
  readonly error = this.#invitations.error;
}
