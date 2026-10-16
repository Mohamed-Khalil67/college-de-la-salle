# Collège de la Salle — Daher · الثانوية العامة، القسم العربي

A bilingual web portal and timed exam platform for the Arabic section (Thanaweya Amma) of Collège
de la Salle, Daher (Cairo, founded 1898). Built on **Angular 22** (standalone, zoneless, signals,
Signal Forms, prerendering with hydration), **Tailwind CSS v4** and **Firebase** (Auth, Firestore,
Cloud Functions). Two experiences share one app:

1. **Public portal.** Free and open, with flat navigation: الرئيسية · عن المدرسة وتاريخها ·
   اللغة العربية (Arabic, RTL) · Mathématiques · Physique-Chimie (French, LTR) · بنك الامتحانات ·
   Mode Enseignant. All pages are prerendered for SEO and an instant first paint.
2. **Teacher Mode.** Teachers edit page content in place (summaries, syllabi, downloads,
   announcements, the school timeline) and create timed exams for each subject. The exams then appear
   in the bank (`/exams`) and on the subject's page, free for any student to take.

The design rule is **never trust the client**: not its clock, not its writes, and not its curiosity
about the answer key.

```
teacher ──Mode Enseignant──▶ content_pages/{page}  (inline edit, optimistic, rules: token.teacher == true)
teacher ──creates──▶ exam (meta · paper · private answer key · code) + practice card for its subject
student ──subject page / bank──▶ startSession() ──▶ server mints startedAt/expiresAt     [Cloud Function]
student ──reads own paper (only while live) ──▶ answers ──▶ submission                   [rules: request.time ≤ expiresAt]
submission created ──▶ gradeSubmission() ──▶ score written                               [Cloud Function, Admin SDK]
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

Seed the emulator. The first command makes every `@example.test` account a teacher; the second
creates the super admin, who only manages *who* is a teacher:

```bash
npm run seed:emulator
```

```bash
npm run bootstrap:superadmin -- admin@example.test
```

Then open http://localhost:4200:

- `/` is Accueil. `/ar/histoire`, `/ar/matiere/arabe`, `/fr/matiere/mathematiques` and
  `/fr/matiere/physique-chimie` are the content pages; `/exams` is the exam bank.
- **Mode Enseignant** (navbar) leads to sign-in and back to the page you were on. With the emulators,
  use the *الدخول عبر المحاكي المحلي* box: `teacher@example.test` is a teacher, `student@students.test`
  is not. A floating «Mode Enseignant» switch then appears on every page; turn it on and each section
  gets a «Modifier» button.
- To act as a second person, use a *different browser profile or a private window* (auth is
  per-origin). The emulator UI is at http://localhost:4000.

## Teachers and Teacher Mode

| Concern | How it works |
| --- | --- |
| **Who is a teacher** | The `teacher` custom claim (`request.auth.token.teacher == true`). It is set only by Cloud Functions, from `examiner_directory` (an email, or a whole `@domain`), and re-checked at every sign-in. The rules check this one claim for every write to `content_pages` and `exams` |
| **Granting** | `manageExaminerRole` (callable) is restricted to the **super admin** (`role == 'super_admin'`), the one account that manages the teacher list at `/admin`. It has no other powers over content. It writes an immutable `audit_logs` line, and revoking a teacher revokes their refresh tokens and stamps `user_metadata.revokeTime`, which the rules enforce (a stale token loses access at once) |
| **Bootstrap** | `npm run bootstrap:superadmin -- you@school.edu --project <id>` is idempotent |
| **Inline editing** | Each section is wrapped in `<portal-editable>`: hero, summary, timeline, chapters, resources, announcements. The editor is a Signal Forms form in the page's language (French on French pages), validated before saving, and URLs must be `https` or site-relative |
| **Optimistic saves** | `ContentStore.save()` updates the page at once through signals; if Firestore rejects the write, the page rolls back and the editor reopens with the error |
| **Storage** | `content_pages/{pageId}` with a fixed schema (`Hero`, `HistoryTimeline`, `SyllabusChapter`, `ResourceItem`, `Announcement`, see `libs/contracts/src/content.ts`). Public pages render bundled defaults first (prerendered), then the live Firestore copy. Everything coming back from Firestore passes `sanitizePage()`, which drops unsafe URLs and malformed items |
| **Exams per subject** | In the exam creator a teacher picks the subject (اللغة العربية / Mathématiques / Physique-Chimie) and ticks «عرضه في صفحة المادة». While the exam is published and open by code, a card appears in `practice_catalog`, listed in the bank and on the subject's page. Any student can start it without an account |

> The exam runner itself is Arabic-only, including for exams in French. The questions and answers
> are shown as authored, with each block's direction handled automatically, but the buttons and
> messages around them are Arabic.

## Public portal

| Concern | Implementation |
| --- | --- |
| Rendering | `outputMode: "static"`. The five public routes are **prerendered** (`app.routes.server.ts`), each with its own `<html lang dir>` (`ar`/`rtl` or `fr`/`ltr`). Exam, sign-in and dashboards are client-rendered from `index.csr.html` and lazy-loaded. Deploys to plain Firebase Hosting |
| Language and direction | A route declares its language with `withLang('ar' \| 'fr', …)`; a resolver sets `<html lang dir>` before render. French pages use Inter and tighter leading, Arabic pages use Cairo (`:root:lang(fr)` in `styles.scss`). CDK `Dir` follows the page |
| Design system | Lasallian navy `#0F2C59`/`#0A192F`, antique gold `#C5A880`, cream `#F5EBE0`, on slate-white. Tailwind v4 (theme + utilities only; no preflight) over CSS custom properties, so the same utilities follow the light/dark toggle. Tailwind's logical utilities only: `ms-`, `ps-`, `start-`, `text-start`, never `ml-`/`left-` |
| Cascade | The legacy global styles live in `@layer base` / `@layer components`, so Tailwind utilities always win |
| Heritage showcase | Interactive tablist (arrow keys follow the direction, Home/End) with a milestone per tab and a fixed 3:2 picture box. Dates come from the school administration |
| Images | `NgOptimizedImage` with `fill` inside aspect-ratio containers and a blur placeholder, so nothing shifts. **The pictures are drawn illustrations, labelled as such**, until real photographs replace the files in `public/images/heritage/` |
| SEO | Per-route titles («… — Collège de la Salle») and meta descriptions set by route resolvers, so they are in the static HTML |
| Bundle | Firestore and Cloud Functions are separate entry points, so the portal ships Auth only: initial bundle **512 kB raw / 142 kB transferred**. Live content loads lazily after the first render |
| Layout stability | The E2E suite measures cumulative layout shift from first paint (asserted ≤ 0.01) across language changes |

> **Content to confirm before launch.** The milestone dates are the school's (founded 1898; campus
> 1905; chapel 1954–1958, inaugurated December 1958; Khoronfish sections 1957). The surrounding text,
> the announcements and the syllabus outlines are drafts, and the pages say so until a teacher saves
> them. Separately, the Lasallian archive at lasalle-po.org gives 1956 for the Khoronfish transfer and
> 26 November 1955 for the opening of the new buildings. Please confirm which dates the school wants.
## Tests

| Command | What it proves |
| --- | --- |
| `npm test` | 102 unit tests (Vitest via `ng test`): exam-runner FSM, graders, delivery/shuffle, role resolution, content model and sanitizer, section editor, content store, AI prompt/parse, dashboard derivations, clock offset |
| `npm run test:rules` | 85 `@firebase/rules-unit-testing` cases against the Firestore emulator |
| `npm run test:e2e` | Playwright on desktop and mobile (Pixel 7). Global setup seeds the teacher directory, bootstraps the super admin and resets teacher-edited content |

What the E2E scenarios cover:
- **Arabic RTL ↔ French LTR**: Accueil → اللغة العربية → Mathématiques → Physique-Chimie → back. Direction, `lang`, fonts (Cairo/Inter), the isolated French school name, brand position and no overflow are checked on every step, plus cumulative layout shift;
- **prerendering**: every public page's HTML response already holds its content and the right `<html lang dir>`; the heritage tabs work with the mouse and with direction-aware arrow keys;
- **Teacher Mode**: log in from the navbar, switch the mode on, fail validation in French, rename a Mathématiques chapter, see it update instantly, then persist across a reload and show to an anonymous visitor;
- **a timed exam**: a teacher lists a one-minute exam on the Arabic page, a student starts it from there without an account, and the runner auto-submits when the timer ends;
- the super admin grants a teacher, who refreshes claims and schedules an exam; the revocation is enforced and audited;
- a teacher creates an exam and a candidate completes it in RTL, with flags and autosave; a device dies mid-exam and the server submits the draft;
- invite-only exams with a question bank, the lock, close and duplicate.

Every page visited is checked for direction matching its language, no horizontal overflow, no replacement characters, the right loaded face, diacritic-safe line-height, and **no untranslated text** (Latin words in Arabic copy; French is allowed only where the page marks `lang="fr"`).

The rules suite proves, among other things, that:

- signed-out visitors **can** read content pages and practice cards, and **can't** read question banks, answer keys or rubrics;
- only a teacher can write `content_pages` (validated for id, language, sizes, shape, server time and author), and a teacher whose access was revoked, with a stale token, can't;
- only the super admin can read the teacher directory and the audit log. Nobody, the super admin included, can write either from a client, and audit lines can't be edited or deleted;
- the `role` claim alone grants nothing: only `teacher: true` unlocks authoring;
- a candidate can't read the answer key, extend or forge the timer, submit after `expiresAt`, self-assign a score, or touch another candidate's work;
- a practice card must match a published, code-access exam owned by its author.
## Arabic and RTL architecture

| Concern | Implementation |
| --- | --- |
| Direction | `<html lang dir>` follows the page: `ar`/`rtl` or `fr`/`ltr`. CDK `Dir` follows too, so `Directionality` is right for any CDK component |
| Layout | CSS logical properties only (`margin-inline`, `padding-block`, `inset-inline-start`, `border-inline-start`, `text-align: start`). No physical left/right rules anywhere |
| Typography | **Cairo** on Arabic pages, **Inter** on French pages, Noto Naskh Arabic kept for exam question text (best tashkeel legibility). All are self-hosted through `@fontsource` |
| Diacritics | Line-height budgets: interface 1.75, question text 2.15, titles 1.6. No `letter-spacing` on Arabic, which would break cursive joins |
| Mixed script | «Collège de la Salle» is a `<bdi lang="fr" dir="ltr">` with `unicode-bidi: isolate` and `white-space: nowrap`. Formulas such as `V = I R` are isolated LTR runs. User-authored text uses `examIsolate` (`dir="auto"` + `unicode-bidi: plaintext`), and inline emails and codes use `<bdi>` |
| Numbers and dates | `Intl` with **`ar-EG-u-nu-arab`** (Egyptian conventions, Arabic-Indic digits). School-content dates are pinned to `Africa/Cairo`, so the prerendered HTML and the hydrated page agree |
| Counted nouns | All six Arabic plural categories: سؤال واحد، سؤالان، ٣ أسئلة، ١١ سؤالًا، ١٠٠ سؤال |
| Copy | All interface text, validation messages and server errors are in Modern Standard Arabic |
| Theme | Lasallian navy, antique gold and cream. A ☾/☀ toggle is remembered per person; prerendered HTML carries no theme, so dark-mode visitors see no flash |

RTL rules learned from the mobile E2E:

- **Never hide things with a negative `inset-inline-start`.** In RTL that creates horizontal scroll. Hide with `clip-path`.
- **Absolutely positioned screen-reader labels inside an `overflow: auto` table escape the scroller** unless the scroller is `position: relative`.
- **A `display: grid` page needs `grid-template-columns: minmax(0, 1fr)`.** Otherwise an implicit track grows to a wide table's minimum width and the whole page scrolls sideways.
- **Emails and other long Latin tokens in Arabic sentences go in `<bdi>`.** This includes visually hidden labels, which screen readers read too.

## Exam integrity features

| Feature | How it works |
| --- | --- |
| **Server autosave** | Answers and flags are saved to `drafts/{sessionId}` ~1.2 s after each change and when the tab is hidden; rules accept only the session's candidate while the session is live |
| **Lost devices** | An expired session without a submission is submitted from its last draft by the server and graded |
| **Question navigator** | Answered / unanswered / flagged boxes; the submit confirmation lists gaps with jump links |
| **Pass mark & result release** | Optional pass percentage; scores reach candidates only through server-written `results/{sessionId}`, immediately or when the examiner publishes |
| **Invite-only exams** | Roster of up to 300 verified emails; `startSession` admits only those; invitations appear on `/exams` |
| **Question bank & shuffle** | Server draws N questions and shuffles questions/options with a CSPRNG; the candidate receives only their own paper; the grader maps answers back |
| **Lifecycle** | مسودة → منشور → مغلق; the first start locks questions, key, timing and scoring |

## Question types & grading

| Type | Candidate sees | Graded by |
| --- | --- | --- |
| **Multiple choice** | Radio buttons | Automatically, server-side, against the private answer key |
| **Written answer** | A text area with a character limit | The examiner, optionally helped by an AI suggestion (Gemini) |

AI suggestions are advisory: they're stored next to the answer, never change the score, and a human
always confirms. For local emulators put `GEMINI_API_KEY=…` in `functions/.secret.local`
(git-ignored); for production run this:

```bash
npx firebase functions:secrets:set GEMINI_API_KEY
```

> **Privacy:** on the free tier Google may use prompts (which contain student answers) to improve
> its products. For real student data use a paid Gemini key or Vertex AI.

## Architecture

```
libs/
  contracts/               Dependency-free schema, grader, delivery and role logic. Shared verbatim with functions/.
  data-access-auth/        Firebase app + Auth, AuthStore (role/teacher signals, refreshClaims), roleGuard.
                           /data: Firestore, Functions, snapshot→signal bridge, RoleAdminStore.
  data-access-curriculum/  Bundled default content + ContentStore (optimistic saves, live Firestore overlay).
                           /practice: the live practice-exam catalog.
  data-access-exams/       Exam authoring, sessions, dashboards, reviews.
  feature-portal/          Home, history + heritage showcase, subject pages (ar/fr), Teacher Mode (editor).
                           /practice: the practice-exam list.
  feature-admin-panel/     Super-admin console: who is a teacher, grant/revoke, audit log.
  feature-exam-creator/    Signal Forms builder: questions, timing, delivery, access, subject.
  feature-exam-runner/     Exam-taking surface driven by an explicit FSM.
  feature-exam-history/    Live examiner dashboard.
  ui-arabic/               Intl formatting, pipes, bidi, ornaments, theme, share panel.
src/app/                   Shell: flat sticky navigation, routes, server routes, sign-in, exam bank (/exams).
functions/                 refreshRole · manageExaminerRole · startSession · gradeSubmission ·
                           gradeTextAnswer · suggestTextGrade · publishResults · sweep.
scripts/                   bootstrap-superadmin.ts · seed-emulator.mjs
firestore.rules            Zero-trust security model.
tests/rules/               Security rules suite.
e2e/                       Playwright suite.
```

Boundaries are enforced by `tsconfig` path aliases (`@exam/*`). Dependencies flow one way:
`contracts ← data-access-* ← feature-* ← app`.

### Data model & why it's split

Firestore rules authorize whole documents, never fields, so each secret lives in its own document:

| Path | Contains | Readable by |
| --- | --- | --- |
| `content_pages/{pageId}` | editable page content (hero, summary, timeline, chapters, resources, announcements) | **anyone**; written only by teachers |
| `practice_catalog/{examId}` | a practice exam card (no questions) | **anyone**; written by the exam's owner |
| `examiner_directory/{entry}` | who is a teacher | super admin; server-written |
| `audit_logs/{id}` | every role change | super admin; server-written, immutable |
| `user_metadata/{uid}` | `revokeTime` | nobody (rules and server only) |
| `exams/{id}` | metadata | owner with a live teacher claim |
| `exams/{id}/paper/current` | the full question pool, no answers | owner only |
| `exams/{id}/private/answerKey` | correct options + rubrics | owner (grader uses Admin SDK) |
| `exams/{id}/private/roster` | invited emails | owner |
| `sessionPapers/{sessionId}` | this candidate's drawn and shuffled paper | owner; candidate **while their session is live** |
| `invitations/{examId__email}` | invitation card | owner; the invited verified email |
| `accessCodes/{code}` | lobby card | any signed-in user, exact `get` only |
| `sessions/{examId_uid}` | authoritative timer | candidate + owner; **no client writes** |
| `submissions/{examId_uid}` | answers, server score | candidate + owner; create-once before expiry |

> **Why practice questions aren't world-readable.** The brief asks for active exam questions to be
> readable by anyone. They are instead released per candidate when the timer starts
> (`sessionPapers`). Otherwise anyone could read a timed exam before starting it. Practice exams
> stay free-access: visitors see the card publicly and start without an account (an anonymous
> identity is created transparently).

### Timer integrity

- **Minting**: `startSession` stamps `startedAt`/`expiresAt` from the server clock, capped at the
  exam window's close; it is idempotent.
- **Enforcement**: the rules accept a submission only if `request.time <= session.expiresAt`, with
  the submission's `expiresAt` pinned to the session's.
- **Display**: the client renders `expiresAt − serverNow()` from a calibrated clock offset; it never
  decrements a counter.
- **Auto-submit** fires 2.5 s before expiry so the write lands inside the server deadline.

### Angular conventions

- Zoneless (`provideZonelessChangeDetection()`). The brief's `provideExperimentalZonelessChangeDetection`
  was renamed in v20, and zoneless has been the default since v21.
- OnPush by default (v22), `input()`/`output()`/`model()`/`computed()`/`linkedSignal()`, `@Service()`,
  `inject()`, native control flow, host bindings in `host: {}`, Signal Forms everywhere.
- Firestore listeners are bridged into streaming `resource()`s. There's no AngularFire, no zone
  patching, and no manual subscriptions.
- No `any`, no `$any()` and no non-null assertions in templates. Verified with the Angular CLI MCP
  (`get_best_practices`, `run_target build/test`).

## Deploying

1. Create a Firebase project on the **Blaze** plan. Enable **Google** and **Anonymous** sign-in and
   Firestore. Add your hosting domain to *Authentication → Settings → Authorized domains*.
2. Put the web config in `src/environments/environment.production.ts` and the project id in
   `.firebaserc`.
3. Deploy (rules, indexes, functions, hosting):

```bash
npm run build
```

```bash
npx firebase deploy
```

4. The super admin signs in once with Google, then you seed the role:

```bash
npm run bootstrap:superadmin -- you@school.edu --project your-project-id
```

Hosting serves the prerendered pages as files and rewrites every other path to `index.csr.html`
(see `firebase.json`).

## Known limits / next steps

- Integrity signals (tab switches) are client-reported and advisory. Timing, grading and
  authorization are server-guaranteed.
- Teacher-uploaded files (downloadable sheets) are links for now: a teacher pastes an https URL. Uploading to Cloud Storage is the natural next step.
- The exam runner's own interface is Arabic only, also for exams written in French.
- Page content is replaced section by section, last write wins; there is no edit history yet.
- Domain-wide revocation enumerates accounts with `listUsers`. That's fine for a school; for very
  large tenants, move it to a background task.
- Add App Check to bind callable and Firestore traffic to the genuine app.
