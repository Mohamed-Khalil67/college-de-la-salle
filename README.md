# Collège de la Salle — Daher

The website of Collège de la Salle, Daher, Cairo (founded 1898): the **Bac nationale** (Egyptian
programme, Thanaweya Amma) and the **Bac français**, with an **Espace élève** and an **Espace
enseignant**. The institutional pages are static and prerendered, in French; everything that changes
during the school year (announcements, homework, resources, grades, the calendar) lives in Firestore
and is written by teachers. Built with **Angular 22** (standalone, zoneless, signals, Signal Forms,
prerendering with hydration), **Tailwind CSS v4** and **Firebase** (Hosting, Auth, Firestore).

## What is on the site

| Page | Content |
| --- | --- |
| **Accueil** | Hero with the campus, key figures, the two tracks, the two online spaces, heritage teaser, archive photos |
| **Histoire & Patrimoine** | 10 milestones with sources, the founder, the Brothers in Egypt since 1854, directors, 26 archive photographs |
| **Bac nationale** | Bilingual programme, the cycles, registration pointers, **the subjects** (14, with illustrations), useful links |
| **Bac français** | Opened 2009, AEFE-homologated 10 January 2013, values, languages, orientation, headcounts (268), **the subjects** (15), registration forms |
| **Contact** | Address, e-mail, phone numbers for 9 departments (dialable) |
| **Espace élève** | Sign-up / sign-in, then: announcements, homework (with due dates, « fait »), the class calendar (read-only), grades with comments and averages, course material by subject |
| **Espace enseignant** | Publish announcements, homework and resources to a class or a section; the shared calendar; enter grades by class and student |

There are no hard-coded subject pages any more: what a subject contains (chapters, exercises,
resources) is whatever teachers publish for it.

## The school space

**Who can do what**

| | Student | Teacher |
| --- | --- | --- |
| Sign up | yes, with section and class | yes, but nothing works until the school lists their e-mail |
| Posts (announcements, homework, resources) | read those addressed to their class | publish, delete their own |
| Calendar (exams, extracurricular activities, meetings) | read what concerns their class | add, **correct and delete any event** (shared calendar), filter by class |
| Grades | read their own | enter, delete the ones they gave |
| Profile | change name, section, class | — |

A post or calendar event is addressed to **everyone**, a **track** (Bac nationale / Bac français) or
**one class** (1re, 2e, 3e secondaire — Seconde, Première, Terminale). Students see only what
matches. Material is organised by class (the audience) and by subject (the student's « Ressources »
tab groups it by subject). Resources are **links** (https): upload the file to the school's drive or
site and paste the link. Real file upload would need Firebase Storage and is not set up.

**Teachers are added by the school's administrator**, never by themselves: in the Firebase console,
create a document in the `teachers` collection whose **id is the teacher's e-mail in lower case**
(any field, e.g. `name`). The teacher then signs up on `/espace-enseignant` with that e-mail and
**verifies it** (the rules require a verified e-mail). Locally, with the emulators running:

```bash
node scripts/add-teacher.mjs marc.dupont@example.org "Marc Dupont"
```

**Security** (`firestore.rules`, 25 tests in `tests/rules/`): a student reads and writes only their
own profile; posts and the calendar are readable by signed-in students and teachers only; only a
verified, allow-listed teacher can write them; the allow-list cannot be written from a client; a
grade is readable only by its student and the teacher who gave it; documents have an exact shape,
server timestamps and size limits; nothing else in the database is reachable. What teachers type is
rendered as text (never HTML) with `dir="auto"`, so Arabic reads right to left on its own.

**Loading:** Firebase is imported lazily, in the browser only, after the first render, so the
prerendered pages and the initial bundle never contain it. Writes show instantly.

> **Production setup.** Create a Firebase project; enable *Authentication → Email/Password* and
> Firestore; paste your web config into `PRODUCTION_CONFIG` in
> `libs/school-space/src/lib/space.service.ts` (public identifiers, not secrets); set the project id
> in `.firebaserc`; deploy the rules. Until the `REPLACE_ME` values are replaced, the spaces show
> « disponible prochainement » in production (they work fully in development, against the emulators).

## Run it

```bash
npm install
npm start
```

Open http://localhost:4200. To try the spaces locally, start the Firebase emulators too (needs
Java 21+) in a second terminal: `npm run emulators`.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest via `ng test`): content integrity (photos with exact declared sizes, headcounts, directors, contacts), the subject catalogue (17 subjects, valid SVG illustrations), the school-space model (audiences, homework, grades, calendar) |
| `npm run test:rules` | Security-rules tests against the Firestore emulator |
| `npm run test:e2e` | Playwright, desktop and mobile (Pixel 7), against the emulators, started automatically: navigation, prerendering, layout shift, student and teacher flows, calendar |
| `npm run build` | Production build; the 5 content pages are prerendered into `dist/exam-platform/browser` |
| `npm run deploy` | Build, then `firebase deploy --only hosting,firestore` |

## Where the content lives

Typed data in `libs/site-content/src/lib/`: `school.ts` (name, figures, milestones, directors,
phones), `sections.ts` (the two track pages), `photos.ts` (26 photos: file, size, alt, credit,
source) and **`matieres.ts`, the subject catalogue**: one entry per subject plus its illustration in
`public/images/matieres/` (`node scripts/subject-images.mjs` regenerates the illustrations). The
catalogue is what teachers pick from when they publish or grade, and what the track pages show: trim
or extend it there. Subject illustrations are original drawings; replace them with school photos only
with the right to use them.

## CI/CD and AI review (GitHub Actions)

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | every push and pull request | build, unit tests, rules tests, Playwright E2E (all against the emulators) |
| `deploy.yml` | push to `main`, after the repository variable `DEPLOY_ENABLED` is `true` | build and deploy Hosting and Firestore rules to Firebase |
| `ai-review.yml` | pull requests | sends the diff to Google Gemini (free tier) and posts a review comment |
| Dependabot | weekly | npm and Actions updates |

Set up (Settings → Secrets and variables → Actions):

- **`GEMINI_API_KEY`** (secret): a key from https://aistudio.google.com/apikey (free tier). Optional
  variable `GEMINI_MODEL` (default `gemini-2.5-flash`). Without the key the review step is skipped.
- **`FIREBASE_SERVICE_ACCOUNT`** (secret): a service-account JSON with *Firebase Hosting Admin* and
  *Cloud Datastore Owner* roles; **`FIREBASE_PROJECT_ID`** (variable); **`DEPLOY_ENABLED`** = `true`.

Never commit keys: they live only in GitHub secrets. The AI review treats the diff as untrusted data,
only comments (never pushes or approves), and does not run on pull requests from forks (GitHub does
not give them secrets). Free-tier requests may be used by Google to improve its products: do not send
anything confidential through it.

## Architecture

```
libs/
  site-content/   Typed content (French) · photo catalogue · subject catalogue
  site-pages/     Pages (home, history, tracks, contact), SitePhoto, MatiereCard, per-page meta
  school-space/   Model (audiences, posts, grades, calendar) · SpaceService (lazy Firebase)
                  · /student and /teacher pages (own lazy entry points) · calendar, post card, auth panel
src/app/          Shell: sticky header (hamburger below 1280px), footer, routing
public/           images (school, archives, matieres) and self-hosted fonts
firestore.rules   Security rules        tests/rules/   Rules tests        e2e/   Playwright
```

`outputMode: "static"`: content routes are prerendered and hydrated; the spaces are client-rendered.
Entry points keep the bundle light (`@site/space` is the small shell part; the two pages are lazy).
`<html lang="fr" dir="ltr">` everywhere; logical CSS properties only. Angular conventions: standalone
components, zoneless, `input()`, `computed()`, `@Service()`, native control flow, Signal Forms,
`NgOptimizedImage`, no `any`.

## History of this repository

An earlier version included a timed-exam engine, a teacher CMS and roles. It is preserved under the
git tag **`archive/exam-engine-2026-10-16`**.
