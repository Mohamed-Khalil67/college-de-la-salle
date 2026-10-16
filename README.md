# Collège de la Salle — القسم العربي

A right-to-left Arabic platform for the Arabic section (Thanaweya Amma) of Collège de la Salle,
built on **Angular 22** (standalone, zoneless, signals, Signal Forms, SSR/prerender with
hydration) and **Firebase** (Auth, Firestore, Cloud Functions). It has two tiers:

1. **Public school portal**: landing page, school history, news, gallery, the Arabic section
   hub, and one hub per subject (Arabic, Physics, Chemistry, Mathematics). All of it is prerendered
   for SEO and an instant first paint.
2. **Timed exam engine** behind a zero-trust role system (super admin → examiners → examinees). The
   design rule is **never trust the client**: not its clock, not its writes, and not its curiosity
   about the answer key.

```
super admin ──manageExaminerRole()──▶ examiner_directory + role claim + audit_logs   [Cloud Function]
examiner ──creates──▶ exam (meta · paper · private answer key · code · practice card)  [one atomic batch]
visitor ──subject hub / code──▶ startSession() ──▶ server mints startedAt/expiresAt   [Cloud Function]
candidate ──reads own paper (only while live) ──▶ answers ──▶ submission              [rules: request.time ≤ expiresAt]
submission created ──▶ gradeSubmission() ──▶ score written                            [Cloud Function, Admin SDK]
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

Seed the emulator. The first command makes every `@example.test` account an examiner; the second
creates the super admin:

```bash
npm run seed:emulator
```

```bash
npm run bootstrap:superadmin -- admin@example.test
```

Then open http://localhost:4200.

- `/` is the school's landing page. The «عن المدرسة», «الأقسام» and «المواد الدراسية» menus lead to
  history, news, gallery, the Arabic section and the subject hubs.
- `/exams` is the candidates' page: enter a code, or sign in to see your invitations.
- **Sign-in** (تسجيل الدخول): with emulators, use the *الدخول عبر المحاكي المحلي* box.
  `admin@example.test` lands on `/admin`, `teacher@example.test` on the examiner dashboard, and
  any other address (e.g. `student@students.test`) on `/exams`.
- To give a candidate the same identity again, use a *different browser profile or a private
  window*: auth is per-origin.

The emulator UI is at http://localhost:4000.

## Roles (zero-trust RBAC)

| Role | Who | Can |
| --- | --- | --- |
| `super_admin` | Seeded by `scripts/bootstrap-superadmin.ts` | Everything an examiner can, plus grant or revoke examiner access at `/admin` and read the audit log |
| `examiner` | Granted by the super admin (one email, or a whole `@domain`) | Create, edit and grade their own exams; list practice exams on subject hubs |
| `examinee` | Everyone else, including anonymous visitors | Take exams by code or invitation, read the public portal |

- **The role is a custom claim** (`role`), set only by Cloud Functions from
  `examiner_directory/{email | @domain}`. The rules check `request.auth.token.role`, never a value
  the client supplies.
- **`manageExaminerRole`** (callable) requires `token.role == 'super_admin'`. It validates the
  target, updates the directory, and writes an immutable `audit_logs` line in the same
  transaction. It then applies the change to existing accounts right away. Accounts that don't
  exist yet get the role at their first sign-in.
- **Revocation closes the stale-token window.** A downgrade revokes the account's refresh tokens
  (`auth.revokeRefreshTokens`) and stamps `user_metadata/{uid}.revokeTime`. The rules
  (`tokenFresh()`) and the examiner callables reject any ID token whose `auth_time` predates it,
  so an old token can't keep examiner access for the rest of its hour. Every owner-side path
  (exams, answer keys, submissions) needs a *live* examiner role, not just ownership.
- **Claims refresh without signing out.** `AuthStore.refreshClaims()` asks the server to
  re-evaluate the role, then calls `getIdToken(true)`. A newly granted examiner clicks
  «تحديث صلاحياتي» on `/exams`.
- **Route guards** are functional: `roleGuard('examiner')` and `roleGuard('super_admin')`. Roles
  are hierarchical. Guards are UX only; authorization lives in the rules and the functions.
- **Bootstrap** is idempotent: running `npm run bootstrap:superadmin -- you@school.edu` again
  changes nothing. Against production, pass `--project <id>` with Application Default
  Credentials.

## Public portal, SSR and performance

| Concern | Implementation |
| --- | --- |
| Rendering | `outputMode: "static"`. Public routes are **prerendered** at build time (`app.routes.server.ts`, including one page per subject via `getPrerenderParams`). Exam, sign-in and admin routes are **client-rendered** from `index.csr.html`. It deploys to plain Firebase Hosting, with no Node server |
| Hydration | `provideClientHydration(withEventReplay())`: the browser reuses the prerendered DOM, and clicks made before the bundle loads are replayed |
| SEO | Route titles via `ArabicTitleStrategy` («… — Collège de la Salle»), per-page `meta description` (subject pages through a route resolver, so it's in the static HTML), `og:locale ar_EG` |
| Bundle budget | Firestore and Cloud Functions are separate entry points (`@exam/data-access-auth/data`, `@exam/data-access-curriculum/practice`), so the portal ships Auth only. Initial bundle **500 kB raw / 138 kB transferred** (was 956 kB); everything else is lazy per route |
| Images | `NgOptimizedImage` with explicit width/height (space is reserved, no shift), `priority` on the hero, lazy loading below the fold |
| Layout stability | E2E measures cumulative layout shift from first paint: **0.000 on mobile, ≈0.002–0.004 on desktop** (threshold asserted: ≤ 0.01) |
| Curriculum | `libs/data-access-curriculum`: typed taxonomy (tracks أدبي / علمي علوم / علمي رياضة, subjects with branches, syllabus trees, objectives, study guides, context modules such as «تاريخ اللغة العربية في مصر»), served by a signal store |
| Practice exams | An examiner assigns an exam to a subject and ticks «عرضه في صفحة المادة». While it is published and open by code, a card appears in `practice_catalog`. Subject hubs list these cards live, and any visitor can start the timed exam without an account |

> **Content to replace before launch.** The school history is an introductory draft, the news items
> are samples, and the gallery images are illustrative artwork. The pages label them as such
> («نصّ تمهيدي», «خبر تجريبي», «رسم توضيحي»). Edit `libs/data-access-curriculum/src/lib/curriculum.data.ts`
> and `public/images/`, and have each department check the syllabus outlines against the
> Ministry's current-year syllabus.

## Tests

| Command | What it proves |
| --- | --- |
| `npm test` | 87 unit tests (Vitest via `ng test`): exam-runner FSM, graders, delivery/shuffle, role resolution, curriculum store, AI prompt/parse, dashboard derivations, clock offset |
| `npm run test:rules` | 82 `@firebase/rules-unit-testing` cases against the Firestore emulator |
| `npm run test:e2e` | Playwright on desktop and mobile (Pixel 7). Global setup seeds the examiner directory and bootstraps the super admin |

What the E2E scenarios cover:
- the landing page → «الأقسام» dropdown → Arabic section → a timed Arabic practice exam, with CLS and BiDi checks on the French name;
- every public page served prerendered, with Latin formulas isolated;
- the super admin grants examiner rights; the user refreshes claims and schedules an exam; the revocation is enforced and audited;
- an examiner creates an exam and a candidate completes it in RTL, with flags and autosave;
- a device dies mid-exam and the server submits the draft;
- invite-only exams with a question bank, the lock, close and duplicate.

Every page visited is checked for RTL direction, no horizontal overflow, no replacement characters, loaded Arabic fonts, diacritic-safe line-height, and **no untranslated text**.

The rules suite proves, among other things, that:

- signed-out visitors **can** read school content and practice cards, and **can't** read question banks, answer keys or rubrics;
- only the super admin can read the examiner directory and the audit log. Nobody, the super admin included, can write either from a client, and audit lines can't be edited or deleted;
- a token minted before a revocation loses examiner access even though its claim still says `examiner`, and the legacy boolean `examiner` claim grants nothing;
- a candidate can't read the answer key, extend or forge the timer, submit after `expiresAt`, self-assign a score, or touch another candidate's work;
- a practice card must match a published, code-access exam owned by its author.

## Arabic and RTL architecture

| Concern | Implementation |
| --- | --- |
| Direction | `<html lang="ar" dir="rtl">`, plus CDK `Dir` at the app root, so `Directionality` is `rtl` for any CDK component |
| Layout | CSS logical properties only (`margin-inline`, `padding-block`, `inset-inline-start`, `border-inline-start`, `text-align: start`). No physical left/right rules anywhere |
| Typography | Amiri Naskh for titles (with full tashkeel) and for the Latin brand, Noto Naskh Arabic for question text, IBM Plex Sans Arabic for the interface. All are self-hosted through `@fontsource` |
| Diacritics | Line-height budgets: interface 1.75, question text 2.15, titles 1.6. No `letter-spacing` on Arabic, which would break cursive joins |
| Mixed script | «Collège de la Salle» is a `<bdi lang="fr" dir="ltr">` with `unicode-bidi: isolate` and `white-space: nowrap`. Formulas such as `V = I R` are isolated LTR runs. User-authored text uses `examIsolate` (`dir="auto"` + `unicode-bidi: plaintext`), and inline emails and codes use `<bdi>` |
| Numbers and dates | `Intl` with **`ar-EG-u-nu-arab`** (Egyptian conventions, Arabic-Indic digits). School-content dates are pinned to `Africa/Cairo`, so the prerendered HTML and the hydrated page agree |
| Counted nouns | All six Arabic plural categories: سؤال واحد، سؤالان، ٣ أسئلة، ١١ سؤالًا، ١٠٠ سؤال |
| Copy | All interface text, validation messages and server errors are in Modern Standard Arabic |
| Theme | Andalusian zellige palette (ivory, teal, terracotta, gold), eight-pointed-star frieze. ☾/☀ toggle remembered per person |

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
  data-access-auth/        Firebase app + Auth, AuthStore (role signals, refreshClaims), roleGuard.
                           /data: Firestore, Functions, snapshot→signal bridge, RoleAdminStore.
  data-access-curriculum/  Curriculum taxonomy, school content, CurriculumStore. /practice: live catalog.
  data-access-exams/       Exam authoring, sessions, dashboards, reviews.
  feature-portal/          Landing, about (history/news/gallery), Arabic section hub, subject hubs.
  feature-admin-panel/     Super-admin console: directory, search/filter, grant/revoke, audit log.
  feature-exam-creator/    Signal Forms builder: questions, timing, delivery, access, subject.
  feature-exam-runner/     Exam-taking surface driven by an explicit FSM.
  feature-exam-history/    Live examiner dashboard.
  ui-arabic/               Intl formatting, pipes, bidi, ornaments, theme, share panel.
src/app/                   Shell: header with dropdown menus, routes, server routes, sign-in, /exams.
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
| `school_content/*`, `news/*`, `curriculum/*` | portal content (for a future CMS) | **anyone**; no client writes |
| `practice_catalog/{examId}` | a practice exam card (no questions) | **anyone**; written by the exam's owner |
| `examiner_directory/{entry}` | who may author exams | super admin; server-written |
| `audit_logs/{id}` | every role change | super admin; server-written, immutable |
| `user_metadata/{uid}` | `revokeTime` | nobody (rules and server only) |
| `exams/{id}` | metadata | owner with a live examiner role |
| `exams/{id}/paper/current` | the full question pool, no answers | owner only |
| `exams/{id}/private/answerKey` | correct options + rubrics | owner (grader uses Admin SDK) |
| `exams/{id}/private/roster` | invited emails | owner |
| `sessionPapers/{sessionId}` | this candidate's drawn and shuffled paper | owner; candidate **while their session is live** |
| `invitations/{examId__email}` | invitation card | owner; the invited verified email |
| `accessCodes/{code}` | lobby card | any signed-in user, exact `get` only |
| `sessions/{examId_uid}` | authoritative timer | candidate + owner; **no client writes** |
| `submissions/{examId_uid}` | answers, server score | candidate + owner; create-once before expiry |

> **Why practice questions aren't world-readable.** The brief asked for active exam questions to be
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
- Portal content is bundled (prerendered from code). The `school_content` / `news` / `curriculum`
  collections are ready, read-only from clients, for a future CMS.
- Domain-wide revocation enumerates accounts with `listUsers`. That's fine for a school; for very
  large tenants, move it to a background task.
- Add App Check to bind callable and Firestore traffic to the genuine app.
