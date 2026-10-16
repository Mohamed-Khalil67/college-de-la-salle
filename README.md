# Collège de la Salle — Daher · Section arabe

The website of the Arabic section (Thanaweya Amma) of Collège de la Salle, Daher, Cairo, founded
in 1898. It is a static, prerendered site in French, built with **Angular 22** (standalone, zoneless,
signals, prerendering with hydration) and **Tailwind CSS v4**, and hosted on **Firebase Hosting**.

- **Pages:** Accueil · Histoire & Patrimoine · Langue arabe · Mathématiques · Physique-Chimie.
- **Language:** everything is in French, except the content of the *Langue arabe* page, which is in
  Arabic and reads right to left. The header, breadcrumb and footer stay French and left-to-right on
  every page.
- **Subject pages:** each one has a table of contents and the full programme, chapter by chapter
  (objectives, key notions, a status for each chapter). It also has key formulas, worked examples
  with folded corrections, method tips, downloadable resources (shown as «Bientôt disponible» until a
  file exists) and the overall progress of the programme.
- **Photos:** real photographs of the school, from the archive of the Frères des Écoles Chrétiennes –
  Proche-Orient ([lasalle-po.org](https://lasalle-po.org/)). They are downloaded with the school's
  approval and credited wherever they appear.

## Run it

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:4200. No backend is needed.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest via `ng test`): content integrity (only the Arabic page contains Arabic, photos credited, chapters complete) and the subject page component |
| `npm run test:e2e` | Playwright on desktop and mobile (Pixel 7), see below |
| `npm run build` | Production build. All 5 pages are prerendered into `dist/exam-platform/browser` |
| `npm run deploy` | Build, then `firebase deploy --only hosting` (set your project id in `.firebaserc` first) |

What the E2E suite checks:
- **Language and direction:** the navigation is flat and French. On the Arabic page, the article is
  `lang="ar" dir="rtl"` in Cairo, while the header stays LTR with the brand on the left. No Arabic
  text appears anywhere else.
- **Prerendering:** every page is prerendered with its content, its meta description and the school
  photos, and all six photos are served and credited.
- **Content:** the history milestones are in order with their sources. Subject pages have every
  chapter, the corrections open on demand, in-page links land below the sticky header, and the
  status table and progress bar are accessible.
- **Layout shift is zero** on every page on a fresh load. Fonts are preloaded with a fallback that
  has Inter's metrics, and photos sit in boxes of fixed proportions.
- No page overflows horizontally, and every photo loads.

## Where the content lives

Everything is typed data in `libs/site-content/src/lib/`:

| File | Content |
| --- | --- |
| `school.ts` | Name, key figures, the **history milestones** (each with its source) |
| `photos.ts` | The photo catalogue: file, size, French alt text, caption, credit, source URL |
| `subjects/arabe.ts` | Arabic page (in Arabic): context «تاريخ اللغة العربية في مصر», 6 units, worked examples, tips |
| `subjects/mathematiques.ts` | Mathematics: 6 chapters, 12 formulas, 5 worked examples, tips, resources |
| `subjects/physique-chimie.ts` | Physics & chemistry: 10 chapters, 12 formulas, 5 worked examples, tips, resources |

To keep the site up to date:
- **Chapter progress:** change a chapter's `status` to `'en-cours'` or `'termine'`. The status chip,
  table and progress bar follow.
- **Practice sheets:** put the file under `public/` (or use an https link) and set the resource's `url`.
- **Photos:** add a JPEG to `public/images/school/` and an entry to `photos.ts`, with its real width
  and height (they reserve the space and prevent layout shift) and its credit.

> **To confirm with the school.** Two dates conflict between the sources. The Khoronfish sections
> moved to Daher in 1957 according to the school, and in 1956 according to the Lasallian archive;
> the page shows both. The new buildings were inaugurated on 26 November 1955 (archive). The
> programme outlines are indicative: have each department check them against the Ministry's
> current-year syllabus.

## Architecture

```
libs/
  site-content/   Typed content model + data (French; Arabic for the Arabic page) + photo catalogue.
  site-pages/     Pages (home, history, subject) + SitePhoto; routes with per-page titles and meta.
src/app/          Shell: sticky French header (brand left, nav right; mobile menu), footer, routing.
public/images/school/   The six archive photographs (JPEG).
public/fonts/           Self-hosted Inter (variable) and Cairo (Arabic), SIL Open Font License.
e2e/              Playwright suite.
```

- **Rendering:** `outputMode: "static"`. Every route is prerendered (`app.routes.server.ts`), then
  hydrated with event replay. Firebase Hosting serves the files; unknown paths fall back to
  `index.csr.html`.
- **Direction:** `<html lang="fr" dir="ltr">` on every page. The Arabic page's `<article>` carries
  `lang="ar" dir="rtl"`, so its content, including the table of contents, mirrors and the shell
  doesn't. Layout uses logical properties only (`ms-`, `ps-`, `border-s`, `start-` and so on), never
  left/right.
- **Fonts:** Inter for French, applied to everything by default. Cairo is applied automatically to
  any `:lang(ar)` element, with a line height of 1.9 so diacritics never clip. Both are self-hosted
  at fixed URLs. Inter is preloaded on every page and Cairo on the Arabic page only.
- **Design:** Lasallian navy `#0A192F`/`#0F2C59`, antique gold `#C5A880` and cream `#F5EBE0`, on
  white. Tailwind v4 is used without preflight; the base element styles live in cascade layers in
  `styles.scss`. All text meets WCAG AA contrast.
- **Bundle:** 339 kB initial (95 kB transferred), with each page lazy-loaded.
- **Angular conventions:** standalone components (OnPush by default), zoneless, `input()` and
  `computed()`, native control flow, `NgOptimizedImage` for every photo (blur placeholder,
  `priority` on the hero), no `any`.

## History of this repository

The previous version included a timed-exam engine, a teacher CMS, roles and a Firebase backend
(Firestore rules, Cloud Functions). It was removed to keep the site simple, and is preserved under
the git tag **`archive/exam-engine-2026-10-16`**:

```bash
git checkout archive/exam-engine-2026-10-16
```
