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
| `features/eleve/` | Student space `/eleve` (routes + `ELEVE_NAV` in `eleve.routes.ts`) | Client |
| `features/enseignant/` | Teacher space `/enseignant` | Client |
| `features/admin/` | Administration `/admin` | Client |
| `features/timetable/` | Timetable pieces used by the three spaces: `timetable-api.ts`, `session-dialog.ts`, `session-item.ts`, `blocked-notice.ts`, pure `suggestions.ts` and `timetable-format.ts` | Client |
| `features/notifications/` | The notifications page, the bell of the app bar (`notification-bell.ts`, count in `notifications-store.ts`) and the pure display rules (`notification-view.ts`) | Client |
| `features/agenda-sync/` | « Synchroniser mon agenda »: create, copy, instructions for Google / Apple / Outlook, revoke. The address is shown only when it is created | Client |
| `features/groupes/` | « Groupes » (one page for `/enseignant/groupes` and `/admin/groupes`), pure rules in `groups-logic.ts` | Client |
| `shared/ui/` | UI kit (`cdls-*`), import from `shared/ui/index.ts` | n/a |
| `shared/components/` | Components used by several features: `LoadState`, `WeekView`, `EventDetails`, `ConfirmModal`, `PasswordForm` | n/a |
| `shared/utils/` | Pure, decorator-free helpers with a spec next to each: `format.ts` (French labels, times, plurals), `week.ts`, `targets.ts` (« Assigner à », reuses `targetedStudentIds` of `@cdls/shared`), `forms.ts` (`shownError`), `download.ts`, `focus.ts` | n/a |
| `shared/data/` | Shared resources: `teacher-data.ts` (the teacher's assignments and classes) | n/a |
| `layout/` | `PublicLayout`, `SpaceLayout` (app bar, account menu, bottom nav), `space-navs.ts`, `PagePlaceholder` | n/a |
| `core/` | `ApiClient`, `AuthStore`, interceptor, role guards | n/a |
| `i18n/` | Languages of the public site: typed `SiteMessages` per language, page addresses, `LOCALE`, `SiteHead` (lang/dir/hreflang). See `docs/i18n.md` | n/a |
| `school/` | Static content of the public site (facts, milestones, photos with credits); `content.fr/en/ar.ts` give it per language; `contact-mail.ts` | n/a |
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
  or `satisfies`. API types come from `@cdls/shared` only; a string union has an exported const array next to it.
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
- Guards: `roleGuard('student' | 'teacher')` on those areas; `/admin` uses `structureGuard` (the admin and coordinator teachers) and its admin-only pages `adminOnlyGuard`; nav entries carry `access: 'admin' | 'coordinator'`; `anonymousGuard` on `/connexion`, `firstAccessGuard` on `/premier-acces`. While `user().mustChangePassword` is true every guard sends the user to `/premier-acces`, and the interceptor does the same on a 403 `PASSWORD_CHANGE_REQUIRED`. The account menu of `SpaceLayout` has « Changer mon mot de passe » (`layout/change-password-modal.ts`, same `shared/components/password-form.ts` as the first-access page).

## Navigation

The three spaces' menus are one model, `layout/space-navs.ts` (`ELEVE_NAV`, `ENSEIGNANT_NAV`, `ADMIN_NAV`), read by `SpaceLayout` and by the shared « Plus » page (`layout/menu-page.ts`, routed as `menu` in each space). Rules that `layout/space-nav.spec.ts` checks:

- An item with an `icon` goes in the phone's bottom bar: five at most, the `mobileOnly` « Plus » entry last. Everything else is reached through « Plus », which lists every screen the user may see.
- `access: 'admin' | 'coordinator'` filters by role; `href` links to another space; `secondary` items move behind « Plus » in the top bar once there are more than eight entries.
- A new screen goes in its space's list, in « Plus » at least, and in the spec.

## Timetable conflicts

`features/timetable/blocked-notice.ts` shows a refused save: the conflicts (alert), the free places as one-click buttons (`suggestions` input, `apply` output, focus moves to its heading) and the warnings. A dialog that owns a write fills the chosen place into its form with the pure `features/timetable/suggestions.ts` (`applyToSession`, `applyToSeries`) and saves again; keep that file free of Angular.

## Public site languages

Public pages and the login entry read their words from `inject(LOCALE)` (`messages` for the interface, `content` for
the school's text): never write French text in a public component. Links go through `pageUrl(lang, page)`. CSS uses
logical properties only (`inline-start/end`, `text-align: start`): the Arabic pages are `dir="rtl"`. Skip links are
`<a cdlsSkipLink>`. The English and Arabic text is machine-drafted: say so when you touch it.

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
