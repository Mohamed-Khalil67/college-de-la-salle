# Collège de la Salle — Daher

The website of Collège de la Salle, Daher, Cairo (founded 1898): the **national section**
(Egyptian programme, Thanaweya Amma) and the **French Baccalauréat section**, with a **student
space** (accounts). The content pages are static and prerendered, in French; the student space uses
Firebase (Auth + Firestore). Built with **Angular 22** (standalone, zoneless, signals, Signal Forms,
prerendering with hydration) and **Tailwind CSS v4**, hosted on **Firebase Hosting**.

## What is on the site

| Page | Content |
| --- | --- |
| **Accueil** | Hero with the campus, key figures, the two sections, the subjects, a student-space invitation, heritage teaser, archive photos |
| **Histoire & Patrimoine** | 10 milestones with sources, the founder (Saint Jean-Baptiste de La Salle), the Brothers in Egypt since 1854, the 22 Brother directors and 4 lay directors, 26 archive photographs |
| **Section nationale** | Bilingual programme (French first foreign language, sciences in French), the cycles, the three subjects, the school's mobile app, registration pointers |
| **Section Bac français** | Opened 2009, AEFE-homologated 10 January 2013, values, help for struggling students, languages, orientation, headcount table (268 students in 2020-21), registration forms |
| **Matières** | *Langue arabe* (written in Arabic), *Mathématiques*, *Physique-Chimie*: table of contents, programme by chapter, key formulas, worked examples with folded corrections, tips, resources, progress status |
| **Contact** | Address, e-mail, phone numbers for 9 departments (dialable links) |
| **Espace élève** | Sign-up and sign-in, then a dashboard: profile, progress per subject, favourites |

- **Language:** everything is French and left-to-right, except the content of the *Langue arabe*
  page, which is Arabic and reads right to left. The header, breadcrumb and footer never move.
- **Photos:** 26 real photographs: six from the Lasallian archive
  ([lasalle-po.org](https://lasalle-po.org/)) and twenty from the college's own archive album
  ([lasalle-eg.net](http://www.lasalle-eg.net/college/album.htm)), downloaded with the school's
  approval and credited wherever they appear.
- **Sources:** facts come from the college's official site (lasalle-eg.net), the Bac section's site
  (bacdelasalle.com) and the Lasallian archive; the wording is the website's own. Each milestone
  names its source.

## Student space

Students register with an e-mail and a password, pick their **section** (nationale / Bac) and
**class**, and get:

- **Progress:** « J’ai révisé ce chapitre » on every chapter of a subject page, shown as a personal
  progress bar next to the official programme status, and on the dashboard;
- **Favourites:** ☆ on worked examples and formulas, listed on the dashboard;
- **The same data on every device**, restored when they sign in again.

How it works:

- **Data:** one Firestore document per student, `students/{uid}`: name, section, class, progress,
  favourites. **Rules** (`firestore.rules`): a student can read and write only their own document,
  only in this exact shape, with server timestamps; nobody can list students; anonymous users and
  visitors have no access; nothing else in the database is readable.
- **Loading:** Firebase is imported lazily, in the browser only, after the first render, so the
  prerendered pages and the initial bundle never contain it. Writes show instantly (Firestore's
  local cache updates the screen before the server confirms).
- **Privacy:** no password is stored by the site (Firebase Auth handles it); sign-in errors never
  reveal whether an account exists; students can delete their data.
- **Before launch:** self sign-up means anyone can create an account (they only ever see their own
  data). A verification e-mail is sent at sign-up but not required.

> **Production setup.** Create a Firebase project, enable *Authentication → Email/Password* and
> Firestore, then paste your web config into `PRODUCTION_CONFIG` in
> `libs/student-space/src/lib/student.service.ts` and set your project id in `.firebaserc`. Until the
> `REPLACE_ME` values are replaced, the student space shows « disponible prochainement » in
> production (it works fully in development, against the emulators).

## Run it

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:4200. The content pages need nothing else. To try the student space
locally, start the Firebase emulators too (needs Java 21+) in a second terminal:

```bash
npm run emulators
```

| Command | What it does |
| --- | --- |
| `npm test` | 27 unit tests (Vitest via `ng test`): content integrity (only the Arabic subject contains Arabic; every photo file exists with its **exact declared size**; headcounts add up; directors, contacts, founder dates), the subject page component, the student model |
| `npm run test:rules` | 11 security-rules tests against the Firestore emulator |
| `npm run test:e2e` | Playwright, desktop and mobile (Pixel 7): 15 scenarios (30 runs) against the emulators, started automatically |
| `npm run build` | Production build: all 8 content pages are prerendered into `dist/exam-platform/browser` |
| `npm run deploy` | Build, then `firebase deploy --only hosting,firestore` |

What the E2E suite checks:
- **Language and direction:** the navigation is flat and French; on the Arabic page the article is
  `lang="ar" dir="rtl"` in Cairo while the header stays LTR with the brand on the left; no Arabic text
  appears anywhere else.
- **Prerendering:** every page is prerendered with its content, its meta description and its photos;
  all 26 photo files are served.
- **Sections and contact:** the headcount table adds up to 268, external links open safely in a new
  tab, every department's number is dialable.
- **Student accounts:** validation in French; sign-up, dashboard, progress, favourites, sign-out and
  sign-in again from another browser; two students never see each other's data; the controls are in
  Arabic on the Arabic page.
- **Layout shift is zero** on every page, and no page overflows horizontally.

## Where the content lives

Typed data in `libs/site-content/src/lib/`:

| File | Content |
| --- | --- |
| `school.ts` | Name, address, key figures, the **milestones** (each with its source), founder, Brothers in Egypt, directors, phone numbers |
| `sections.ts` | The national and Bac section pages: facts, blocks, headcounts, links |
| `photos.ts` | The photo catalogue: file, size, French alt text, caption, credit, source URL |
| `subjects/*.ts` | The three subjects: chapters (with status), formulas, worked examples, tips, resources |

- **Chapter progress (official):** change a chapter's `status` to `'en-cours'` or `'termine'`.
- **Practice sheets:** put the file under `public/` (or use an https link) and set the resource's `url`.
- **Photos:** add a JPEG under `public/images/` and an entry in `photos.ts` with its real width and
  height (a unit test checks them) and its credit.

> **To confirm with the school.** Two dates differ between sources: the Khoronfish sections moved to
> Daher in 1957 (school) or 1956 (Lasallian archive); the page shows both. The programme outlines
> are indicative: have each department check them against the Ministry's current syllabus. Headcounts
> are for 2020-21 (the figures published on the Bac site); update them when newer ones exist.

## Architecture

```
libs/
  site-content/   Typed content (French; Arabic for the Arabic subject) and the photo catalogue.
  site-pages/     Pages (home, history, sections, contact, subjects), SitePhoto, per-page meta and titles.
  student-space/  Student model + StudentService (lazy Firebase) · /account: the Espace élève page.
src/app/          Shell: sticky French header (brand left, nav right, mobile menu), footer, routing.
public/images/    school/ (6 Lasallian-archive photos) and archives/ (20 college-archive photos).
public/fonts/     Self-hosted Inter (variable) and Cairo (Arabic), SIL Open Font License.
firestore.rules   Student-space security rules.       tests/rules/   Rules tests.       e2e/   Playwright.
```

- **Rendering:** `outputMode: "static"`. Content routes are prerendered (`app.routes.server.ts`) and
  hydrated with event replay; the student space is client-rendered. Firebase Hosting serves the files.
- **Entry points keep the bundle light:** `@site/student` (service, model) is tiny and safe for the
  shell; `@site/student/account` (the page, which needs Angular forms) is its own lazy chunk. Initial
  bundle: **376 kB (106 kB transferred)**.
- **Direction:** `<html lang="fr" dir="ltr">` on every page. The Arabic subject's `<article>`
  carries `lang="ar" dir="rtl"`, so its content (and its table of contents) mirrors and the shell
  doesn't. Logical properties only (`ms-`, `ps-`, `border-s`, `start-`…), never left/right.
- **Fonts:** Inter for French, Cairo for any `:lang(ar)` element (line height 1.9 so diacritics never
  clip). Self-hosted, Inter preloaded everywhere and Cairo on the Arabic page, with a metric-matched
  fallback.
- **Design:** Lasallian navy `#0A192F`/`#0F2C59`, antique gold `#C5A880`, cream `#F5EBE0`, on white;
  all text meets WCAG AA. Tailwind v4 without preflight, base styles in cascade layers.
- **Angular conventions:** standalone components (OnPush by default), zoneless, `input()`,
  `computed()`, `@Service()`, native control flow, Signal Forms, `NgOptimizedImage` for every photo
  (blur placeholder, `priority` on the hero), no `any`.

## History of this repository

An earlier version included a timed-exam engine, a teacher CMS and roles. It is preserved under the
git tag **`archive/exam-engine-2026-10-16`**:

```bash
git checkout archive/exam-engine-2026-10-16
```
