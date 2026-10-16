import {
  applyEach,
  max,
  maxLength,
  min,
  required,
  schema,
  validate,
} from '@angular/forms/signals';
import { LIMITS, type QuestionType } from '@exam/contracts';
import type { NewExamInput } from '@exam/data-access-exams';

/**
 * Flat on purpose: switching a question between types keeps what was typed for the other type,
 * and validators are gated on `type` with `when`.
 */
export interface QuestionModel {
  type: QuestionType;
  prompt: string;
  points: number;
  // CHOICE
  options: string[];
  correctIndex: number;
  // TEXT
  maxLength: number;
  modelAnswer: string;
  criteria: string;
}

export interface ExamFormModel {
  title: string;
  description: string;
  durationMinutes: number;
  /** `datetime-local` strings in the examiner's local time zone. */
  opensAt: string;
  closesAt: string;
  /** `null` = record tab switches but never auto-submit. */
  maxVisibilityLosses: number | null;
  questions: QuestionModel[];
}

export function blankQuestion(type: QuestionType = 'CHOICE'): QuestionModel {
  return {
    type,
    prompt: '',
    points: type === 'TEXT' ? 5 : 1,
    options: ['', ''],
    correctIndex: 0,
    maxLength: LIMITS.defaultTextAnswerLength,
    modelAnswer: '',
    criteria: '',
  };
}

/** Defaults implement the vertical slice: a 5-minute exam open for the next 24 hours. */
export function initialExamModel(nowMs: number): ExamFormModel {
  return {
    title: '',
    description: '',
    durationMinutes: 5,
    opensAt: toLocalInput(nowMs),
    closesAt: toLocalInput(nowMs + 24 * 60 * 60 * 1000),
    maxVisibilityLosses: 3,
    questions: [blankQuestion()],
  };
}

export const examFormSchema = schema<ExamFormModel>((p) => {
  required(p.title, { message: 'Give the exam a title.' });
  maxLength(p.title, 200, { message: 'Keep the title under 200 characters.' });
  maxLength(p.description, 2000);

  required(p.durationMinutes, { message: 'Set a duration.' });
  min(p.durationMinutes, LIMITS.minDurationSeconds / 60, { message: 'At least 1 minute.' });
  max(p.durationMinutes, LIMITS.maxDurationSeconds / 60, { message: 'At most 4 hours.' });
  validate(p.durationMinutes, ({ value }) =>
    Number.isInteger(value()) ? null : { kind: 'integer', message: 'Use whole minutes.' },
  );

  required(p.opensAt, { message: 'Choose when the exam opens.' });
  required(p.closesAt, { message: 'Choose when the exam closes.' });
  validate(p.closesAt, ({ value, valueOf }) =>
    fromLocalInput(value()) > fromLocalInput(valueOf(p.opensAt))
      ? null
      : { kind: 'window', message: 'The exam must close after it opens.' },
  );

  min(p.maxVisibilityLosses, 0);
  max(p.maxVisibilityLosses, 50);

  validate(p.questions, ({ value }) => {
    if (value().length === 0) return { kind: 'minQuestions', message: 'Add at least one question.' };
    if (value().length > LIMITS.maxQuestions) {
      return { kind: 'maxQuestions', message: `At most ${LIMITS.maxQuestions} questions.` };
    }
    return null;
  });

  applyEach(p.questions, (q) => {
    required(q.prompt, { message: 'Write the question.' });
    required(q.points);
    min(q.points, 1, { message: 'At least 1 point.' });
    max(q.points, 100);
    validate(q.points, ({ value }) =>
      Number.isInteger(value()) ? null : { kind: 'integer', message: 'Whole points only.' },
    );

    // Multiple choice
    validate(q.options, ({ value, valueOf }) =>
      valueOf(q.type) === 'CHOICE' && value().length < LIMITS.minOptions
        ? { kind: 'minOptions', message: `At least ${LIMITS.minOptions} options.` }
        : null,
    );
    applyEach(q.options, (option) =>
      required(option, { message: 'Option text is required.', when: ({ valueOf }) => valueOf(q.type) === 'CHOICE' }),
    );
    validate(q.correctIndex, ({ value, valueOf }) =>
      valueOf(q.type) !== 'CHOICE' || (value() >= 0 && value() < valueOf(q.options).length)
        ? null
        : { kind: 'correct', message: 'Mark the correct option.' },
    );

    // Written answer
    required(q.maxLength, { when: ({ valueOf }) => valueOf(q.type) === 'TEXT' });
    min(q.maxLength, 50, { message: 'Allow at least 50 characters.', when: ({ valueOf }) => valueOf(q.type) === 'TEXT' });
    max(q.maxLength, LIMITS.maxTextAnswerLength, {
      message: `At most ${LIMITS.maxTextAnswerLength} characters.`,
      when: ({ valueOf }) => valueOf(q.type) === 'TEXT',
    });
    required(q.criteria, {
      message: 'Describe how points are awarded — graders (human or AI) rely on it.',
      when: ({ valueOf }) => valueOf(q.type) === 'TEXT',
    });
    maxLength(q.criteria, LIMITS.maxRubricLength);
    maxLength(q.modelAnswer, LIMITS.maxRubricLength);
  });
});
export function toNewExamInput(model: ExamFormModel): NewExamInput {
  return {
    title: model.title,
    description: model.description,
    durationSeconds: model.durationMinutes * 60,
    window: { opensAt: fromLocalInput(model.opensAt), closesAt: fromLocalInput(model.closesAt) },
    integrity: { maxVisibilityLosses: model.maxVisibilityLosses },
    questions: model.questions.map((q) =>
      q.type === 'TEXT'
        ? {
            type: 'TEXT' as const,
            prompt: q.prompt,
            points: q.points,
            maxLength: q.maxLength,
            modelAnswer: q.modelAnswer,
            criteria: q.criteria,
          }
        : {
            type: 'CHOICE' as const,
            prompt: q.prompt,
            points: q.points,
            options: q.options,
            correctIndex: q.correctIndex,
          },
    ),
  };
}

/* `datetime-local` <-> epoch millis, interpreted in the browser's time zone. */

export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}
