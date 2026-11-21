# apps/web: conventions for agents

The root `CLAUDE.md` rules apply (standalone, signals, `input()`/`output()`/`model()`, native control flow, `host`
object, no `ngClass`/`ngStyle`, Signal Forms, `NgOptimizedImage`, WCAG AA). This file says where things live
and how to use what already exists.

## Folders and ownership

`src/app/` has five layers. Dependencies only go downward (`features` → `layout` → `shared` → `core`);
`architecture.spec.ts` fails the unit tests when an import breaks the rules below.

| Folder | What | Rendering |
|---|---|---|
| `features/public/` | Public site pages (home, histoire, bac pages, contact, accessibility statement), in fr/en/ar | Prerendered |
| `features/auth/` | `/connexion` login page, `/connexion/oubli` and `/connexion/reinitialiser?token=` (forgotten password, framed by `auth-shell.ts`), first access | Client |
| `features/eleve/` | Student space `/eleve`: routes in `eleve.routes.ts`, the one page in `accueil/` (`home-page.ts` + one block component per block + `home-views.ts` and `now-next.ts` pure rules) | Client |
| `features/enseignant/` | Teacher space `/enseignant`: the one page in `accueil/` (`home-page.ts`, one block component per block, `home-views.ts` pure rules, `teacher-home-data.ts` the page's ONE `GET /teacher/summary` resource and `section()`, which turns a failed section into the block's error); « Mes classes » is `classes/` | Client |
| `features/admin/` | Administration `/admin`: the one page in `accueil/` (`home-page.ts`, one block component per block, `admin-home-views.ts` pure views; admin only, a planner is redirected), `bulletins/report-preparation-page.ts` (« Préparer les bulletins », « Relancer », rules in `preparation-logic.ts`), `annonces/` (write and delete announcements; `audience.ts` holds the admin's list of choices, the reading of a choice and the naming of an audience are in `shared/utils/audience.ts`, shared with the teacher space). The home's « Ajouter un compte » and « Importer une liste » open `/admin/utilisateurs?action=creer|importer` | Client |
| `features/timetable/` | Timetable pieces used by the three spaces: `timetable-api.ts`, `session-dialog.ts`, `session-item.ts`, `blocked-notice.ts`, pure `suggestions.ts` and `timetable-format.ts` | Client |
| `features/notifications/` | The notifications page, the bell of the app bar (`notification-bell.ts`, count in `notifications-store.ts`) and the pure display rules (`notification-view.ts`) | Client |
| `features/agenda-sync/` | « Synchroniser mon agenda »: create, copy, instructions for Google / Apple / Outlook, revoke. The address is shown only when it is created | Client |
| `features/groupes/` | « Groupes » (one page for `/enseignant/groupes` and `/admin/groupes`), pure rules in `groups-logic.ts` | Client |
| `shared/ui/` | UI kit (`cdls-*`), import from `shared/ui/index.ts` | n/a |
| `shared/components/` | Components used by several features: `LoadState`, `HomeBlock` + `HomeStatus` / `HomeStatusRegion` (home-page blocks), `WeekView`, `EventDetails`, `ConfirmModal`, `PasswordForm` | n/a |
| `shared/utils/` | Pure, decorator-free helpers with a spec next to each: `block-state.ts` (`BlockState` union, `blockState`, `snapshotOf`, `bothOf`, `pageStatusMessage`), `format.ts` (French labels, times, plurals), `week.ts`, `targets.ts` (« Assigner à », reuses `targetedStudentIds` of `@cdls/shared`), `forms.ts` (`shownError`, `fieldValue(event)`: the value of a change or input event, narrowed without an `as` cast), `audience.ts` (announcement audiences: `audienceFromValue`, `audienceLabel`), `download.ts`, `focus.ts` | n/a |
| `shared/data/` | Shared resources: `teacher-data.ts` (the teacher's assignments and classes), `school-years.ts` (`SchoolYears` root service: the years and the term of today, loaded once) | n/a |
| `layout/` | `PublicLayout`, `SpaceLayout` (app bar, account menu, bottom nav), `space-navs.ts`, `PagePlaceholder` | n/a |
| `core/` | `ApiClient`, `AuthStore`, `SchoolClock` (`clock/`: the school's `today` and `now` signals, one browser-only timer), `school/` (`PROFILE`, `SECTION_LABELS`, `schoolToday()`: the school's profile of this build), interceptor, role guards | n/a |
| `i18n/` | Languages of the public site: typed `SiteMessages` per language (`messages-base.<lang>.ts` shared words + the pack's `SchoolMessages`, joined by `composeMessages`), page addresses, `LOCALE`, `SiteHead` (lang/dir/hreflang). See `docs/i18n.md` | n/a |
| `school/` | The types of the school pack (`content.model.ts`, `school-content.ts`, `site-config.ts`), `school-info.ts` (`SCHOOL`, `CONTACTS`, `localizedPhoto()` from the profile), `matieres-text.ts`, `contact-mail.ts`; `active/` is GENERATED and points at the pack. The school's own text and photos are NOT here: they are `schools/<id>/site/` | n/a |
| `src/styles.css`, `src/styles/` | Tokens as a Tailwind 4 theme, prototype component classes, fonts | n/a |

**Import rules** (checked by `architecture.spec.ts`):

- `core/` imports only `core/`; `shared/` only `core/` and `shared/`; `i18n/` and `school/` never import `features/` or `layout/`.
- `layout/` (the app shell) imports `core/` and `shared/`, and from the features only the notification bell.
- The role spaces `features/admin`, `features/eleve` and `features/enseignant` are imported by nothing but themselves
  and the app routes. When two spaces need the same thing, it goes to `shared/` (UI, helper) or to a domain feature
  (`timetable/`, `groupes/`, `notifications/`).
- A feature's own `shared/` folder (`features/admin/shared/`…) is private to that feature.
- Before writing a helper, look in `shared/utils/`: `shownError`, `plural`, `saveFile`, `LoadState` already exist. Do
  not copy one into a component.

When several agents work in parallel, each owns one feature folder. `shared/`, `layout/`, `core/` and `styles/` are
shared: change them only when that is your task, and say so in your report.

## Type safety and Angular rules

- `tsconfig.json` is strict plus `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `strictTemplates`,
  `strictStandalone` and `typeCheckHostBindings`, and every Angular extended diagnostic is an error. `array[i]` is
  `T | undefined`: narrow it, or give the type a shape that says it is never empty (`NonEmptyList<T>` in
  `school/content.model.ts`). In specs, `!` on an index is fine.
- Never `any`, and no `!` or `as` cast in application code to silence the compiler: narrow with `unknown`, type guards
  or `satisfies`. `npm run lint` enforces it: `typescript/no-non-null-assertion` is an error in `.oxlintrc.json` (off
  for `*.spec.ts`), and `src/app/non-null-templates.spec.ts` fails on a `value!` inside a template (oxlint does not read
  those): narrow with `@if (value(); as v)` or `?.`. API types come from `@cdls/shared` only; a string union has an exported const array next to it.
- Use `inject(DOCUMENT)` rather than the global `document`, and never `new Date()` in code that also runs on the
  server (public pages are prerendered).
- `ng g c` is configured for an inline template and styles, CSS and no spec; move a template to a `.html` file only
  past about 100 lines.
- Files are named by intent (`login-page.ts`, `notifications-store.ts`), without `.component.ts` / `.service.ts`. Keep that.
- `npm test -w @cdls/web` also type-checks the Node-side files (`tsconfig.node.json`).

## Design source

`design/prototypes/*.html` is the approved design (Axe-clean). Port a screen by reusing its markup and class names:
every class in `design/prototypes/components.css` is global here (`.page__header`, `.card--panel`, `.table`, `.hero`…).
`design/prototypes/README.md` maps each `data-component` to its Angular shape. Tokens exist both as CSS variables
(`var(--color-heading)`) and as utilities (`text-heading`, `bg-page`, `font-display`, `text-h1`, `p-6`). Never hard-code
a colour; gold (`--color-accent`) is never text on light surfaces (use `--color-accent-text`).

## Data

- `ApiClient` (`core/api/api-client.ts`): one promise method per endpoint, grouped (`api.school`, `api.users`,
  `api.calendar`, `api.grades`, `api.attendance`, `api.reportCards`, `api.contact`). Types come from `@cdls/shared` (`api.ts`).
  Read with `resource({ params, loader })`; write in async handlers. Show errors with `apiMessage(error)`.
- `AuthStore` (`core/auth/auth-store.ts`): `user()` (with `studentId`/`teacherId`, and `classId` for students), `role()`, `displayName()`.
  The access token is memory-only; the interceptor adds it and refreshes once on a 401.
  **A failed refresh signs out only on 401/403** (the API refused the token). On a 429, a 5xx or a network error
  `AuthStore.refresh()` retries up to three times (`core/auth/refresh-retry.ts`, pure, with a spec: 1 s, 2 s, 4 s plus
  jitter, `Retry-After` honoured, 8 s cap), keeps the session, resolves `'unavailable'` and sets `sessionUnavailable()`,
  which `SpaceLayout` and the login page show (« Réessayer » there). The whole school shares one address and a busy
  minute answers 429: never call `#clear()` or send the user to `/connexion` for anything but `'signed-out'`.
- Guards: `roleGuard('student' | 'teacher')` on those areas; `/admin` uses `structureGuard` (the admin and teachers with the Planificateur permission) and its admin-only pages `adminOnlyGuard`; nav entries carry `access: 'admin' | 'planner'`; `anonymousGuard` on `/connexion`, `firstAccessGuard` on `/premier-acces`. While `user().mustChangePassword` is true every guard sends the user to `/premier-acces`, and the interceptor does the same on a 403 `PASSWORD_CHANGE_REQUIRED`. The account menu of `SpaceLayout` has « Changer mon mot de passe » (`layout/change-password-modal.ts`, same `shared/components/password-form.ts` as the first-access page).

## Navigation

The three spaces' menus are one model, `layout/space-navs.ts` (`ELEVE_NAV`, `ENSEIGNANT_NAV`, `ADMIN_NAV`), read by `SpaceLayout` and by the shared « Plus » page (`layout/menu-page.ts`, routed as `menu` in each space). Rules that `layout/space-nav.spec.ts` checks:

- An item with an `icon` goes in the phone's bottom bar: five at most, the `mobileOnly` « Plus » entry last. Everything else in the menu is reached through « Plus », which lists the whole menu the user may see (not the detail pages that blocks open).
- `access: 'admin' | 'planner'` filters by role (`planner`: a teacher with `isPlanner`, for the links between the teacher space and « Planification »; an admin already sees everything); `href` links to another space; `secondary` items move behind « Plus » in the top bar once there are more than eight entries.
- **Every role opens on « Accueil »** (the one page of blocks), first in its list and in the phone bar. For a planner in `/admin` that is `planification` (`access: 'planner'`, so there is never a second entry for the page); the admin's is `''` (`access: 'admin'`), with « Planification » as a screen of its own. The student, teacher and admin home routes are titled « Accueil » (the app bar shows the title on a phone); the planner's page keeps « Planification », which the admin's own Planification screen shares.
- **Keep menus small.** After « Accueil », a menu holds only what is used daily and that no block button leads to, plus the rare screens behind « Plus ». A page that a block button opens is NOT in the menu: it goes in the space's `*_DETAILS` array in `space-navs.ts` (routed as ever, never removed), which `e2e/all-screens.spec.ts` opens with Axe at both widths, and `space-nav.spec.ts` checks it is not also in the menu. Phone bar today: student Accueil, Horaire, Devoirs, Plus; teacher Accueil, Horaire, Appel, Plus; planner Accueil, Classes, Horaire, Plus; admin Accueil, Planif., Classes, Horaire, Plus.
- A new screen goes in its space's list (menu if daily and not behind a block, otherwise `*_DETAILS`) and in the spec. In Playwright, reach a detail page through its block button, or `goInApp` for a deep link, never through a menu entry that no longer exists.

## « Noter » (quick grading)

`features/enseignant/noter/` (`/enseignant/noter?classe=&matiere=`): step 1 « Quelle note ? » (new note via a Signal Form, or a draft or planned exam from `api.grades.pending`), step 2 the SAME `notes/grade-grid.ts` in `[quick]` mode (Enter to the next student, then to « Publier aux élèves »; optional comment; autosave after 800 ms with a polite `role="status"` line from the pure `saveStatus`; « Finir plus tard »; publish behind a confirmation). Do not write a second grid: extend `GradeGrid`. Focus moves to each step's heading. An empty cell is an absent student (no grade row). Signal Forms refuse `min`, `max` and `[maxLength]` attributes on a bound control: the validators set them.

## One page per role: the block pattern

Each space opens on one page of blocks (`docs/rollout.md` says what the student sees; the teacher, planner and admin
pages follow the same pattern). Rules:

- **One small component per block**, in the space's `accueil/` folder, loading its own data with `resource()`. A slow or
  failing block shows its own state and never blanks the page. The page component only lays the blocks out (CSS grid,
  phone first: one column in the owner's order; from 48 rem three columns, `wide` blocks span the row; the teacher page waits for 64 rem because its blocks hold buttons and long lines).
- **State is one union**, never flags: `blockState(snapshotOf(resource), view)` from `shared/utils/block-state.ts` gives
  `loading | error | empty | ready`; `bothOf` joins two sources. `view` is a pure function returning `null` for
  « nothing to show » (the empty state). Put the views in a decorator-free file with a spec covering the four states.
  A secondary source (« Bulletin publié », holidays) must not fail the block: read its error as « no data ».
- **Chrome is `<app-home-block>`** (`shared/components/home-block.ts`): `<section>` labelled by its `<h2>`, loading line,
  `cdls-alert` on error with a « Réessayer » button (listen to `(retry)` and reload the block's resources), an empty
  text that invites (« Rien à rendre cette semaine »), and ONE entry link at the end with a descriptive name (`link`
  relative to the space, optional; `linkLabel`). `wide` spans the row, `tone` is one of `HOME_BLOCK_TONES`
  (`inverse` = the navy highlighted block, gold focus ring). The block's content is projected and shown when `state` is `ready`.
- **One live region per page**: the page component has `providers: [HomeStatus]` and ONE `<app-home-status />` (a
  permanent visually hidden `role="status"`, updated with text: « Page chargée. », or the blocks that failed). The blocks
  report to it by themselves; they add no `role="status"` of their own.
- Sub-headings inside a block are `<h3>`; every id (`headingId`) is unique on the page. « Now » comes from the root
  `SchoolClock` (`today()`, `now()`, Cairo time, one browser-only timer that follows midnight): never a `today` input,
  a local timer or `new Date()`. School years and the term of today come from the root `SchoolYears` (one
  GET /school-years for all blocks; wait on `settled()`, fall back to the whole year when `years.error()`).
- **Mind the request count.** The school shares ONE address and the API allows 120 requests a minute per address, so a block makes few requests (no call per session or per student). Blocks that need the same data read one page-level service (`providers: [HomeStatus, TeacherHomeData]`, see `features/enseignant/accueil/teacher-home-data.ts`) instead of each asking again; the teacher page makes ONE call (`api.teacher.summary()`, sections named in `failed`; never a call per class, session or homework). Announcement days are Cairo days: `postDay(createdAt)` in `shared/utils/posts.ts`, never `createdAt.slice(0, 10)`. The day-session rules shared by the student and teacher pages are `features/timetable/day-sessions.ts`; the announcement item is `shared/components/post-item.ts`.
- Ticking, and any write, uses the same component and API call as the detail page (`HomeworkItem`), so both stay in step.

## The planner's page (« Planification »)

`features/admin/planification/`: `/admin/planification` (the home of a planner: `PLANNER_HOME`; the admin has it in the nav too) and `/admin/planification/professeur-absent`. Same block pattern as the student page: `planner-home-page.ts` (`providers: [HomeStatus, PlannerData]`, header buttons « Professeur absent » and « Ajouter un examen »), one component per block (`fix-block`, `changes-block`, `rooms-block`, `year-block`, `timetables-block`), the pure views and their four-state spec in `planner-views.ts`. `PlannerData` holds the one `planner/timetables` resource that « À régler » (both sources are needed: either failing is the block's error, never a false « Rien à régler ») and « Emplois du temps » share. Entry links are absolute (`/admin/…`), because the page is not at the root of its area. « Salles maintenant » reloads on the school clock's minute (every five), never its own timer. « Ajouter un examen » is a button that opens `add-exam-dialog.ts` (Modal + Signal Form, `POST /events` through `api.calendar.create`) for the admin and every planner, with or without a teacher profile; its pure rules (required fields, default title, exam week of the class, the soft « two assessments that day » note) are in `exam-logic.ts` with a spec. A 409 clash shows through `app-blocked-notice` (conflicts only); the notes are advice and a failing source says nothing. The API lets only the admin and planners set the exam types (`EXAM_ACTIVITY_CODES` in `@cdls/shared`) for a class they do not teach, and `EventDto.authorId` is null for an event authored by an account without a teacher profile (`authorName` still names it): compare with `teacherId` only after checking it is not null.

**« Professeur absent »** (`absence-page.ts`, rules in `absence-logic.ts` with a spec): a Signal Form for the teacher and the days (the teachers come from `api.planner.teachers()`: a planner may not list users, and `assignments()` only gives a teacher their own), then one `<fieldset>` per lesson with native radios (Annuler, Remplacer, Étude surveillée) and a select of the free teachers (same subject first); « Remplacer » proposes the first free teacher of the subject that no lesson at the same time already holds (shared `absence-cover.ts`: the select never lists a teacher held by an overlapping lesson; a refused save with a conflict reads the lessons again, keeps the other choices and says who is no longer free, focus on that message). A moved lesson is a real session on its new day only; its old day keeps the struck trace, labelled by `statusLabel` (`timetable-format.ts`): use it, never write « Déplacée » by hand. Every lesson the weekly rule leaves untouched needs a choice; « Enregistrer et prévenir » sends `api.planner.applyAbsence` once. A 409 shows through `app-blocked-notice` (conflicts, or warnings with a reason each). The teacher's own « Mon emploi du temps » is read-only: teachers no longer offered to change a session (the API still allows it); the planner does it.

## Timetable conflicts

`features/timetable/blocked-notice.ts` shows a refused save: the conflicts (alert), the free places as one-click buttons (`suggestions` input, `apply` output, focus moves to its heading) and the warnings. A dialog that owns a write fills the chosen place into its form with the pure `features/timetable/suggestions.ts` (`applyToSession`, `applyToSeries`) and saves again; keep that file free of Angular.

## Prerendered forms

A form on a prerendered page (today the contact form) has no handler until Angular hydrates it, and a click or Enter before that submits it natively (page reload, message lost). Its submit button is therefore `[disabled]` until a `ready` signal set in `afterNextRender` (never runs on the server). Playwright waits on `toBeEnabled()` of that button before typing: it is the readiness signal, never a sleep. `public-site.spec.ts` holds the scripts back to prove the button is disabled until then.

(`e2e/school.ts` gives the Playwright specs the profile and `schoolToday()` of the school under test, `SCHOOL` or `cdls-daher`.)

**Playwright rules** (README « Browser tests », coverage in `docs/qa/e2e-coverage.md`): never date a test « today + n days »
(a holiday or the year's end): take a week with lessons from `e2e/school-weeks.ts` (`firstTeachingWeek`,
`twoTeachingWeeks`, `latestTeachingDay`, `gradableDay` for graded work). Every spec removes what it creates in
`afterAll`/`finally` with `e2e/cleanup.ts` (marks before events; students archived, other accounts disabled); data the
API keeps for good (a class that had a student, a term with published report cards) goes in a `fixtureYear`, never the
current year. One test at a time; the phone project runs after desktop.

## School packs

The public text, photos, crest and icons of the school are `schools/<SCHOOL>/` at the repository root, not in `src/`.
`scripts/select-school.mjs` (run by the `pre*` npm scripts of build, start, test, lint) validates `profile.json`, writes the
generated files (all gitignored) and copies the pack's `public/` into `src/generated/public/`, which `angular.json` serves
next to `public/`. Read the profile through `PROFILE` (`core/school/school-profile.ts`), the pack's `SITE` and `PACK`
through `school/index.ts`; never import `schools/` or a generated file directly. Never write a school's name, contact,
zone or section name in a component. A string that used to be a CDLS id (`PhotoId`, `ContactId`) is a plain `string` checked by
`school/pack.spec.ts`. `src/index.template.html` is the page shell: edit it, not `src/generated/index.html`.
To check a school: `SCHOOL=<id> npm run build`, then `SCHOOL=<id> npm run e2e:smoke`. Docs: `docs/new-school.md`.

## Public site languages

Public pages and the login entry read their words from `inject(LOCALE)` (`messages` for the interface, `content` for
the school's text): never write French text in a public component. Links go through `pageUrl(lang, page)`. CSS uses
logical properties only (`inline-start/end`, `text-align: start`): the Arabic pages are `dir="rtl"`. Skip links are
`<a cdlsSkipLink>`. The English and Arabic text is machine-drafted: say so when you touch it.

## Design conformance spec

`e2e/design-conformance.spec.ts` proves the built pages match what the owner agreed (`docs/workflow-redesign.md`, `docs/rollout.md` « What … sees » and « The menus »). A table per role (`ROLES`: blocks in order, entry label and route, header buttons, the three menus, the agreed empty text, the endpoint that fails each block) drives the same checks for student, teacher, planner and admin: order and layout, entry routes, failure isolation, empty and loading states, menus at 1440 and 390 px, Axe, French typography, and a right-to-left smoke (the spaces are French only; it mirrors the document). It also covers Planificateur routing, « Noter » and « Préparer les bulletins ». When you change a block, heading, entry label, header button or menu entry, change the table here too. A known gap is a `test.fail()` with its reason: it turns red the day the gap is closed, so remove `fail` then. Run it: `E2E_BASE_URL=… npx playwright test e2e/design-conformance.spec.ts --project=desktop`.

## Page checklist (before you commit)

1. One `h1` per page (space pages start with `.page__header`); headings in order. Space pages never add a `<main>`
   (the layout has it) and never a second skip link.
2. Loading (`.loading-line`), error (`<cdls-alert tone="danger">`) and empty (`<cdls-empty-state>`) states.
3. Tables: `<caption>`, `scope` on header cells; `.table--stack` + `data-label` on phones.
4. Forms: Signal Forms, `<cdls-field>` + `cdlsControl`, errors that say how to fix the problem.
5. Public pages: also `npm run e2e:public -w @cdls/web` (fr/en/ar). Axe: 0 violations at 390 px and 1440 px (inject axe-core 4.10 from cdnjs, run tags wcag2a, wcag2aa, wcag21aa,
   wcag22aa, best-practice). Keyboard: everything reachable, visible focus, Escape closes menus and dialogs.
6. `npm run build`, `npm run lint` and `npm test` green. Pure logic goes in decorator-free `.ts` files with a
   `*.spec.ts` next to it (Vitest, `vitest.config.ts`).

## Running

From the repo root: `npm run db:dev` (own terminal), `npm run db:migrate`, `npm run db:seed`, then `npm run dev`
(API :3000 + site :4200, `/api` proxied). Demo accounts are in `apps/api/demo-credentials.local.md` (gitignored):
never paste those passwords into chat, commits or docs.
