/**
 * Right-to-left text for the report-card PDF. pdfmake lays every text out left to right and splits it into words,
 * and its bundled Roboto has no Arabic glyphs. So a text with Arabic in it is turned here into runs in VISUAL order
 * (a small subset of the Unicode bidi algorithm: strong letters, numbers, neutrals, mirrored brackets), each run
 * marked with the font that has its glyphs. fontkit (inside pdfkit) shapes an Arabic run (joining forms) and
 * reverses its glyphs because its script is right-to-left, so an Arabic run is handed over in LOGICAL order.
 * Long paragraphs are broken into lines here (pdfmake must not re-wrap them: its order would be left to right).
 * Pure: no pdfmake, no fonts loaded; the widths come from a `measure` function.
 */

export type Direction = 'ltr' | 'rtl';

/** One piece of a line, in visual order (left to right on the page). */
export interface TextRun {
  readonly text: string;
  /** Set it in the Arabic font. */
  readonly arabic: boolean;
}

/** Arabic script blocks (letters, marks, Arabic punctuation and digits, presentation forms). */
const ARABIC_BLOCK = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;
const ARABIC_DIGIT = /[٠-٩۰-۹]/u;
const ARABIC_NEUTRAL = /[،؛؟٪-٬۔]/u;
const LATIN_DIGIT = /[0-9]/u;
const LETTER = /[\p{L}\p{M}]/u;

const MIRROR: Readonly<Record<string, string>> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
  '‹': '›',
  '›': '‹',
};

type CharType = 'L' | 'R' | 'EN' | 'AN' | 'N';

function charType(ch: string): CharType {
  if (ARABIC_DIGIT.test(ch)) return 'AN';
  if (ARABIC_NEUTRAL.test(ch)) return 'N';
  if (ARABIC_BLOCK.test(ch)) return 'R';
  if (LATIN_DIGIT.test(ch)) return 'EN';
  if (LETTER.test(ch)) return 'L';
  return 'N';
}

/** True when the text holds a character of the Arabic script. */
export function hasArabic(text: string): boolean {
  return ARABIC_BLOCK.test(text);
}

/** The direction of the first strong letter; left to right when there is none. */
export function paragraphDirection(text: string): Direction {
  for (const ch of text) {
    const t = charType(ch);
    if (t === 'R') return 'rtl';
    if (t === 'L') return 'ltr';
  }
  return 'ltr';
}

/** Embedding levels (0 = LTR paragraph, 1 = RTL paragraph; odd levels are right to left). */
function levels(chars: readonly string[], dir: Direction): number[] {
  const base = dir === 'rtl' ? 1 : 0;
  const types = chars.map(charType);
  // W2/W7: a European number after a strong L (or at the start of an LTR paragraph) is L.
  let lastStrong: 'L' | 'R' = dir === 'rtl' ? 'R' : 'L';
  const resolved = types.map((t): 'L' | 'R' | 'NUM' | 'N' => {
    if (t === 'L' || t === 'R') {
      lastStrong = t;
      return t;
    }
    if (t === 'EN') return lastStrong === 'L' ? 'L' : 'NUM';
    if (t === 'AN') return 'NUM';
    return 'N';
  });
  // N1/N2: neutrals between two of the same direction take it (numbers count as R), else the paragraph's.
  const strongOf = (t: 'L' | 'R' | 'NUM' | 'N' | undefined): 'L' | 'R' =>
    t === 'L' ? 'L' : t === 'R' || t === 'NUM' ? 'R' : dir === 'rtl' ? 'R' : 'L';
  const out: number[] = [];
  let i = 0;
  while (i < resolved.length) {
    const t = resolved[i];
    if (t !== 'N') {
      out.push(t === 'L' ? (base === 1 ? 2 : 0) : t === 'R' ? 1 : 2);
      i += 1;
      continue;
    }
    let j = i;
    while (j < resolved.length && resolved[j] === 'N') j += 1;
    const before = i === 0 ? strongOf(undefined) : strongOf(resolved[i - 1]);
    const after = j >= resolved.length ? strongOf(undefined) : strongOf(resolved[j]);
    const side = before === after ? before : dir === 'rtl' ? 'R' : 'L';
    const level = side === 'R' ? 1 : base === 1 ? 2 : 0;
    for (let k = i; k < j; k += 1) out.push(level);
    i = j;
  }
  // A number at level 2 next to an L at level 2 stays 2; one inside an LTR paragraph's R text is 2 as well.
  return out;
}

/** The characters of one line in visual order, with their levels (L2: reverse from the highest level down). */
function reorder(chars: readonly string[], lv: readonly number[]): Array<{ ch: string; level: number }> {
  const items = chars.map((ch, i) => ({ ch, level: lv[i] ?? 0 }));
  const max = Math.max(0, ...lv);
  const lowestOdd = Math.min(...lv.filter((l) => l % 2 === 1), max + 1);
  for (let level = max; level >= lowestOdd; level -= 1) {
    let i = 0;
    while (i < items.length) {
      if ((items[i]?.level ?? 0) < level) {
        i += 1;
        continue;
      }
      let j = i;
      while (j < items.length && (items[j]?.level ?? 0) >= level) j += 1;
      const reversed = items.slice(i, j).reverse();
      items.splice(i, j - i, ...reversed);
      i = j;
    }
  }
  return items.map((it) => (it.level % 2 === 1 ? { ...it, ch: MIRROR[it.ch] ?? it.ch } : it));
}

/**
 * One line (no wrapping) as runs in visual order. `dir` is the paragraph's direction (the line's own by default).
 * Spaces and Latin punctuation stay in the Latin font, so the Arabic font only needs the Arabic block.
 */
export function visualRuns(line: string, dir: Direction = paragraphDirection(line)): TextRun[] {
  const chars = Array.from(line);
  const visual = reorder(chars, levels(chars, dir));
  const runs: TextRun[] = [];
  let i = 0;
  while (i < visual.length) {
    const first = visual[i];
    if (!first) break;
    const arabic = ARABIC_BLOCK.test(first.ch);
    const rtl = first.level % 2 === 1;
    let j = i;
    while (j < visual.length) {
      const it = visual[j];
      if (!it || ARABIC_BLOCK.test(it.ch) !== arabic || (it.level % 2 === 1) !== rtl) break;
      j += 1;
    }
    const piece = visual.slice(i, j).map((it) => it.ch);
    if (!arabic) {
      runs.push({ text: piece.join(''), arabic: false });
    } else if (rtl && piece.some((ch) => charType(ch) === 'R')) {
      // fontkit sees an Arabic letter, so it reverses the glyphs itself: give it the logical order back.
      runs.push({ text: [...piece].reverse().join(''), arabic: true });
    } else {
      // Arabic digits or punctuation alone: fontkit's own direction is not certain, one character per run is.
      for (const ch of piece) runs.push({ text: ch, arabic: true });
    }
    i = j;
  }
  return mergeLatin(runs);
}

function mergeLatin(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && !last.arabic && !run.arabic) out[out.length - 1] = { text: last.text + run.text, arabic: false };
    else out.push(run);
  }
  return out;
}

/**
 * A paragraph broken into lines no wider than `maxWidth` (greedy, at spaces; `\n` starts a new line), each line as
 * visual runs with the paragraph's direction. `measure` gives the width of one line's runs.
 */
export function wrapParagraph(
  text: string,
  maxWidth: number,
  measure: (runs: readonly TextRun[]) => number,
): { dir: Direction; lines: TextRun[][] } {
  const dir = paragraphDirection(text);
  const lines: TextRun[][] = [];
  for (const para of text.split(/\r?\n/u)) {
    const words = para.split(/ +/u).filter((w) => w.length > 0);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measure(visualRuns(candidate, dir)) > maxWidth) {
        lines.push(visualRuns(current, dir));
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(visualRuns(current, dir));
  }
  return { dir, lines };
}
