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
import { formatCount } from '@exam/ui-arabic';
import type { NewExamInput } from '@exam/data-access-exams';

/**
 * Flat on purpose: switching a question between types keeps what was typed for the other type,
 * and validators are gated on `type` with `when`.
 */
export interface QuestionModel {
  type: QuestionType;
  prompt: string;
  points: number | null;
  // CHOICE
  options: string[];
  correctIndex: number;
  // TEXT
  maxLength: number | null;
  modelAnswer: string;
  criteria: string;
}

export interface ExamFormModel {
  title: string;
  description: string;
  durationMinutes: number | null;
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
  required(p.title, { message: 'أدخِل عنوانًا للاختبار.' });
  maxLength(p.title, 200, { message: 'ينبغي ألّا يتجاوز العنوان ٢٠٠ حرف.' });
  maxLength(p.description, 2000, { message: 'ينبغي ألّا تتجاوز التعليمات ٢٠٠٠ حرف.' });

  required(p.durationMinutes, { message: 'حدِّد مدة الاختبار.' });
  min(p.durationMinutes, LIMITS.minDurationSeconds / 60, { message: 'أقلّ مدة دقيقة واحدة.' });
  max(p.durationMinutes, LIMITS.maxDurationSeconds / 60, { message: 'أقصى مدة أربع ساعات.' });
  validate(p.durationMinutes, ({ value }) =>
    value() === null || Number.isInteger(value()) ? null : { kind: 'integer', message: 'أدخِل عددًا صحيحًا من الدقائق.' },
  );

  required(p.opensAt, { message: 'حدِّد موعد بدء إتاحة الاختبار.' });
  required(p.closesAt, { message: 'حدِّد موعد إغلاق الاختبار.' });
  validate(p.closesAt, ({ value, valueOf }) =>
    fromLocalInput(value()) > fromLocalInput(valueOf(p.opensAt))
      ? null
      : { kind: 'window', message: 'يجب أن يكون موعد الإغلاق بعد موعد البدء.' },
  );

  min(p.maxVisibilityLosses, 0, { message: 'لا يمكن أن يكون العدد سالبًا.' });
  max(p.maxVisibilityLosses, 50, { message: 'الحدّ الأقصى ٥٠ مرة.' });

  validate(p.questions, ({ value }) => {
    if (value().length === 0) return { kind: 'minQuestions', message: 'أضِف سؤالًا واحدًا على الأقل.' };
    if (value().length > LIMITS.maxQuestions) {
      return { kind: 'maxQuestions', message: `الحدّ الأقصى ${formatCount(LIMITS.maxQuestions, 'question')}.` };
    }
    return null;
  });

  applyEach(p.questions, (q) => {
    required(q.prompt, { message: 'اكتب نصّ السؤال.' });
    required(q.points, { message: 'حدِّد درجة السؤال.' });
    min(q.points, 1, { message: 'أقلّ درجة للسؤال درجة واحدة.' });
    max(q.points, 100, { message: 'الحدّ الأقصى ١٠٠ درجة.' });
    validate(q.points, ({ value }) =>
      value() === null || Number.isInteger(value()) ? null : { kind: 'integer', message: 'أدخِل عددًا صحيحًا من الدرجات.' },
    );

    // Multiple choice
    validate(q.options, ({ value, valueOf }) =>
      valueOf(q.type) === 'CHOICE' && value().length < LIMITS.minOptions
        ? { kind: 'minOptions', message: 'أضِف خيارين على الأقل.' }
        : null,
    );
    applyEach(q.options, (option) =>
      required(option, { message: 'نصّ الخيار مطلوب.', when: ({ valueOf }) => valueOf(q.type) === 'CHOICE' }),
    );
    validate(q.correctIndex, ({ value, valueOf }) =>
      valueOf(q.type) !== 'CHOICE' || (value() >= 0 && value() < valueOf(q.options).length)
        ? null
        : { kind: 'correct', message: 'حدِّد الخيار الصحيح.' },
    );

    // Written answer
    required(q.maxLength, { message: 'حدِّد الطول الأقصى للإجابة.', when: ({ valueOf }) => valueOf(q.type) === 'TEXT' });
    min(q.maxLength, 50, { message: 'اسمح بخمسين حرفًا على الأقل.', when: ({ valueOf }) => valueOf(q.type) === 'TEXT' });
    max(q.maxLength, LIMITS.maxTextAnswerLength, {
      message: `الحدّ الأقصى ${formatCount(LIMITS.maxTextAnswerLength, 'character')}.`,
      when: ({ valueOf }) => valueOf(q.type) === 'TEXT',
    });
    required(q.criteria, {
      message: 'صِف معايير منح الدرجات؛ إذ يعتمد عليها المُصحِّح، بشرًا كان أو ذكاءً اصطناعيًّا.',
      when: ({ valueOf }) => valueOf(q.type) === 'TEXT',
    });
    maxLength(q.criteria, LIMITS.maxRubricLength, { message: 'المعايير أطول من المسموح.' });
    maxLength(q.modelAnswer, LIMITS.maxRubricLength, { message: 'الإجابة النموذجية أطول من المسموح.' });
  });
});

export function toNewExamInput(model: ExamFormModel): NewExamInput {
  return {
    title: model.title,
    description: model.description,
    durationSeconds: (model.durationMinutes ?? 0) * 60,
    window: { opensAt: fromLocalInput(model.opensAt), closesAt: fromLocalInput(model.closesAt) },
    integrity: { maxVisibilityLosses: model.maxVisibilityLosses },
    questions: model.questions.map((q) =>
      q.type === 'TEXT'
        ? {
            type: 'TEXT' as const,
            prompt: q.prompt,
            points: q.points ?? 0,
            maxLength: q.maxLength ?? LIMITS.defaultTextAnswerLength,
            modelAnswer: q.modelAnswer,
            criteria: q.criteria,
          }
        : {
            type: 'CHOICE' as const,
            prompt: q.prompt,
            points: q.points ?? 0,
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
