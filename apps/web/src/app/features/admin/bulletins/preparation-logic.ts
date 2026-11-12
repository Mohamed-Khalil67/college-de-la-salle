import {
  GRADE_REMINDER_COOLDOWN_HOURS,
  type ReportGapDto,
  type ReportPreparationClassDto,
  type ReportReminderResponse,
} from '@cdls/shared';

/** Pure rules of « Préparer les bulletins »: what a gap says, who a reminder reaches, what the admin is told. */

/** What is missing for one subject, in a few words. */
export function gapDetail(gap: Pick<ReportGapDto, 'reason' | 'entered' | 'total'>): string {
  switch (gap.reason) {
    case 'no_grades':
      return 'aucune note saisie';
    case 'incomplete':
      return gap.total ? `${gap.entered} / ${gap.total} notes saisies` : 'notes à compléter';
    case 'unpublished':
      return 'notes à publier aux élèves';
  }
}

/** « Hany Mansour, Claire Dubois », or what to do when nobody teaches the subject. */
export function teachersText(gap: Pick<ReportGapDto, 'teachers'>): string {
  return gap.teachers.length ? gap.teachers.map((t) => t.name).join(', ') : 'aucun enseignant affecté';
}

/** A reminder reaches someone only on an open term and when a subject to finish has a teacher. */
export function canRemind(classes: readonly Pick<ReportPreparationClassDto, 'gaps'>[], closed: boolean): boolean {
  return !closed && classes.some((c) => c.gaps.some((g) => g.teachers.length > 0));
}

const many = (n: number, one: string, other: string) => `${n} ${n > 1 ? other : one}`;

/** The sentence under the « Relancer » buttons: who was reminded, who was left alone and why. */
export function reminderMessage(r: ReportReminderResponse): string {
  const parts: string[] = [];
  if (r.notified > 0) parts.push(`${many(r.notified, 'enseignant relancé', 'enseignants relancés')}.`);
  if (r.alreadyReminded > 0) {
    parts.push(
      r.notified > 0
        ? `${many(r.alreadyReminded, 'autre a', 'autres ont')} déjà été relancé${r.alreadyReminded > 1 ? 's' : ''} il y a moins de ${GRADE_REMINDER_COOLDOWN_HOURS} heures.`
        : `Les enseignants concernés ont déjà été relancés il y a moins de ${GRADE_REMINDER_COOLDOWN_HOURS} heures. Réessayez plus tard.`,
    );
  }
  if (r.withoutTeacher > 0)
    parts.push(`${many(r.withoutTeacher, 'matière n’a', 'matières n’ont')} aucun enseignant affecté : affectez-en un depuis « Affectations ».`);
  if (!parts.length) return 'Aucun enseignant à relancer : tout est prêt.';
  return parts.join(' ');
}
