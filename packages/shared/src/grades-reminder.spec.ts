import {
  type GradeReminderItem,
  gradesReminderNotice,
  NOTIFICATION_KINDS,
  NOTIFICATION_LIMITS,
  notificationLink,
} from './notifications.js';

const item = (over: Partial<GradeReminderItem> = {}): GradeReminderItem => ({
  className: '1re bac',
  subject: 'Maths',
  reason: 'incomplete',
  entered: 18,
  total: 27,
  ...over,
});

describe('grades reminder', () => {
  it('names the period, the subject, the class and what is missing', () => {
    const n = gradesReminderNotice({
      periodLabel: 'Trimestre 1',
      items: [
        item(),
        item({ subject: 'Physique', reason: 'no_grades' }),
        item({ subject: 'SVT', reason: 'unpublished' }),
      ],
    });
    expect(n.title).toBe('Notes à finir : Trimestre 1');
    expect(n.body).toContain('Maths, 1re bac (18 / 27 notes saisies)');
    expect(n.body).toContain('Physique, 1re bac (aucune note)');
    expect(n.body).toContain('SVT, 1re bac (notes à publier)');
  });

  it('lists six items at most, then counts the others, within the body limit', () => {
    const items = Array.from({ length: 9 }, (_, i) => item({ subject: `Matière ${i}` }));
    const n = gradesReminderNotice({ periodLabel: 'Trimestre 1', items });
    expect(n.body).toContain('et 3 autres');
    expect(n.body).not.toContain('Matière 6');
    expect(n.body.length).toBeLessThanOrEqual(NOTIFICATION_LIMITS.body);
  });

  it('is a kind of its own, linked to the teacher notes page', () => {
    expect(NOTIFICATION_KINDS).toContain('grades_reminder');
    expect(notificationLink('teacher', 'grades')).toBe('/enseignant/notes');
  });
});
