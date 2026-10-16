/**
 * Curriculum taxonomy for the Arabic section (القسم العربي) — Thanaweya Amma (الثانوية العامة).
 *
 * Pure types: no Angular, no Firebase. Content lives in `curriculum.data.ts`; dynamic data
 * (practice exams published by examiners) comes from Firestore through the store.
 */
// Subject ids are shared with exams (an exam can be assigned to a subject), so they live in contracts.
import type { SubjectId } from '@exam/contracts';

export { isSubjectId, SUBJECT_IDS, type SubjectId } from '@exam/contracts';

/** Thanaweya Amma tracks (الشُّعب). */
export type TrackId = 'literary' | 'science' | 'math';

export interface Track {
  readonly id: TrackId;
  /** أدبي / علمي علوم / علمي رياضة */
  readonly name: string;
  readonly description: string;
  readonly subjects: readonly SubjectId[];
}

/** One node of a syllabus tree: a unit, chapter or topic. */
export interface CurriculumNode {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly objectives: readonly string[];
  readonly children: readonly CurriculumNode[];
}

/** Background reading attached to a subject, e.g. «تاريخ اللغة العربية في مصر». */
export interface ContextModule {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  /** Key dates and figures, rendered as a timeline. */
  readonly milestones: readonly Milestone[];
}

export interface Milestone {
  /** A display label for the period, already in Arabic (e.g. «القرن العاشر الميلادي»). */
  readonly period: string;
  readonly text: string;
}

export interface StudyGuide {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface Subject {
  readonly id: SubjectId;
  readonly name: string;
  readonly tagline: string;
  readonly tracks: readonly TrackId[];
  readonly overview: string;
  /** Branches of the subject (for Arabic: النحو، البلاغة، الأدب…). */
  readonly branches: readonly { readonly id: string; readonly name: string; readonly summary: string }[];
  readonly syllabus: readonly CurriculumNode[];
  readonly objectives: readonly string[];
  readonly contextModules: readonly ContextModule[];
  readonly studyGuides: readonly StudyGuide[];
  /**
   * A representative Latin-script notation (formula, unit), shown bidi-isolated so it never
   * scrambles the Arabic sentence around it.
   */
  readonly notation: string | null;
}

export interface NewsItem {
  readonly id: string;
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  readonly title: string;
  readonly summary: string;
  readonly category: 'academic' | 'activity' | 'announcement';
  /** Sample content shipped with the platform; the school replaces it with real news. */
  readonly sample: boolean;
}

export interface GalleryImage {
  readonly id: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly caption: string;
  /** Illustrative artwork until the school uploads its own photographs. */
  readonly placeholder: boolean;
}

export interface HistorySection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export interface SchoolProfile {
  /** The institutional (French) name, rendered with lang="fr" and bidi isolation. */
  readonly latinName: string;
  readonly arabicName: string;
  readonly section: string;
  readonly tagline: string;
  readonly history: readonly HistorySection[];
  /** True while the history text is an introductory draft awaiting the school's official copy. */
  readonly historyIsDraft: boolean;
}

/** A practice exam an examiner chose to list publicly on a subject hub (Firestore). */
export interface PracticeExamCard {
  readonly examId: string;
  readonly subjectId: SubjectId;
  readonly title: string;
  readonly code: string;
  readonly durationSeconds: number;
  readonly questionCount: number;
}

/** News dates are calendar days (YYYY-MM-DD); this is noon UTC, safely inside the Cairo day. */
export function newsDateMs(item: Pick<NewsItem, 'date'>): number {
  const [y, m, d] = item.date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}