import { logger } from 'firebase-functions/v2';
import {
  AI_GRADE_JSON_SCHEMA,
  type AiGradePrompt,
  type ParsedAiGrade,
  parseAiGrade,
} from '../contracts';

export interface TextGrader {
  readonly model: string;
  grade(prompt: AiGradePrompt, maxPoints: number): Promise<ParsedAiGrade>;
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;

/**
 * Google Gemini via the Generative Language API. Works on the free tier of an AI Studio key.
 * NOTE: on the free tier Google may use prompts to improve its products — student answers are
 * sent, so prefer a paid key (or Vertex AI) for real student data.
 */
export function geminiGrader(apiKey: string, model: string): TextGrader {
  return {
    model,
    async grade(prompt, maxPoints) {
      const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: AI_GRADE_JSON_SCHEMA,
          },
        }),
      });

      if (response.status === 429) {
        throw new Error('بلغتَ حدَّ الاستعمال المجاني للذكاء الاصطناعي. أعد المحاولة بعد دقيقة.');
      }
      if (!response.ok) {
        logger.error('gemini.error', { status: response.status, body: await response.text() });
        throw new Error(`تعذَّر طلب التصحيح من الذكاء الاصطناعي (${response.status}).`);
      }

      const body = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return parseAiGrade(text, maxPoints);
    },
  };
}

/**
 * Emulator-only stand-in so the review workflow can be exercised without an API key. It is
 * clearly labelled and never selected outside the Functions emulator.
 */
export function emulatorMockGrader(): TextGrader {
  return {
    model: 'emulator-mock',
    async grade(prompt, maxPoints) {
      const answer = /<student_answer>\n([\s\S]*)\n<\/student_answer>/.exec(prompt.user)?.[1] ?? '';
      const words = answer.trim().split(/\s+/).filter(Boolean).length;
      const points = Math.min(maxPoints, Math.round((words / 40) * maxPoints * 2) / 2);
      return {
        points,
        rationale: `[محاكاة محلية — لم يُستدعَ أيُّ ذكاء اصطناعي] عدد الكلمات ${words}؛ يعتمد الاقتراح على الطول فقط. اضبط GEMINI_API_KEY للتصحيح الفعلي.`,
      };
    },
  };
}
