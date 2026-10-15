# Exam Platform

Timed exam platform built on **Angular 22** (standalone, zoneless, signals, Signal Forms) and
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

1. **Examiner sign-in**: with emulators, use the *Local emulator sign-in* box. Any email works, and
   different emails act as different, isolated examiners.
2. **New exam**: the default is a 5-minute exam open for 24 hours. Publish it to get a 6-character code.
3. **Candidate**: open the link in a *different browser profile or a private window* (auth is
   per-origin, so the same window would reuse the examiner identity). Enter a name and press Start.
4. Watch the row on the examiner dashboard go *In progress → Grading… → Graded*, live.

The emulator UI is at http://localhost:4000.

## Tests

| Command | What it proves |
| --- | --- |
| `npm test` | Unit tests (Vitest via `ng test`): exam-runner FSM, grader, dashboard derivations, clock offset |
| `npm run test:rules` | `@firebase/rules-unit-testing` suite against the Firestore emulator (35 cases) |

The rules suite proves, among other things, that a candidate **cannot**:

- read the answer key, even mid-exam, or list `private/*`
- read the paper before their session exists or after it expires
- create, extend, revive or delete their session (all session writes are denied)
- submit after `expiresAt`, forge a later `expiresAt`, backdate `submittedAt`, or self-assign a `score`
- overwrite, edit or delete a submission once made
- read or submit into another candidate's session or submission

It also proves that examiners can only see their own exams, answer keys and submissions, and cannot
hijack another examiner's access code.

## Architecture

```
libs/
  contracts/               Dependency-free schema + grader. Shared verbatim with functions/.
  data-access-exams/       Firebase DI, snapshot→signal bridge, stores, gateways.
  feature-exam-creator/    Signal Forms builder for dynamic question sets & time windows.
  feature-exam-runner/     Exam-taking surface driven by an explicit FSM.
  feature-exam-history/    Live examiner dashboard.
src/app/                   Shell: routes, guard, home, sign-in.
functions/                 startSession · gradeSubmission · sweepExpiredSessions.
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
- Questions are single-answer multiple choice. Exams aren't locked against edits after the first
  session starts.
- Add App Check to bind callable and Firestore traffic to the genuine app.
