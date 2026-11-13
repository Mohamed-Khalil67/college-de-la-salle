import {
  type CalendarDayDto,
  type ClassDto,
  type EventDto,
  type EventInput,
  examTitle,
  MAX_ASSESSMENTS_PER_DAY,
  assessmentLoadNote,
  longDay,
} from '@cdls/shared';

/** What the « Ajouter un examen » form holds: every field is text, as typed. */
export interface ExamModel {
  activityTypeId: string;
  classId: string;
  subjectId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
}

export const emptyExam = (date: string): ExamModel => ({
  activityTypeId: '',
  classId: '',
  subjectId: '',
  title: '',
  date,
  startTime: '',
  endTime: '',
  roomId: '',
});

/** The first thing to fix before saving, in the order of the form; undefined when the form is fine. */
export function examProblem(m: ExamModel): string | undefined {
  if (!m.activityTypeId) return 'Choisissez le type : examen ou contrôle.';
  if (!m.classId) return 'Choisissez la classe.';
  if (!m.subjectId) return 'Choisissez la matière.';
  if (!m.date) return 'Choisissez la date.';
  if (!m.startTime) return 'Indiquez l’heure de début.';
  if (!m.endTime) return 'Indiquez l’heure de fin.';
  if (m.endTime <= m.startTime) return 'L’heure de fin doit venir après l’heure de début.';
  return undefined;
}

/** The request for `POST /events`; the title defaults to « Examen de Mathématiques ». */
export function toExamInput(m: ExamModel, typeLabel: string, subjectName: string): EventInput {
  return {
    activityTypeId: m.activityTypeId,
    title: m.title.trim() || examTitle(typeLabel, subjectName),
    classId: m.classId,
    subjectId: m.subjectId,
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    roomId: m.roomId || null,
  };
}

/** The exam week of the class that holds this day (a class's own, its section's or the whole school's), if any. */
export function examWeekOn(
  days: readonly CalendarDayDto[],
  date: string,
  schoolClass: Pick<ClassDto, 'id' | 'sectionId'> | undefined,
): CalendarDayDto | null {
  if (!schoolClass) return null;
  return (
    days.find(
      (d) =>
        d.type === 'exam_week' &&
        d.startsOn <= date &&
        date <= d.endsOn &&
        (d.classIds.length
          ? d.classIds.includes(schoolClass.id)
          : d.sectionId === null || d.sectionId === schoolClass.sectionId),
    ) ?? null
  );
}

/** How many assessments (exams, tests: graded, not homework, not weekly) the class already has in these events. */
export function assessmentsOf(events: readonly EventDto[], classId: string): number {
  return events.filter(
    (e) => e.classId === classId && e.type.gradable && !e.type.homework && !e.type.repeatable,
  ).length;
}

/** The two soft notes under the date: exam week or not, and an overloaded day. They inform; they never block. */
export function examNotes(
  days: readonly CalendarDayDto[],
  events: readonly EventDto[],
  date: string,
  schoolClass: ClassDto | undefined,
): readonly string[] {
  if (!schoolClass || !date) return [];
  const week = examWeekOn(days, date, schoolClass);
  const notes: string[] = [
    week
      ? `Ce jour est dans la semaine d’examens « ${week.label} ».`
      : `${longDay(date)} n’est pas dans une semaine d’examens.`,
  ];
  const load = assessmentLoadNote(
    assessmentsOf(events, schoolClass.id),
    MAX_ASSESSMENTS_PER_DAY,
    schoolClass.label,
  );
  if (load) notes.push(load);
  return notes;
}
