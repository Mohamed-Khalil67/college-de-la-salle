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
| **Espace élève** | One page: next exam, today, homework to hand in, the class calendar (week/month) with documents and videos, grades with averages, announcements |
| **Espace enseignant** | The same page, editable: the shared calendar (classes, exams, homework…, weekly slots), grade grids per exam with a publish step, announcements |

There are no hard-coded subject pages any more: what a subject contains (chapters, exercises,
resources) is whatever teachers publish for it.

## The school space

Both spaces are **one page built around a calendar**, inspired by what Lyon 1 students get from ADE
(timetable) and TOMUSS (grades), but in a single place.

**Espace élève** (read-only):
- **What is coming:** the next exam with a countdown, today's classes, homework still to hand in
  (tick it as done).
- **The calendar of my class:** week view (default; stacked on phones) or month view, filter by
  subject. Hover an event for a preview; click it for the full window: when, where, who, details,
  **documents and explanation videos** (YouTube and Google Drive play inside the window), my mark
  once published, and « Ajouter à mon agenda » (an `.ics` file for Google or Apple Calendar).
- **My grades:** average per subject and overall, weighted by coefficient, with the teacher's comment.
- **Announcements** for my class.

**Espace enseignant** (the same page, editable):
- **Calendar:** add an event with « + Ajouter un événement » or the « + » of a day. Categories:
  Cours, TD, TP, Examen, Contrôle, Devoir à rendre, Révision, Activité, Réunion. Each event has a
  subject, a class or track, a date with start and end time, **weekly repetition** for timetable
  slots, a place, details, links to documents and videos, and a coefficient for graded events.
  The calendar is shared: any teacher can correct, move or delete an event. Filter by class.
- **Examens et notes:** each exam, test, TP or homework opens a **grade grid** (one row per student
  of the class, like TOMUSS). Marks are a **draft** until « Notes publiées » is ticked; correcting a
  mark or emptying it works in the same grid.
- **Announcements:** publish to everyone, a track or a class; delete your own.

A post or event is addressed to **everyone**, a **track** (Bac nationale / Bac français) or **one
class** (1re, 2e, 3e secondaire — Seconde, Première, Terminale). Weeks start on Sunday (Egyptian
school week; `WEEK_START` in `calendar.model.ts`). Documents are **links** (https): put the file on
the school's drive and paste the link. There is no file upload, so nothing needs a paid plan.

**Teachers are added by the school's administrator**, never by themselves: in the Firebase console,
create a document in the `teachers` collection whose **id is the teacher's e-mail in lower case**
(any field, e.g. `name`). The teacher then signs up on `/espace-enseignant` with that e-mail and
**verifies it** (the rules require a verified e-mail). Locally, with the emulators running:

```bash
node scripts/add-teacher.mjs marc.dupont@example.org "Marc Dupont"
```

**Data** (Firestore): `students/{uid}` (profile, homework done), `teachers/{email}` (allow-list),
`posts` (announcements), `events` (the calendar), `grades/{eventId}_{studentUid}` (one mark per
student and exam, with `published`). E-mails and passwords live in Firebase Authentication, not in
the database.

**Security** (`firestore.rules`, tests in `tests/rules/`): a student reads and writes only their own
profile; the calendar and announcements are readable by signed-in students and teachers only; only
a verified, allow-listed teacher writes them; the allow-list cannot be written from a client; a
grade is readable only by its student **once published**, and by the teacher who gave it; documents
have an exact shape, server timestamps and size limits; nothing else is reachable. What teachers
type is shown as text (never HTML) with `dir="auto"`; links must be https and are checked again
before display; video players are rebuilt from a validated id.

**Loading:** Firebase is imported lazily, in the browser only, after the first render, so the
prerendered pages and the initial bundle never contain it. Changes appear live on every open page.

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
| `npm run build` | Production build; the 5 content pages are prerendered into `dist/college-website/browser` |
| `npm run deploy` | Build, then `firebase deploy --only hosting,firestore` |

## Where the content lives

Typed data in `libs/site-content/src/lib/`: `school.ts` (name, figures, milestones, directors,
phones), `sections.ts` (the two track pages), `photos.ts` (26 photos: file, size, alt, credit,
source) and **`matieres.ts`, the subject catalogue**: one entry per subject plus its illustration in
`public/images/matieres/` (`node scripts/subject-images.mjs` regenerates the illustrations). The
catalogue is what teachers pick from when they publish or grade, and what the track pages show: trim
or extend it there. Subject illustrations are original drawings; replace them with school photos only
with the right to use them.

## Deploying

Deployment is manual for now (no CI/CD and no automated AI review yet; they were removed on purpose
and can be restored from git history, commit `273f3a3`, when the project grows):

```bash
npm run test:all   # unit + rules + end-to-end tests (needs Java 21+ for the emulators)
npm run deploy     # build, then firebase deploy --only hosting,firestore
```

Live site: https://college-de-la-salle-daher.web.app (Firebase project `college-de-la-salle-daher`,
Firestore in `europe-west1`). Sign in first with `npx firebase login`.

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
