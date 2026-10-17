/**
 * Model of the school space: who the users are, what teachers publish and what they grade.
 * Pure types and functions (no Angular, no Firebase), so it is easy to test.
 *
 * Roles
 *  - student: signs up, picks a section and a class; sees what is meant for them and their own grades.
 *  - teacher: an account whose verified e-mail is listed in `teachers/{email}` (added by the school's
 *    administrator in the Firebase console). Publishes posts and enters grades.
 */

export type SectionId = 'nationale' | 'bac';

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  nationale: 'Bac nationale',
  bac: 'Bac français',
};

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

export function classLabel(section: SectionId, value: string): string {
  return CLASSES[section].find((c) => c.value === value)?.label ?? value;
}

/* ------------------------------------------------------------------------------------------------
 * Audiences
 * ---------------------------------------------------------------------------------------------- */

/** `all`, a section (`nationale`, `bac`) or one class (`bac-premiere`). */
export type Target = string;

export function classTarget(section: SectionId, classe: string): Target {
  return `${section}-${classe}`;
}

export interface TargetOption {
  readonly value: Target;
  readonly label: string;
}

/** Everything a teacher can address, from widest to narrowest. */
export const TARGET_OPTIONS: readonly TargetOption[] = [
  { value: 'all', label: 'Tous les élèves' },
  { value: 'nationale', label: 'Tout le Bac nationale' },
  ...CLASSES.nationale.map((c) => ({ value: classTarget('nationale', c.value), label: `Bac nationale — ${c.label}` })),
  { value: 'bac', label: 'Tout le Bac français' },
  ...CLASSES.bac.map((c) => ({ value: classTarget('bac', c.value), label: `Bac français — ${c.label}` })),
];

export function targetLabel(target: Target): string {
  return TARGET_OPTIONS.find((t) => t.value === target)?.label ?? target;
}

export function isValidTarget(target: string): boolean {
  return TARGET_OPTIONS.some((t) => t.value === target);
}

/** Is a post addressed to a student of this section and class? */
export function audienceMatches(target: Target, section: SectionId, classe: string): boolean {
  return target === 'all' || target === section || target === classTarget(section, classe);
}

/* ------------------------------------------------------------------------------------------------
 * Posts: announcements, homework, resources
 * ---------------------------------------------------------------------------------------------- */

export type PostType = 'announcement' | 'assignment' | 'resource';

export const POST_TYPES: readonly { readonly id: PostType; readonly label: string; readonly plural: string }[] = [
  { id: 'announcement', label: 'Annonce', plural: 'Annonces' },
  { id: 'assignment', label: 'Devoir', plural: 'Devoirs' },
  { id: 'resource', label: 'Ressource', plural: 'Ressources' },
];

export interface Post {
  readonly id: string;
  readonly type: PostType;
  readonly title: string;
  readonly body: string;
  /** A catalogue subject id (see site-content/matieres.ts), or '' for none. */
  readonly subject: string;
  readonly target: Target;
  /** YYYY-MM-DD; assignments only. */
  readonly dueDate: string | null;
  /** https link; resources only. */
  readonly url: string | null;
  readonly authorUid: string;
  readonly authorName: string;
  readonly createdAt: number;
}

export const LIMITS = {
  title: 120,
  body: 4000,
  comment: 1000,
  name: 80,
  maxDone: 300,
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDay(value: string): boolean {
  return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

/** https links only: never `javascript:`, `data:` or plain http. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:' && value.trim().length <= 500;
  } catch {
    return false;
  }
}

/** Local calendar day, YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DUE_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** « mardi 21 octobre » for a YYYY-MM-DD day. */
export function formatDay(day: string): string {
  return DUE_FORMAT.format(new Date(`${day}T12:00:00Z`));
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

/** Where a due date stands relative to today. */
export function dueState(dueDate: string, today: string): DueState {
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  const days = Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return days <= 3 ? 'soon' : 'later';
}

/** Posts of a type that concern a student, newest first. */
export function postsFor(posts: readonly Post[], type: PostType, section: SectionId, classe: string): Post[] {
  return posts
    .filter((p) => p.type === type && audienceMatches(p.target, section, classe))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Homework split for the « Devoirs » tab: to do (soonest due first), then done (latest first). */
export function splitAssignments(
  assignments: readonly Post[],
  done: readonly string[],
): { readonly todo: Post[]; readonly finished: Post[] } {
  const doneSet = new Set(done);
  const byDue = (a: Post, b: Post) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  return {
    todo: assignments.filter((a) => !doneSet.has(a.id)).sort(byDue),
    finished: assignments.filter((a) => doneSet.has(a.id)).sort((a, b) => byDue(b, a)),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Grades
 * ---------------------------------------------------------------------------------------------- */

export interface Grade {
  readonly id: string;
  readonly studentUid: string;
  readonly studentName: string;
  readonly subject: string;
  readonly title: string;
  readonly score: number;
  readonly outOf: number;
  readonly comment: string;
  readonly teacherUid: string;
  readonly teacherName: string;
  readonly createdAt: number;
}

/** A grade ramped to a mark out of 20 (the French/Egyptian convention), unrounded. */
export function onTwenty(grade: Pick<Grade, 'score' | 'outOf'>): number {
  return (grade.score / grade.outOf) * 20;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Average of several grades on 20, to one decimal; null when there are none. */
export function averageOnTwenty(grades: readonly Pick<Grade, 'score' | 'outOf'>[]): number | null {
  if (!grades.length) return null;
  return round1(grades.reduce((sum, g) => sum + onTwenty(g), 0) / grades.length);
}

export interface SubjectGrades {
  readonly subject: string;
  readonly grades: readonly Grade[];
  readonly average: number | null;
}

/** Grades grouped by subject (newest grade first inside each), subjects sorted by id. */
export function gradesBySubject(grades: readonly Grade[]): SubjectGrades[] {
  const groups = new Map<string, Grade[]>();
  for (const g of grades) groups.set(g.subject, [...(groups.get(g.subject) ?? []), g]);
  return [...groups]
    .map(([subject, list]) => ({
      subject,
      grades: [...list].sort((a, b) => b.createdAt - a.createdAt),
      average: averageOnTwenty(list),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

/** Parses « 14,5 » or « 14.5 »; NaN when it isn't a number. */
export function parseNumber(text: string): number {
  const cleaned = text.trim().replace(',', '.');
  return cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned) ? Number.NaN : Number(cleaned);
}

export const FORMAT_MARK = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/* ------------------------------------------------------------------------------------------------
 * People
 * ---------------------------------------------------------------------------------------------- */

export interface StudentProfile {
  readonly displayName: string;
  readonly section: SectionId;
  readonly classe: string;
  /** Ids of the homework the student marked as done. */
  readonly done: readonly string[];
}

export interface StudentSummary {
  readonly uid: string;
  readonly displayName: string;
  readonly section: SectionId;
  readonly classe: string;
}

/** French messages for Firebase Auth / Firestore error codes; never leaks codes. */
export function frenchError(error: unknown): string {
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
