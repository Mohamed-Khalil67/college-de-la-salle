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
school week; `WEEK_START` in `src/app/space/calendar.model.ts`). Documents are **links** (https): put the file on
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

**Security** (`firestore.rules`): a student reads and writes only their own
profile; the calendar and announcements are readable by signed-in students and teachers only; only
a verified, allow-listed teacher writes them; the allow-list cannot be written from a client; a
grade is readable only by its student **once published**, and by the teacher who gave it; documents
have an exact shape, server timestamps and size limits; nothing else is reachable. What teachers
type is shown as text (never HTML) with `dir="auto"`; links must be https and are checked again
before display; video players are rebuilt from a validated id.

**Loading:** Firebase is imported lazily, in the browser only, after the first render, so the
prerendered pages and the initial bundle never contain it. Changes appear live on every open page.

## Run it

The repo is an npm-workspaces monorepo (Node 22.18+):

```
apps/web         The Angular site (still on Firebase until the API replaces it)
apps/api         NestJS 12 + Prisma 7 API (PostgreSQL), see apps/api/CLAUDE.md
packages/shared  Framework-free domain code (@cdls/shared) used by both apps
```

```bash
npm install
cp apps/api/.env.example apps/api/.env   # then set DATABASE_URL to your local PostgreSQL
npm run dev                              # shared (watch) + API on :3000 + site on :4200
```

Open http://localhost:4200; the dev server proxies `/api` to the API. API docs: http://localhost:3000/api/docs,
health: `/api/health` (process) and `/api/health/db` (database). To try the Firebase spaces locally,
start the emulators too (needs Java 21+): `npm run emulators -w @cdls/web`.

| Command | What it does |
| --- | --- |
| `npm run build` | Builds shared, then the API (`apps/api/dist`), then the site; the 5 content pages are prerendered into `apps/web/dist/college-website/browser` |
| `npm run lint` / `npm test` | oxlint and Vitest in every workspace |
| `npm run db:migrate` | `prisma migrate dev`: applies the schema to the database |
| `npm run db:seed` | Demo data; the passwords go to `apps/api/demo-credentials.local.md` (gitignored) |
| `npm run deploy -w @cdls/web` | Build, then `firebase deploy --only hosting,firestore` |

## Where the content lives

Typed data in `apps/web/src/app/school/`: `school-info.ts` (name, milestones, directors, phones),
`tracks.ts` (the two track pages), `photos.ts` (26 photos: file, size, alt, credit, source) and
**the subject catalogue** (`packages/shared/src/subjects.ts`, shared with the API): one entry per
subject plus its illustration in `apps/web/public/images/matieres/` (`node scripts/subject-images.mjs`,
run from `apps/web`, regenerates the illustrations). The
catalogue is what teachers pick from when they publish or grade, and what the track pages show: trim
or extend it there. Subject illustrations are original drawings; replace them with school photos only
with the right to use them.

## Deploying

Deployment is manual for now (no CI/CD and no automated AI review yet; they were removed on purpose
and can be restored from git history, commit `273f3a3`, when the project grows):

```bash
npm run deploy -w @cdls/web     # build, then firebase deploy --only hosting,firestore
```

Live site: https://college-de-la-salle-daher.web.app (Firebase project `college-de-la-salle-daher`,
Firestore in `europe-west1`). Sign in first with `npx firebase login`.

## Architecture

The web application code is in `apps/web/src/app/`, organised by feature (Angular style guide):

```
src/app/
  app.ts · app.html · app.scss     Shell: header (school · pages · account pill), footer
  app.routes.ts                    Routes (pages prerendered, spaces lazy and client-rendered)
  school/                          Typed content: school info, tracks, photos (+ subjects from @cdls/shared)
  pages/
    pages.routes.ts                Public routes, titles and meta descriptions
    site-photo.ts                  Credited photo in a reserved box (no layout shift)
    home/  history/  contact/      One page per folder
    section/                       Bac nationale / Bac français (+ subject card)
  space/                           The school space
    firebase-errors.ts             French messages for Firebase error codes
    space.service.ts               Firebase (lazy): sign-in, role, live data, writes
    space-styles.ts                Shared form styles and category colours
    auth/                          Sign in / create an account
    calendar/                      Agenda (week/month), event window, event form
    grades/                        Grade grid (per exam, publish step)
    announcements/                 Announcement card
    student-space/ teacher-space/  The two pages
packages/shared/src/  space.ts (classes, audiences, grades), calendar.ts (events, repetition, .ics), subjects.ts
apps/web/public/  Images (school, archives, matieres), fonts, icons
firestore.rules   Security rules
scripts/          add-teacher (emulator), make-icons, subject-images
```

`outputMode: "static"`: content routes are prerendered and hydrated; the spaces are client-rendered
and lazy-loaded, and Firebase is only imported in the browser. `<html lang="fr" dir="ltr">`
everywhere; logical CSS properties only. Angular conventions: standalone components, zoneless,
`input()`/`output()`, signals, `computed()`, `linkedSignal()`, `@Service()`, `inject()`, native
control flow, Signal Forms, `host` bindings, `NgOptimizedImage`, `strict` + `strictTemplates`, no `any`.

## History of this repository

An earlier version included a timed-exam engine, a teacher CMS and roles. It is preserved under the
git tag **`archive/exam-engine-2026-10-16`**.
