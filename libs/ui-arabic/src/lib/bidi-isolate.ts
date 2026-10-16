import { Directive } from '@angular/core';

/**
 * Isolates user-authored text from the surrounding RTL flow.
 *
 * Exam content mixes scripts: "إذا كانت f(x) = 2x + 3 فما قيمة f(4)؟". Without isolation the
 * Unicode bidi algorithm lets the Latin run and its neutral punctuation bleed into the Arabic
 * context, reordering parentheses, signs and trailing question marks. This directive:
 *
 *  - sets `dir="auto"` so each block picks its base direction from its first strong character
 *    (an English prompt in an Arabic exam still renders LTR);
 *  - applies `unicode-bidi: plaintext`, which re-resolves direction per paragraph, so a
 *    multi-line prompt can mix an Arabic paragraph and a code paragraph safely.
 *
 * Use on block containers of user text (prompts, answers, options). For short inline values
 * (names, codes, formulas) inside sentences, use `<bdi>` instead, which `styles.scss` isolates.
 */
@Directive({
  selector: '[examIsolate]',
  host: {
    dir: 'auto',
    class: 'bidi-isolate',
  },
})
export class BidiIsolate {}
