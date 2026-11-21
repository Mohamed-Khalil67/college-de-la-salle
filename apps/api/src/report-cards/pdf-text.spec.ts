import { describe, expect, it } from 'vitest';
import { hasArabic, paragraphDirection, visualRuns, wrapParagraph, type TextRun } from './pdf-text.js';

const join = (runs: readonly TextRun[]) => runs.map((r) => (r.arabic ? `[${r.text}]` : r.text)).join('');

describe('pdf-text', () => {
  it('finds Arabic and the paragraph direction from the first strong letter', () => {
    expect(hasArabic('Élodie')).toBe(false);
    expect(hasArabic('تحية')).toBe(true);
    expect(paragraphDirection('تحية Bravo')).toBe('rtl');
    expect(paragraphDirection('2024 Bravo تحية')).toBe('ltr');
    expect(paragraphDirection('123')).toBe('ltr');
  });

  it('leaves a Latin line as one run', () => {
    expect(visualRuns('Très bon trimestre.')).toEqual([{ text: 'Très bon trimestre.', arabic: false }]);
  });

  it('puts the words of an Arabic line right to left, each in logical order for the shaper', () => {
    // Logical « تحية طيبة » (two words): the second word is leftmost on the page.
    expect(join(visualRuns('تحية طيبة'))).toBe('[طيبة] [تحية]');
  });

  it('keeps Latin words and numbers left to right inside an Arabic sentence', () => {
    // « عمل ممتاز في Math 2024 » : Arabic right to left, « Math 2024 » reads left to right at the left end.
    expect(join(visualRuns('عمل ممتاز في Math 2024'))).toBe('Math 2024 [في] [ممتاز] [عمل]');
  });

  it('places a final full stop of an Arabic sentence at its left end and mirrors brackets', () => {
    expect(join(visualRuns('أحسنت.'))).toBe('.[أحسنت]');
    expect(join(visualRuns('جيد (جدا)'))).toBe('([جدا]) [جيد]');
  });

  it('isolates an Arabic name inside a French line', () => {
    expect(join(visualRuns('Élève : سارة أحمد'))).toBe('Élève : [أحمد] [سارة]');
  });

  it('keeps Arabic-Indic digits left to right, one per run', () => {
    expect(join(visualRuns('الصف ١٢'))).toBe('[١][٢] [الصف]');
  });

  it('wraps a long paragraph at spaces and keeps the paragraph direction on every line', () => {
    const text = 'واحد اثنان ثلاثة أربعة';
    const measure = (runs: readonly TextRun[]) => runs.reduce((n, r) => n + r.text.length, 0);
    const { dir, lines } = wrapParagraph(text, 12, measure);
    expect(dir).toBe('rtl');
    expect(lines.map(join)).toEqual(['[اثنان] [واحد]', '[أربعة] [ثلاثة]']);
  });

  it('starts a new line on a line break', () => {
    const { lines } = wrapParagraph('Bien\nتحية', 1000, () => 0);
    expect(lines.map(join)).toEqual(['Bien', '[تحية]']);
  });
});
