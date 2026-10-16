# منصّة الاختبارات — Arabic Exam Platform

A right-to-left Arabic timed exam platform built on **Angular 22** (standalone, zoneless, signals, Signal Forms) and
**Firebase** (Auth, Firestore, Cloud Functions). The design rule: **never trust the client.**
That covers its clock, its writes and its curiosity about the answer key.

```
examiner ──creates──▶ exam (meta · paper · private answer key · access code)   [one atomic batch]
candidate ──code──▶ startSession() ──▶ server mints startedAt/expiresAt        [Cloud Function]
candidate ──reads paper (only while session live) ──▶ answers ──▶ submission   [rules: request.time ≤ expiresAt]
submission created ──▶ gradeSubmission() ──▶ score written                     [Cloud Function, Admin SDK]
examiner dashboard ◀── live onSnapshot → signals ── sessions + submissions
```

## Quick start

Prerequisites: Node 22, **JDK 21+** (for the Firestore emulator), npm.

```bash
npm install
```

```bash
npm --prefix functions install
```

```bash
npm run emulators
```

```bash
npm start
```

Then open http://localhost:4200.

1. **Examiner sign-in** (دخول المُمتحِنين): with emulators, use the *الدخول عبر المحاكي المحلي* box. Any email works, and
   different emails act as different, isolated examiners.
2. **New exam**: the default is a 5-minute exam open for 24 hours. Publish it to get a 6-character code.
3. **Candidate**: open the link in a *different browser profile or a private window* (auth is
   per-origin, so the same window would reuse the examiner identity). Enter a name and press Start.
4. Watch the row on the examiner dashboard go *قيد الأداء → بانتظار التصحيح → صُحِّح*, live.

The emulator UI is at http://localhost:4000.

## Tests

| Command | What it proves |
| --- | --- |
| `npm test` | Unit tests (Vitest via `ng test`): exam-runner FSM, graders, AI prompt/parse, dashboard derivations, clock offset |
| `npm run test:rules` | `@firebase/rules-unit-testing` suite against the Firestore emulator (54 cases) |
| `npm run test:e2e` | Playwright, desktop and mobile: an examiner creates an exam, a candidate completes it in RTL from the direct link, and the examiner grades it in the history view. Every page is checked for RTL direction, no horizontal overflow, no replacement characters, loaded Arabic fonts, diacritic-safe line-height, and **no untranslated text**: any Latin word in interface copy, placeholders, aria-labels or titles fails the run unless it is user content. A second scenario kills the candidate's device mid-exam and verifies that the server submits the autosaved draft and that results stay hidden until the examiner publishes them |

The rules suite proves, among other things, that a candidate **cannot**:

- read the answer key, even mid-exam, or list `private/*`
- read the paper before their session exists or after it expires
- create, extend, revive or delete their session (all session writes are denied)
- submit after `expiresAt`, forge a later `expiresAt`, backdate `submittedAt`, or self-assign a `score`
- overwrite, edit or delete a submission once made
- read or submit into another candidate's session or submission

It also proves that examiners can only see their own exams, answer keys and submissions, and cannot
hijack another examiner's access code.

## Arabic and RTL architecture

| Concern | Implementation |
| --- | --- |
| Direction | `<html lang="ar" dir="rtl">`, plus CDK `Dir` at the app root, so `Directionality` is `rtl` for any CDK component |
| Layout | CSS logical properties only (`margin-inline`, `padding-block`, `inset-inline-start`, `border-inline-start`, `text-align: start`). No physical left/right rules anywhere |
| Typography | Amiri Naskh for titles (with full tashkeel), Noto Naskh Arabic for question text, IBM Plex Sans Arabic for the interface. All are self-hosted through `@fontsource` |
| Diacritics | Line-height budgets: interface 1.75, question text 2.15, titles 1.6. No `letter-spacing` on Arabic, which would break cursive joins |
| Mixed script | `examIsolate` directive (`dir="auto"` + `unicode-bidi: plaintext`) on every block of user-authored text, and `<bdi>` around inline names and codes. Latin identifiers get an `.ltr` isolate |
| Numbers and dates | `libs/ui-arabic`: `Intl.NumberFormat` / `DateTimeFormat` / `PluralRules` behind pipes (`arNumber`, `arDate`, `arClock`, `arCount`, `arScore`). Arabic-Indic digits (`ar-u-nu-arab`); switching to Western digits is a one-line change to `APP_LOCALE` |
| Counted nouns | All six Arabic plural categories: سؤال واحد، سؤالان، ٣ أسئلة، ١١ سؤالًا، ١٠٠ سؤال |
| Copy | All interface text, validation messages and server errors are in Modern Standard Arabic. `arabicErrorMessage()` maps SDK error codes, so raw English exceptions never reach users. AI grading rationales are requested in Arabic too |
| Theme | Andalusian zellige palette (ivory, teal, terracotta, gold), eight-pointed-star frieze, round gold timer medallion, faint geometric background. A matching night palette is used for dark mode |

Two RTL bugs that the mobile E2E caught and that are now fixed, kept here as rules:

- **Never hide things with a negative `inset-inline-start`.** In RTL that pushes them past the right edge and creates horizontal scroll. Hide with `clip-path` instead.
- **Absolutely positioned screen-reader labels inside an `overflow: auto` table escape the scroller** unless the scroller is `position: relative`. In RTL they land off the left edge and widen the page.
## Exam integrity features

| Feature | How it works |
| --- | --- |
| **Server autosave** | Answers and review flags are saved to `drafts/{sessionId}` about 1.2 s after each change, and immediately when the tab is hidden. The rules accept draft writes only from the session's candidate, only while the session is live, stamped with server time. The candidate sees «حُفِظت إجاباتك على الخادم ١١:٥٧ ص». |
| **Lost devices** | If a session expires without a submission, the server turns the last draft into the submission (`completedBy: SERVER_DRAFT`) and grades it. This runs in the scheduled sweep, and also immediately when the candidate reconnects. |
| **Question navigator** | Numbered boxes (١، ٢، ٣…) show answered, unanswered and flagged questions. «علِّم للمراجعة» flags a question. The submit confirmation lists unanswered and flagged questions with jump links. |
| **Pass mark** | The examiner sets a pass percentage, or leaves it empty for a score with no verdict. The dashboard shows ناجح/راسب per candidate and the pass rate. |
| **Result release** | «فور اكتمال التصحيح» or «عندما أنشر النتائج يدويًّا». Scores reach candidates **only** through `results/{sessionId}`, which only Cloud Functions write, and only once release is allowed. Candidates can't read their own submission after it is graded, so a score can never leak early. |

## Internationalisation

The app is **Arabic-only by design**. Copy is written directly in Modern Standard Arabic in the
templates, and every number, date, clock, percentage and counted noun goes through `Intl`
(`libs/ui-arabic`). Angular's `@angular/localize` is **not** used: it produces one build per
language, which adds nothing for a single-language app.

If you later need English or French as well, the migration path is:

1. Add `@angular/localize` and mark templates with `i18n` attributes and code strings with `$localize`.
   Arabic stays the source language (`"sourceLocale": "ar"`).
2. Extract with `ng extract-i18n`, translate the XLIFF files, and build per locale (`/ar/`, `/en/`).
3. Make `APP_LOCALE` and `dir` follow the active locale. The CSS logical properties already make
   LTR layouts work without changes.

For switching language at runtime without a reload, use a runtime library such as Transloco instead.
## Question types & grading

| Type | Candidate sees | Graded by |
| --- | --- | --- |
| **Multiple choice** | Radio buttons | Automatically, server-side, against the private answer key |
| **Written answer** | A text area with a character limit | The examiner, optionally helped by an AI suggestion |

For written questions the examiner writes **grading criteria** and an optional **model answer**.
Both are stored in the owner-only `private/answerKey` document, next to the multiple-choice key,
so candidates never receive them.

How grading flows:

1. On submit, `gradeSubmission` scores multiple choice. If the exam has written questions the
   submission becomes **Needs review** (`autoScore` set, `score` withheld). Otherwise it's **Graded**.
2. The examiner clicks **Grade** on the dashboard. Each written answer is shown with its rubric.
3. **Suggest grade with AI** (optional) calls `suggestTextGrade`, which sends the question, rubric,
   model answer and student answer to the model and stores `{points, rationale}` as an
   *advisory* suggestion. It never changes the score.
4. **Save grade** calls `gradeTextAnswer` with whatever points the examiner chose: the suggestion,
   or an override. Once every written answer has a grade, the submission becomes **Graded** with
   the final total.

Submissions stay immutable to every client, examiners included (proved in the rules tests). The two
callables are the only write path, and they verify exam ownership server-side.

### AI-assisted grading (free option)

This uses the Google **Gemini API free tier** (an AI Studio key; no credit card needed).

1. Get a key at https://aistudio.google.com/apikey
2. For production, run this:

```bash
npx firebase functions:secrets:set GEMINI_API_KEY
```

3. For local emulators, create `functions/.secret.local` containing `GEMINI_API_KEY=your-key`.
   It's git-ignored.

The model defaults to `gemini-flash-latest` and can be changed through the `GEMINI_MODEL` param.
Without a key, the **emulator** uses a clearly labelled mock (length-based, no AI call) so the
workflow can be tested. In production the button reports that AI grading isn't configured.

> **Privacy:** on the free tier Google may use prompts to improve its products, and prompts contain
> student answers. For real student data, use a paid Gemini key or Vertex AI. Free-tier rate limits
> are low (about 10 requests/minute at the time of writing), so the button returns a "quota reached"
> message under load.

Prompt-injection defences: the answer is wrapped in delimiters the student can't close, the system
prompt tells the model to treat it as data, the output is forced to a JSON schema and clamped to
`[0, max]` in half points, and **a human always confirms**.
## Architecture

```
libs/
  contracts/               Dependency-free schema + grader. Shared verbatim with functions/.
  data-access-exams/       Firebase DI, snapshot→signal bridge, stores, gateways.
  feature-exam-creator/    Signal Forms builder for dynamic question sets & time windows.
  feature-exam-runner/     Exam-taking surface driven by an explicit FSM.
  feature-exam-history/    Live examiner dashboard.
src/app/                   Shell: routes, guard, home, sign-in.
functions/                 startSession · gradeSubmission · gradeTextAnswer · suggestTextGrade ·
                           sweepExpiredSessions.
firestore.rules            Zero-trust security model.
tests/rules/               Security rules suite.
```

Boundaries are enforced by `tsconfig` path aliases (`@exam/*`). Features import only
`@exam/contracts` and `@exam/data-access-exams`, never each other.

### Data model & why it's split

Firestore rules authorize whole documents, never fields, so each secret lives in its own document:

| Path | Contains | Readable by |
| --- | --- | --- |
| `exams/{id}` | metadata | owner |
| `exams/{id}/paper/current` | questions, no answers | owner; candidate **while their session is live** |
| `exams/{id}/private/answerKey` | correct options | owner (grader uses Admin SDK) |
| `accessCodes/{code}` | lobby card | any signed-in user, exact `get` only |
| `sessions/{examId_uid}` | authoritative timer | candidate + owner; **no client writes** |
| `submissions/{examId_uid}` | answers, server score | candidate + owner; create-once before expiry |

### Timer integrity

- **Minting**: `startSession` (callable) stamps `startedAt`/`expiresAt` from the server clock. It caps
  `expiresAt` at the exam window's close, and it is idempotent, so a reconnect gets the same session.
- **Enforcement**: the rules accept a submission only if `request.time <= session.expiresAt`, and the
  submission's `expiresAt` must equal the session's. *No client input takes part in the deadline
  check.* Because `create` has no `resource.data`, the rule pins `request.resource.data.expiresAt` to
  the session's value. Submissions are immutable afterwards, so there is no update path to guard.
- **Display**: the client calibrates a clock offset from the callable's `serverNow` (NTP midpoint)
  and always renders `expiresAt − serverNow()`. It never decrements a counter, so throttled
  background tabs and skewed local clocks can't drift it.
- **Auto-submit** fires `AUTO_SUBMIT_LEAD_MS` (2.5 s) before expiry so the write lands inside the
  strict server deadline.

### Exam runner FSM

`libs/feature-exam-runner/src/lib/exam-runner.machine.ts` is a pure `(state, event) → state`
reducer. The phases are `LOADING → LOBBY → STARTING → ACTIVE → SUBMITTING → SUBMITTED | EXPIRED`,
plus `FAILED`. Every time-dependent decision reads `now` from the event, which makes it
deterministic under test. `ExamRunnerStore` runs the side effects on phase entry: the session call,
a 250 ms ticker, `visibilitychange`, `beforeunload`, and draft persistence for reload-resume.

### Angular conventions

- Zoneless (`provideZonelessChangeDetection()`). Note that `provideExperimentalZonelessChangeDetection`
  was renamed in v20, and zoneless has been the default since v21.
- OnPush by default (v22), `input()`/`output()`/`computed()`/`linkedSignal()`, `@Service()`, native
  control flow.
- Firestore listeners are bridged into streaming `resource()`s
  (`data-access-exams/src/lib/firestore-resource.ts`). There's no AngularFire, no zone patching, and
  no manual subscriptions.
- Signal Forms (`@angular/forms/signals`) for every form, including nested `applyEach` validation of
  questions and options.

## Deploying

1. Create a Firebase project. Enable **Google** sign-in, **Anonymous** sign-in and Firestore.
   Cloud Functions need the **Blaze** plan.
2. Put the web config in `src/environments/environment.production.ts` and the project id in
   `.firebaserc`.
3. Build the app:

```bash
npm run build
```

4. Deploy:

```bash
npx firebase deploy
```

## Known limits / next steps

- Firestore and Functions SDKs ship in the initial bundle (≈220 kB gzipped). Lazy-provide them per
  feature to shrink it.
- Integrity signals (tab switches) are client-reported and therefore advisory. Timing and grading
  are the only server-guaranteed properties.
- Question types: single-answer multiple choice and written answer. Exams aren't locked against edits after the first session starts.
- Text answer length is enforced in the UI and by the grader, not by Firestore rules (rules can't iterate maps). The 1 MiB document limit is the hard cap.
- Add App Check to bind callable and Firestore traffic to the genuine app.
