/** Student space model. Pure types and helpers: no Angular, no Firebase. */

export type SectionId = 'nationale' | 'bac';

export interface ClassOption {
  readonly value: string;
  readonly label: string;
}

/** Classes a student can pick, by section. */
export const CLASSES: Readonly<Record<SectionId, readonly ClassOption[]>> = {
  nationale: [
    { value: 'secondaire-1', label: '1re secondaire' },
    { value: 'secondaire-2', label: '2e secondaire' },
    { value: 'secondaire-3', label: '3e secondaire (Thanaweya Amma)' },
  ],
  bac: [
    { value: 'seconde', label: 'Seconde' },
    { value: 'premiere', label: 'Première' },
    { value: 'terminale', label: 'Terminale' },
  ],
};

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  nationale: 'Section nationale',
  bac: 'Section Bac français',
};

export function classLabel(section: SectionId, value: string): string {
  return CLASSES[section].find((c) => c.value === value)?.label ?? value;
}

export interface StudentProfile {
  readonly displayName: string;
  readonly section: SectionId;
  readonly classe: string;
  /** Chapter ids the student marked as revised, per subject slug. */
  readonly progress: Readonly<Record<string, readonly string[]>>;
  /** Saved items, as `slug:ex:<index>` (worked example) or `slug:fo:<index>` (formula). */
  readonly favourites: readonly string[];
}

export const MAX_FAVOURITES = 200;

export function favouriteId(slug: string, kind: 'ex' | 'fo', index: number): string {
  return `${slug}:${kind}:${index}`;
}

/** Share of chapters revised, 0–100. */
export function progressPercent(done: readonly string[] | undefined, validIds: readonly string[]): number {
  if (!validIds.length) return 0;
  const valid = new Set(validIds);
  const count = (done ?? []).filter((id) => valid.has(id)).length;
  return Math.round((count / validIds.length) * 100);
}

/** French messages for Firebase Auth / Firestore error codes. */
export function frenchAuthError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous.';
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.';
    case 'auth/weak-password':
      return 'Mot de passe trop faible : 8 caractères minimum.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou mot de passe incorrect.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    case 'permission-denied':
      return 'Action non autorisée.';
    default:
      return 'Une erreur est survenue. Réessayez.';
  }
}
